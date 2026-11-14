import type { OfficeModel } from '../render/officeModel';
import type { MeetSeat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';
import { random } from './rng';

const FIRST = { min: 20, max: 50 }; // seconds after game start
const PAUSE = { min: 25, max: 70 }; // seconds between two toilet trips
const STAY = { min: 20, max: 50 }; // seconds on the toilet, playing
const GATHER_TIMEOUT = 45;
/** at most this many wait in front of the cabins */
export const QUEUE_MAX = 2;
const PATIENCE = { min: 25, max: 45 }; // seconds somebody waits in the queue before giving up
const REACTION_GAP = { min: 4, max: 9 };
const REACTION_TIME = 1.6;
const REACTIONS = ['♪', '!', '😄', '!?'];
const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

/** One person on the toilet, playing the handheld behind the locked door. Reuses the meeting-seat logic (walk, sit down, stand up). */
export class ToiletSession implements Talk {
  readonly kind: ConversationKind = 'chat';
  members: Person[];
  speaker: Person;
  /** short reaction to the game (bubble), '' when quiet */
  text = '';
  private time = 0;
  private seatedTime = 0;
  private stay = between(STAY);
  private ending = false;
  private reactIn = between(REACTION_GAP);
  private reactLeft = 0;

  constructor(
    readonly person: Person,
    readonly center: Vec2,
  ) {
    this.members = [person];
    this.speaker = person;
  }

  /** sitting on the toilet and playing: the door is locked */
  get seated(): boolean {
    return !this.ending && (this.members[0]?.meetSeated ?? false);
  }

  /** false once the person has left the cabin (or was pulled out) */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inMeeting);
    const p = this.members[0];
    if (!p) {
      this.person.gameboyOn = false;
      return false;
    }
    this.time += dt;
    const seated = this.seated;
    p.gameboyOn = seated;
    if (seated) {
      this.seatedTime += dt;
      if (this.reactLeft > 0 && (this.reactLeft -= dt) <= 0) this.text = '';
      if ((this.reactIn -= dt) <= 0) {
        this.reactIn = between(REACTION_GAP);
        this.reactLeft = REACTION_TIME;
        this.text = REACTIONS[Math.floor(random() * REACTIONS.length)];
      }
    }
    if (!this.ending && (this.seatedTime > this.stay || this.time > GATHER_TIMEOUT + this.stay)) this.end();
    return true;
  }

  private end(): void {
    this.ending = true;
    this.text = '';
    for (const m of this.members) {
      m.gameboyOn = false;
      m.dismissMeeting();
    }
  }

  abort(): void {
    this.end();
  }
}

/** A WC cabin: the seat on the bowl, the door, and who is in there. */
export interface Cabin {
  seat: MeetSeat;
  doorPos: Vec2;
  session: ToiletSession | null;
}

/** Somebody waiting in front of the cabins until one is free. */
export interface Waiter {
  person: Person;
  /** keeps them out of chats and other jobs while they wait, they face `center` (the cabins) */
  talk: Talk;
  spot: Vec2;
  patience: number;
}

/** What `Toilets.go` did with somebody. */
export type ToiletVisit = 'cabin' | 'queue' | null;

/**
 * The WC cabins in the washroom: now and then somebody goes, sits down and plays the handheld for a while behind the
 * locked door. One person per cabin; when all are taken the next one queues in front (and gives up after a while).
 */
export class Toilets {
  readonly cabins: Cabin[] = [];
  readonly queue: Waiter[] = [];
  private waitSpots: Vec2[] = [];
  private timer = between(FIRST);
  /** a cabin was taken (true: light red) or freed (false: green) */
  onOccupied: (cabin: Cabin, occupied: boolean) => void = () => {};
  /** the cabin door should be locked shut (true, somebody sits inside) or released (false) */
  onLocked: (cabin: Cabin, locked: boolean) => void = () => {};
  private occupied = new Map<Cabin, boolean>();
  private locked = new Map<Cabin, boolean>();

  constructor(
    private model: OfficeModel['toilets'],
    nav: NavGrid,
  ) {
    for (const c of model.cabins) {
      const approach = this.approachFor(c, nav) ?? { x: c.doorPos.x, z: c.doorPos.z + 0.6 };
      this.cabins.push({ seat: { seat: { x: c.seat.x, z: c.seat.z }, approach, yaw: c.seat.yaw, occupant: null }, doorPos: c.doorPos, session: null });
    }
    this.waitSpots = this.spotsFor(nav);
  }

  /** First free cell in front of the cabin door, where people walk to before stepping in. */
  private approachFor(c: OfficeModel['toilets']['cabins'][number], nav: NavGrid): Vec2 | null {
    const front = { x: Math.sin(c.seat.yaw), z: Math.cos(c.seat.yaw) }; // the door is in front of the seat
    for (const dist of [0.6, 0.8, 1.0]) {
      const p = { x: c.doorPos.x + front.x * dist, z: c.doorPos.z + front.z * dist };
      const cell = nav.toCell(p);
      if (nav.walkable(cell.cx, cell.cz)) return p;
    }
    return nav.nearestWalkable({ x: c.doorPos.x + front.x * 0.8, z: c.doorPos.z + front.z * 0.8 }, 3);
  }

