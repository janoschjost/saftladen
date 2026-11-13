import * as THREE from 'three';
import { team } from '../data/team';
import { buildCat } from '../render/catBuilder';
import { buildCharacter } from '../render/characterBuilder';
import { addKurt } from '../render/kurtBuilder';
import { buildDog, type DogRig } from '../render/dogBuilder';
import { HOME_COUNT } from '../render/homeOffice';
import { CoatRacks } from './CoatRacks';
import { buildOffice, CORRIDOR_POINT, type OfficeModel } from '../render/officeModel';
import { NAV_CELL, WORLD } from '../render/World';
import { Kitchen } from './Coffee';
import { Dog } from './Dog';
import { resetDoorLanes } from './Door';
import { Doors } from './Doors';
import { MeetingRoom } from './Meeting';
import { NavGrid } from './NavGrid';
import { Office, type Desk } from './Office';
import { Person } from './Person';
import { PetCare } from './PetCare';
import { PhoneBooth } from './PhoneBooth';
import { Pod } from './Pod';
import { Presence } from './Presence';
import { Scenario } from './Scenario';
import { Social } from './Social';
import { TimeOfDay } from './TimeOfDay';
import { Toilets } from './Toilets';
import { Traffic } from './Traffic';
import { Walker } from './Walker';
import { Weather } from './Weather';
import { Welcome } from './Welcome';
import { random } from './rng';

const BODY_RADIUS = 0.2; // how close to a wall a walker may get (nav cells are 0.5 m)

export interface SimOptions {
  /** the scene the office and everybody in it are built into; a view draws it, a test ignores it */
  scene?: THREE.Scene;
  /** where on the day/night cycle to start (0..1), before anybody's day is planned */
  cycle?: number;
  /** fixed desks by person id */
  seats?: Record<string, number>;
  /** all eight home offices are taken from the start (`#homes`, for a look at the rooms) */
  homes?: boolean;
  /** picture of a pet for the UI, from a fresh rig; a view renders one, without a view pets have none */
  portrait?: (key: string, build: () => DogRig) => string | null;
  /** somebody who stands still this step instead of acting (the view's disco and angry easter eggs) */
  stands?: (w: Walker) => boolean;
  /** where else somebody stands whom the interior doors open for (the player's eye in the walk view) */
  doorsSee?: () => Array<{ x: number; z: number }>;
  /** called with the built office before anything is derived from where its furniture stands (the room editor moves it) */
  prepare?: (model: OfficeModel) => void;
}

/**
 * The office and everybody in it, without a renderer, a camera or the DOM: who is where, what they do, and `step`
 * to move it on. `Game` puts the view and the input on top; a Vitest test runs it alone (with the canvas stand-in of
 * `src/test/headlessDom.ts`, as the builders paint textures).
 */
export class Sim {
  readonly scene: THREE.Scene;
  readonly nav = new NavGrid(Math.ceil(WORLD.width / NAV_CELL), Math.ceil(WORLD.depth / NAV_CELL), NAV_CELL);
  readonly model: OfficeModel;
  readonly office: Office;
  readonly doors: Doors;
  readonly meetingRoom: MeetingRoom;
  readonly pod: Pod;
  readonly kitchen: Kitchen;
  readonly phoneBooth: PhoneBooth;
  readonly toilets: Toilets;
  readonly walkers: Walker[] = [];
  readonly people: Person[] = [];
  /** pets (dogs and cats) */
  readonly pets: Dog[];
  readonly social = new Social();
  readonly traffic = new Traffic(this.nav);
  readonly presence: Presence;
  readonly tod = new TimeOfDay();
  readonly weather = new Weather();
  readonly petCare = new PetCare();
  /** the team welcoming a remote worker who came to the office */
  readonly welcome = new Welcome();
  /** states a scene instead of waiting for one: for tests and dev tools */
  readonly scenario = new Scenario(this);
  private stands: (w: Walker) => boolean;
  private doorsSee: () => Array<{ x: number; z: number }>;
  /** coats on the stands follow who is in the office */
  readonly coatRacks: CoatRacks;

