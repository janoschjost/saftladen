import * as THREE from 'three';
import { team } from '../data/team';
import { buildCat } from '../render/catBuilder';
import { addPoliceCap, buildCharacter } from '../render/characterBuilder';
import { addKurt } from '../render/kurtBuilder';
import { addCigarette, addUmbrella } from '../render/smokeProps';
import { buildDog, type DogRig } from '../render/dogBuilder';
import { HOME_COUNT } from '../render/homeOffice';
import { Bonfire, keepOut } from './Bonfire';
import { Boombox } from './Boombox';
import { CoatRacks } from './CoatRacks';
import { buildOffice, CORRIDOR_POINT, type OfficeModel } from '../render/officeModel';
import { NAV_CELL, WORLD } from '../render/World';
import { Kitchen } from './Coffee';
import { Mail } from './Mail';
import { DOOR_CLEAR, Mess } from './Mess';
import { makePossible } from './makePossible';
import { DevEvents } from './DevEvents';
import { Dog } from './Dog';
import { resetDoorLanes } from './Door';
import { Doors } from './Doors';
import { MeetingRoom } from './Meeting';
import { Benches } from './Benches';
import { NavGrid } from './NavGrid';
import { Office, type Desk } from './Office';
import { OscarTidy, TIDIER } from './OscarTidy';
import { Person } from './Person';
import { PetCare } from './PetCare';
import { Nerf } from './Nerf';
import { PhoneBooth } from './PhoneBooth';
import { treeBlockers } from './xmasTrees';
import { blockages, type Blockage } from './placement';
import { Pod } from './Pod';
import { Presence } from './Presence';
import { Scenario } from './Scenario';
import { separate } from './separate';
import { SmokeBreaks } from './Smoke';
import { registerSimEvents } from './simEvents';
import { Social } from './Social';
import { TimeOfDay } from './TimeOfDay';
import { PhotoStudio } from './PhotoShoot';
import { ServerRack } from './ServerRack';
import { Toilets } from './Toilets';
import { Traffic } from './Traffic';
import { Walker } from './Walker';
import type { WalkColliders } from './walkCollision';
import { Weather } from './Weather';
import { Welcome } from './Welcome';
import { random } from './rng';
import { thunderClap } from './Thunder';

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
  /** an event points at somebody (a pet put into a passage, somebody starting to vape): a view selects them */
  point?: (w: Walker) => void;
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
  /** what the walk-mode player collides with; blockNav keeps the boxes in step with the furniture */
  readonly walkColliders: WalkColliders = { nav: this.nav, boxes: [], doorways: [] };
  readonly model: OfficeModel;
  readonly office: Office;
  readonly doors: Doors;
  readonly meetingRoom: MeetingRoom;
  readonly pod: Pod;
  readonly kitchen: Kitchen;
  readonly phoneBooth: PhoneBooth;
  readonly toilets: Toilets;
  readonly photoStudio: PhotoStudio;
  /** the server rack: breaks now and then, a dev comes and fixes it */
  readonly serverRack: ServerRack;
  readonly walkers: Walker[] = [];
  /** Christmas mode is on: the trees block the walk grid */
  xmas = false;
  readonly people: Person[] = [];
  /** pets (dogs and cats) */
  readonly pets: Dog[];
  readonly social = new Social();
  readonly traffic = new Traffic(this.nav);
  readonly presence: Presence;
  /** smokers stepping out onto the porch for a cigarette */
  readonly smoke: SmokeBreaks;
  /** the post: a dove or a drone brings it to the mailboxes, an apprentice carries it to a desk */
  readonly mail: Mail;
  /** what people leave lying around: cups, paper, chip bags, plates, lunchboxes, a jacket (#254) */
  readonly mess: Mess;
  /** Oscar's tidy outings in a police cap; the team leaves more mess while he is in (#296) */
  readonly tidy: OscarTidy;
  readonly tod = new TimeOfDay();
  readonly weather = new Weather();
  readonly petCare = new PetCare();
  /** the team welcoming a remote worker who came to the office */
  readonly welcome = new Welcome();
  /** states a scene instead of waiting for one: for tests and dev tools */
  readonly scenario = new Scenario(this);
  /** what a developer can set off by hand (dev panel, Aktionen sheet, `?event=`); a view adds its own to it */
  readonly events = new DevEvents();
  /** an event points at somebody; without a view nobody looks */
  readonly point: (w: Walker) => void;
  /** Nerf skirmishes: devs shoot foam darts at people on a break */
  readonly nerf: Nerf;
  /** Sandro's boombox, and Donata who takes it away */
  readonly boombox: Boombox;
  /** Elia's bonfire, and whoever puts it out */
  readonly bonfire: Bonfire;
  private stands: (w: Walker) => boolean;
  private doorsSee: () => Array<{ x: number; z: number }>;
  /** coats on the stands follow who is in the office */
  readonly coatRacks: CoatRacks;

  constructor({ scene = new THREE.Scene(), cycle, seats = {}, homes = false, portrait = () => null, stands = () => false, doorsSee = () => [], point = () => {}, prepare }: SimOptions = {}) {
    this.scene = scene;
    this.point = point;
    this.nerf = new Nerf(scene);
    this.boombox = new Boombox(scene);
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
    this.walkColliders.doorways = model.doors.map((d) => ({ x: d.center.x, z: d.center.z, r: d.width / 2 }));
    this.office = new Office(model, this.nav);
    this.doors = new Doors(model.doors);
    this.meetingRoom = new MeetingRoom(model.meeting, this.nav);
    this.office.benches = new Benches(model.benches, this.nav, this.meetingRoom, this.office);
    this.pod = new Pod(model.pod, this.nav);
    this.kitchen = new Kitchen(model.kitchen, this.nav);
    this.phoneBooth = new PhoneBooth(model.phoneBooth, this.nav);
    this.phoneBooth.onClosed = (closed) => this.doors.setLocked(this.phoneBooth.doorPos, closed);
    this.meetingRoom.onClosed = (closed) => this.doors.setLocked(this.meetingRoom.doorPos, closed);
    this.toilets = new Toilets(model.toilets, this.nav);
    this.toilets.onLocked = (cabin, locked) => this.doors.setLocked(cabin.doorPos, locked);
    this.toilets.onOccupied = (cabin, occupied) => model.toilets.cabins[this.toilets.cabins.indexOf(cabin)]?.sign.color.setHex(occupied ? 0xe0342c : 0x3fbf5a);
    this.photoStudio = new PhotoStudio(model.photoStudio, this.nav);
    this.serverRack = new ServerRack(
      model.serverRack,
      scene,
      this.nav,
      (p) => this.pull(p),
      (p) => p.boothCall || this.toilets.queue.some((w) => w.person === p) || this.toilets.cabins.some((c) => c.session?.person === p),
    );
    this.spawn(seats, portrait);
    this.bonfire = new Bonfire(scene, this.nav, keepOut(model, this.office.desks));
    this.pets = this.walkers.filter((w): w is Dog => w instanceof Dog);
    this.coatRacks = new CoatRacks(model.coatRacks, this.people);
    this.presence = new Presence(this.people, this.tod, this.weather);
    this.presence.seed(homes);
    this.smoke = new SmokeBreaks(this.people, this.presence, this.weather);
    this.mail = new Mail(scene, this.people, this.presence, this.weather, (p) => this.deskFor(p));
    this.mess = new Mess(scene, model.mess, this.nav, this.traffic.passages, {
      desks: this.office.desks,
      keepOff: () => this.messKeepOff(),
      racks: () => model.coatRacks.filter((r) => r.root.visible).map((r) => r.root.getWorldPosition(new THREE.Vector3())),
      kitchen: model.kitchen.center,
      boost: () => this.tidy.messBoost,
    });
    this.tidy = new OscarTidy(this);
    for (const pet of this.pets) if (pet.owner.presence === 'out' || !pet.comesToday) pet.sendAway(); // pets of people who start away, and pets that stay home today
    this.coatRacks.update();
    this.events.forcer = (run) => makePossible(this, run);
    registerSimEvents(this);
  }

  /** Walls and furniture as they stand now become what nobody can walk through. */
  blockNav(): void {
    this.nav.clear();
    const blockers = [...this.model.blockers(), ...(this.xmas ? treeBlockers() : [])];
    this.nav.blockBoxes(blockers);
    this.walkColliders.boxes = blockers;
    this.nav.sealUnreachable(CORRIDOR_POINT);
    this.traffic.rebuild();
  }

  /** Christmas mode: the trees are obstacles while it is on. Whoever stands where a tree appears moves to the nearest free spot (#288). */
  setXmas(on: boolean): void {
    if (on === this.xmas) return;
    this.xmas = on;
    this.relayout();
    for (const w of this.walkers) {
      const c = this.nav.toCell(w.pos);
      if (this.nav.walkable(c.cx, c.cz)) continue;
      const free = this.nav.nearestWalkable(w.pos, 10);
      if (!free) continue;
      w.pos.x = free.x;
      w.pos.z = free.z;
      w.prev.x = free.x;
      w.prev.z = free.z;
    }
  }

  /** The furniture moved (room editor): everything derived from its place follows. */
  relayout(): void {
    this.blockNav();
    this.office.relayout(this.nav);
    this.meetingRoom.relayout(this.nav);
    this.office.benches?.relayout(this.nav);
    this.pod.relayout(this.nav);
    this.kitchen.relayout(this.nav);
    this.phoneBooth.relayout(this.nav);
    this.toilets.relayout(this.nav);
    this.photoStudio.relayout(this.nav);
    this.serverRack.relayout(this.nav);
  }

  /** scratch grid for `blocked` */
  private scratch: NavGrid | null = null;

  /** What the furniture where it stands now cuts off (seats, places, doors; see `placement.ts`); empty when nothing. */
  blocked(): Blockage[] {
    return blockages(this, (this.scratch ??= new NavGrid(this.nav.cols, this.nav.rows, this.nav.cell)));
  }

  /** Dev: ids of the people and pets that are out of the sim right now. */
  get removedIds(): string[] {
    return [...this.people.filter((p) => this.presence.isRemoved(p)), ...this.pets.filter((d) => d.removed)].map((w) => w.id);
  }

  /**
   * Dev: takes a person or pet out of the sim (what they do ends cleanly: desk, meeting seat, kitchen, conversation
   * are freed; they vanish and are off the schedule) or brings them back into today's plan. Returns a status text, or
   * null for an unknown id.
   */
  setRemoved(id: string, removed: boolean): string | null {
    const person = this.people.find((p) => p.id === id);
    const pet = person ? undefined : this.pets.find((d) => d.id === id);
    if (!person && !pet) return null;
    const name = person ? person.member.name : pet!.name;
    if (!removed) {
      if (person) this.presence.restore(person);
      else pet!.removed = false;
      return `${name} ist wieder dabei`;
    }
    if (person) {
      person.held = false;
      this.pull(person);
      this.presence.remove(person);
    } else {
      pet!.held = false;
      pet!.removed = true;
    }
    return `${name} ist raus`;
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
      if (m.smoke) addCigarette(rig);
      addUmbrella(rig, m.id);
      if (m.id === TIDIER) addPoliceCap(rig);
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
            visits: m.dogVisits,
          }),
        );
      }
      for (const [i, { kind, name, visits }] of (m.cats ?? []).entries()) {
        const side = i % 2 ? 1 : -1;
        add(
          new Dog(name, buildCat(kind), person, this.petStart(person, side, -1), {
            id: `cat-${person.id}-${i}`,
            label: 'Bürokatze',
            portrait: portrait(`cat:${kind}`, () => buildCat(kind)),
            speed: 2.0 + i * 0.2,
            radius: 0.2,
            side,
            visits,
          }),
        );
      }
    }
  }

  petStart(owner: Person, dx: number, dz: number): { x: number; z: number } {
    return this.nav.nearestWalkable({ x: owner.pos.x + dx * 0.8, z: owner.pos.z + dz * 0.8 }, 6) ?? { ...owner.pos };
  }

  /** Somebody by their id in the team data (`donata-manser`); an unknown id throws. */
  person(id: string): Person {
    const p = this.people.find((o) => o.id === id);
    if (!p) throw new Error(`nobody is called "${id}"`);
    return p;
  }

  /** Pulls a person out of whatever they are doing (talk, desk, printer, meeting), so something else can take over. */
  drop(p: Person): void {
    this.social.leave(p);
    p.interrupt();
  }

  /**
   * The player's card sends somebody home or out: whatever they are doing (talk, meeting, printer, coffee, call, WC)
   * is dropped first, like `actions.force` does for the dev events. False, and nothing touched, when `Presence.refusal`
   * says no (a scene holds them, no home office is free) or they are still steered.
   */
  sendNow(p: Person, kind: 'home' | 'errand'): boolean {
    if (p.controlled || this.presence.refusal(p, kind)) return false;
    const meeting = this.meetingRoom.current;
    meeting?.release(p, this.nav); // its door is shut while it runs: it opens for them, the others keep sitting
    this.pull(p);
    return this.presence.send(p, kind, this.nav);
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

  /** Spots on the floor mess keeps off (#254): doorways aside, where people sit, stand at something or gather. */
  private messKeepOff(): Array<{ x: number; z: number; r: number }> {
    const m = this.model;
    const at = (r: number) => (p: { x: number; z: number }) => ({ x: p.x, z: p.z, r });
    return [
      ...m.doors.map((d) => ({ x: d.center.x, z: d.center.z, r: DOOR_CLEAR })),
      ...this.office.desks.flatMap((d) => [d.seat, d.approach]).map(at(0.5)),
      ...this.kitchen.seats.flatMap((s) => [s.seat, s.approach]).map(at(0.5)),
      ...m.kitchen.stands.map(at(0.5)),
      at(1.1)(m.kitchen.center),
      ...(this.office.printer ? [at(0.6)(this.office.printer.stand)] : []),
      ...m.foosball.map(at(0.6)),
      ...m.meeting.seats.map(at(0.5)),
      ...m.pod.seats.map(at(0.5)),
      at(0.6)(m.phoneBooth.seat),
      ...m.toilets.wait.map(at(0.6)),
      at(0.6)(m.photoStudio.stand),
      at(0.6)(m.photoStudio.seat),
      at(0.6)(m.serverRack.stand),
    ];
  }

  /** One simulation step: everybody decides and moves, the rooms follow, nobody ends up inside somebody else or a wall. */
  step(dt: number): void {
    this.presence.update(dt, this.nav);
    this.smoke.update(dt, this.nav);
    this.traffic.update(dt, this.walkers);
    for (const p of this.people) {
      if (p.chill > 0) p.chill = Math.max(0, p.chill - dt);
      if (p.startle > 0) p.startle = Math.max(0, p.startle - dt);
    }
    if (this.weather.takeThunder()) thunderClap(this.people);
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
    this.nerf.update(dt, this.people, this.nav);
    this.boombox.update(dt, this.people, this.nav, this.presence.days);
    this.bonfire.update(dt, this.people, this.tod.night);
    this.mail.update(dt, this.nav, this.presence.days);
    this.mess.update(dt, this.presence.days, this.people, this.presence);
    this.tidy.update(dt);
    this.meetingRoom.update(dt, this.people, this.nav, this.tod.hour);
    this.office.benches?.update(dt, this.people);
    this.pod.update(dt, this.people, this.nav);
    this.kitchen.update(dt, this.people, this.nav);
    this.phoneBooth.update(dt, this.people, this.nav);
    this.toilets.update(dt, this.people, this.nav);
    this.photoStudio.update(dt, this.nav);
    this.serverRack.update(dt, this.people, this.nav);
    this.doors.update(dt, [...this.walkers.filter((w) => !w.away).map((w) => ({ x: w.pos.x, z: w.pos.z, path: w.doorPath ?? undefined })), ...this.doorsSee()]);
    this.coatRacks.update();
    // everybody outdoors holds an umbrella in the rain; it is shut before the doorframe
    for (const p of this.people) p.updateUmbrella(dt, this.weather.raining);
    this.separate();
    this.separate();
    this.separate();
    // appearing at and vanishing from the door takes time, and arriving waits for it: the view only adds the sparkle
    for (const w of this.walkers) w.stepFx(dt);
  }

  /** Soft collision: push overlapping walkers apart and keep them on the floor. */
  private separate(): void {
    separate(this.walkers, this.nav, WORLD.width, WORLD.depth);
  }
}