  private spotsFor(nav: NavGrid): Vec2[] {
    return this.model.wait.map((w) => {
      const c = nav.toCell(w);
      return nav.walkable(c.cx, c.cz) ? { ...w } : (nav.nearestWalkable(w, 4) ?? { ...w });
    });
  }

  /** The nav grid was rebuilt (room editor): standing spots follow. */
  relayout(nav: NavGrid): void {
    this.cabins.forEach((cabin, i) => {
      const a = this.approachFor(this.model.cabins[i], nav);
      if (a) {
        cabin.seat.approach.x = a.x;
        cabin.seat.approach.z = a.z;
      }
    });
    this.waitSpots = this.spotsFor(nav);
  }

  /** Is somebody in (or on the way into) this cabin? */
  isOccupied(cabin: Cabin): boolean {
    return !!cabin.session || !!cabin.seat.occupant;
  }

  /** A cabin is free, or there is still a place to wait in front. */
  get hasRoom(): boolean {
    return this.cabins.some((c) => !this.isOccupied(c)) || (this.queue.length < QUEUE_MAX && this.waitSpots.length > 0);
  }

  /** Sends `person` (already dropped from desk / conversation) to the toilet: into a free cabin, else into the queue. Null when the queue is full too. */
  go(person: Person, nav: NavGrid): ToiletVisit {
    if (!this.hasRoom || this.queue.some((w) => w.person === person) || this.cabins.some((c) => c.session?.person === person)) return null;
    const cabin = this.cabins.find((c) => !this.isOccupied(c));
    if (cabin) {
      this.enter(cabin, person, nav);
      return 'cabin';
    }
    const spot = this.waitSpots.find((s) => !this.queue.some((w) => w.spot === s)) ?? this.waitSpots[0];
    const center = this.cabins.length ? { x: this.cabins.reduce((s, c) => s + c.doorPos.x, 0) / this.cabins.length, z: this.cabins[0].doorPos.z } : spot;
    const talk: Talk = { kind: 'chat', center, members: [person] };
    this.queue.push({ person, talk, spot, patience: between(PATIENCE) });
    person.queueAt(nav, spot, talk);
    return 'queue';
  }

  private enter(cabin: Cabin, person: Person, nav: NavGrid): void {
    const session = new ToiletSession(person, cabin.seat.seat);
    cabin.session = session;
    person.callToMeeting(nav, cabin.seat, session);
  }

  private set(map: Map<Cabin, boolean>, cabin: Cabin, value: boolean, fn: (c: Cabin, v: boolean) => void): void {
    if ((map.get(cabin) ?? false) === value) return;
    map.set(cabin, value);
    fn(cabin, value);
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    for (const cabin of this.cabins) {
      if (cabin.session && !cabin.session.update(dt)) cabin.session = null;
      this.set(this.occupied, cabin, this.isOccupied(cabin), this.onOccupied);
      this.set(this.locked, cabin, !!cabin.session?.seated, this.onLocked);
    }
    this.updateQueue(dt, nav);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.task && !p.inMeeting && !p.printJob && !p.foosJob && !p.vapeJob && !p.phoneJob && !p.snackLeft && !p.run && !p.coffeeJob && !p.cupHeld && p.sit < 0.05);
    if (!free.length) return;
    if (this.go(free[Math.floor(random() * free.length)], nav)) this.timer = between(PAUSE);
  }

  private updateQueue(dt: number, nav: NavGrid): void {
    for (const w of [...this.queue]) {
      const p = w.person;
      // pulled away (dragged, steered, sent home, a dev event took over): no longer waiting
      if (p.talk !== w.talk || p.held || p.controlled || p.presence !== 'in') {
        this.leaveQueue(w);
        continue;
      }
      // patience runs out while standing in the queue (or stuck), not on the long walk there
      if (p.state !== 'walk' || Math.hypot(w.spot.x - p.pos.x, w.spot.z - p.pos.z) < 1.5) w.patience -= dt;
      if (w.patience <= 0) {
        // waited long enough: go and do something else
        this.leaveQueue(w);
        p.talk = null;
        p.timer = 0.3 + random();
        continue;
      }
      if (w !== this.queue[0]) {
        if (p.state === 'idle' && Math.hypot(w.spot.x - p.pos.x, w.spot.z - p.pos.z) > 0.6) p.queueAt(nav, w.spot, w.talk);
        continue;
      }
      const cabin = this.cabins.find((c) => !this.isOccupied(c));
      if (cabin) {
        this.leaveQueue(w);
        p.talk = null;
        this.enter(cabin, p, nav);
      } else if (p.state === 'idle' && Math.hypot(w.spot.x - p.pos.x, w.spot.z - p.pos.z) > 0.6) p.queueAt(nav, w.spot, w.talk);
    }
  }

  private leaveQueue(w: Waiter): void {
    const i = this.queue.indexOf(w);
    if (i >= 0) this.queue.splice(i, 1);
  }

  /** Empties every cabin and the queue (dev event, game reset). */
  abort(): void {
    for (const w of [...this.queue]) {
      this.leaveQueue(w);
      if (w.person.talk === w.talk) w.person.talk = null;
    }
    for (const c of this.cabins) c.session?.abort();
  }
}