  constructor({ scene = new THREE.Scene(), cycle, seats = {}, homes = false, portrait = () => null, stands = () => false, doorsSee = () => [], prepare }: SimOptions = {}) {
    this.scene = scene;
    this.stands = stands;
    this.doorsSee = doorsSee;
    resetDoorLanes();
    if (cycle !== undefined) {
      this.tod.setCycle(cycle);
      this.tod.night = this.tod.day < 0.45;
    }
    const model = (this.model = buildOffice(scene));
    prepare?.(model);
    this.blockNav();
    this.office = new Office(model, this.nav);
    this.doors = new Doors(model.doors);
    this.meetingRoom = new MeetingRoom(model.meeting, this.nav);
    this.pod = new Pod(model.pod, this.nav);
    this.kitchen = new Kitchen(model.kitchen, this.nav);
    this.phoneBooth = new PhoneBooth(model.phoneBooth, this.nav);
    this.phoneBooth.onClosed = (closed) => this.doors.setLocked(this.phoneBooth.doorPos, closed);
    this.meetingRoom.onClosed = (closed) => this.doors.setLocked(this.meetingRoom.doorPos, closed);
    this.toilets = new Toilets(model.toilets, this.nav);
    this.toilets.onLocked = (cabin, locked) => this.doors.setLocked(cabin.doorPos, locked);
    this.toilets.onOccupied = (cabin, occupied) => model.toilets.cabins[this.toilets.cabins.indexOf(cabin)]?.sign.color.setHex(occupied ? 0xe0342c : 0x3fbf5a);
    this.spawn(seats, portrait);
    this.pets = this.walkers.filter((w): w is Dog => w instanceof Dog);
    this.coatRacks = new CoatRacks(model.coatRacks, this.people);
    this.presence = new Presence(this.people, this.tod, this.weather);
    this.presence.seed(homes);
    for (const pet of this.pets) if (pet.owner.presence === 'out') pet.sendAway(); // pets of people who start away
    this.coatRacks.update();
  }

  /** Walls and furniture as they stand now become what nobody can walk through. */
  blockNav(): void {
    this.nav.clear();
    for (const b of this.model.blockers()) this.nav.blockWorld(b.min.x, b.min.z, b.max.x, b.max.z);
    this.nav.sealUnreachable(CORRIDOR_POINT);
    this.traffic.rebuild();
  }

  /** The furniture moved (room editor): everything derived from its place follows. */
  relayout(): void {
    this.blockNav();
    this.office.relayout(this.nav);
    this.meetingRoom.relayout(this.nav);
    this.pod.relayout(this.nav);
    this.kitchen.relayout(this.nav);
    this.phoneBooth.relayout(this.nav);
    this.toilets.relayout(this.nav);
  }

  private spawn(seats: Record<string, number>, portrait: NonNullable<SimOptions['portrait']>): void {
    const free = () => {
      const { cx, cz } = this.nav.randomWalkable();
      return this.nav.center(cx, cz);
    };
    const add = (w: Walker) => {
      this.walkers.push(w);
      this.scene.add(w.root);
    };
    for (const [index, m] of team.entries()) {
      const rig = buildCharacter(m.look);
      if (m.alterEgo) addKurt(rig);
      const person = new Person(m, rig, free());
      person.office = this.office;
      person.kitchen = this.kitchen;
      this.office.people.push(person);
      person.preferredHome = index % HOME_COUNT;
      const seat = seats[m.id];
      if (seat) this.office.assign(person, seat);
      if (random() < 0.8) {
        const desk = this.office.claim(person, false);
        if (desk) person.sitAt(desk);
      }
      this.people.push(person);
      add(person);
      if (m.dog) {
        add(
          new Dog(m.dogName ?? `Hund von ${m.name}`, buildDog(m.dog), person, this.petStart(person, 1, 1), {
            portrait: portrait(`dog:${m.dog}`, () => buildDog(m.dog!)),
          }),
        );
      }
      for (const [i, { kind, name }] of (m.cats ?? []).entries()) {
        const side = i % 2 ? 1 : -1;
        add(
          new Dog(name, buildCat(kind), person, this.petStart(person, side, -1), {
            id: `cat-${person.id}-${i}`,
            label: 'Bürokatze',
            portrait: portrait(`cat:${kind}`, () => buildCat(kind)),
            speed: 2.0 + i * 0.2,
            radius: 0.2,
            side,
          }),
        );
      }
    }
  }

  petStart(owner: Person, dx: number, dz: number): { x: number; z: number } {
    return this.nav.nearestWalkable({ x: owner.pos.x + dx * 0.8, z: owner.pos.z + dz * 0.8 }, 6) ?? { ...owner.pos };
  }

  /** Pulls a person out of whatever they are doing (talk, desk, printer, meeting), so something else can take over. */
  drop(p: Person): void {
    this.social.leave(p);
    p.interrupt();
  }

  /**
   * Out of everything at once, wherever they sit or queue: talk, desk, printer, meeting, phone box, pod, WC. `drop`
   * lets a seated meeting member walk out; this does not wait for that.
   */
  pull(p: Person): void {
    this.drop(p);
    p.cancelMeet();
    p.boothCall = false;
    p.talk = null;
    p.speaking = false;
  }

  /** The desk `seat` takes for `p`: their own, else where they already work, else the first free one. */
  deskFor(p: Person): Desk | null {
    const working = p.task?.phase === 'work' ? p.task.desk : null;
    return p.homeDesk ?? working ?? this.office.desks.find((k) => !k.occupant) ?? null;
  }

  /**
   * Sits `p` down at once at `deskFor(p)`. Somebody sitting there is asked to move (a scene's pin on them ends);
   * somebody only on the way there looks for another one. Returns the desk, null when there is none. Somebody who
   * cannot sit right now (in a meeting, steered by the player) is not seated.
   */
  seat(p: Person): Desk | null {
    const desk = this.deskFor(p);
    if (!desk) return null;
    this.social.leave(p);
    if (p.task?.desk === desk && p.task.phase === 'work') return desk;
    p.interrupt();
    const o = desk.occupant;
    if (o && o !== p) {
      if (o.task?.desk === desk && o.task.phase !== 'approach') {
        o.unpin();
        o.evictFromDesk(desk);
      } else if (o.run?.desk === desk) o.run.desk = null; // kept free for after a coffee run
      else if (o.task?.desk === desk) o.interrupt(); // on the way there
      this.office.release(desk, o);
    }
    if (desk.pending === p) desk.pending = null;
    p.sitDownAt(desk);
    return desk;
  }

  /** One simulation step: everybody decides and moves, the rooms follow, nobody ends up inside somebody else or a wall. */
  step(dt: number): void {
    this.presence.update(dt, this.nav);
    this.traffic.update(dt, this.walkers);
    for (const w of this.walkers) {
      w.traffic ??= this.traffic;
      if (this.stands(w)) {
        w.moving += (0 - w.moving) * 0.25;
        continue;
      }
      w.update(dt, this.nav, this.walkers);
    }
    this.social.update(dt, this.people, this.nav, this.traffic);
    this.welcome.update(dt, this.people, this.presence, this.social);
    this.petCare.update(dt, this.people, this.pets, this.nav);
    this.meetingRoom.update(dt, this.people, this.nav, this.tod.hour);
    this.pod.update(dt, this.people, this.nav);
    this.kitchen.update(dt, this.people, this.nav);
    this.phoneBooth.update(dt, this.people, this.nav);
    this.toilets.update(dt, this.people, this.nav);
    this.doors.update(dt, [...this.walkers.filter((w) => !w.away).map((w) => w.pos), ...this.doorsSee()]);
    this.coatRacks.update();
    this.separate();
    this.separate();
    this.separate();
    // appearing at and vanishing from the door takes time, and arriving waits for it: the view only adds the sparkle
    for (const w of this.walkers) w.stepFx(dt);
  }

  /** Soft collision: push overlapping walkers apart and keep them on the floor. */
  private separate(): void {
    const ws = this.walkers;
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i];
        const b = ws[j];
        if (a.away || b.away || a.ignores(b) || a.fixed || b.fixed) continue;
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 1.1;
        let d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        if (d2 < 1e-8) {
          // exactly on top of each other (same destination spot): part them in a fixed direction per pair
          dx = Math.cos(i * 2.4 + j) * 1e-3;
          dz = Math.sin(i * 2.4 + j) * 1e-3;
          d2 = dx * dx + dz * dz;
        }
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        const wa = a.held ? 0 : b.held ? 2 : 1;
        const wb = b.held ? 0 : a.held ? 2 : 1;
        a.pos.x -= dx * push * wa;
        a.pos.z -= dz * push * wa;
        b.pos.x += dx * push * wb;
        b.pos.z += dz * push * wb;
      }
    }
    for (const w of ws) {
      if (w.away || w.fixed) continue; // scripted walkers (door, desk) move through walls on purpose
      w.pos.x = THREE.MathUtils.clamp(w.pos.x, 0.4, WORLD.width - 0.4);
      w.pos.z = THREE.MathUtils.clamp(w.pos.z, 0.4, WORLD.depth - 0.4);
      // walls, windows and furniture are solid (seated people are scripted into their chair and skip this)
      if (!w.held) this.nav.resolve(w.pos, Math.min(w.radius, BODY_RADIUS));
    }
  }
}
