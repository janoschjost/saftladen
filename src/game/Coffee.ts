import type { OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { MeetSeat } from './Meeting';
import type { Person } from './Person';
import { nextSpeaker, type ConversationKind, type Talk } from './Social';

/** Where one person stands in the kitchen coffee circle. */
export interface CoffeeSpot {
  stand: Vec2;
  /** facing the middle of the circle */
  yaw: number;
  occupant: Person | null;
}

/** One of the spots in front of the espresso machine. */
export interface MachineSpot {
  index: number;
  stand: Vec2;
  /** facing the machine */
  yaw: number;
}

const FIRST = { min: 30, max: 60 }; // seconds after game start
const PAUSE = { min: 90, max: 180 }; // seconds between two coffee breaks
const STAY = { min: 25, max: 45 }; // seconds the group chats once everybody holds a cup
const GROUP = { min: 2, max: 2 }; // only two people stand in the kitchen at a time
const RING = 0.75; // metres from the circle centre to each person
const GATHER_TIMEOUT = 60;
const TABLE_FIRST = { min: 20, max: 50 };
const TABLE_PAUSE = { min: 40, max: 100 };
const TABLE_STAY = { min: 25, max: 55 }; // seconds the sitters stay once all of them sit
const TABLE_GATHER = 50;
const BUBBLES = ['…', '…', '!', '?'];

const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

/** A few people drinking a coffee together in the kitchen: walk over, stand in a circle with a cup, chat, leave together. */
export class CoffeeBreak implements Talk {
  readonly kind: ConversationKind = 'chat';
  phase: 'gather' | 'chat' | 'leaving' = 'gather';
  speaker: Person;
  text = '…';
  private time = 0;
  private speakerTimer = 0;
  private previous: Person | null = null;
  private readonly stay = between(STAY);

  constructor(
    public members: Person[],
    readonly center: Vec2,
  ) {
    this.speaker = members[0];
  }

  /** false once everybody has left */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inCoffee);
    if (this.members.length === 0) return false;
    this.time += dt;

    if (this.phase === 'gather') {
      if (this.members.length < 2) return this.end();
      if (this.members.every((m) => m.coffeeReady)) {
        this.phase = 'chat';
        this.time = 0;
      } else if (this.time > GATHER_TIMEOUT) {
        for (const m of this.members) if (!m.coffeeReady) m.cancelCoffee();
      }
      return true;
    }

    if (this.phase === 'chat') {
      this.speakerTimer -= dt;
      if (this.speakerTimer <= 0) {
        const next = nextSpeaker(this.members, this.speaker, this.previous);
        this.previous = this.speaker;
        this.speaker = next;
        this.speakerTimer = 2 + Math.random() * 3;
        this.text = BUBBLES[Math.floor(Math.random() * BUBBLES.length)];
        for (const m of this.members) m.speaking = m === this.speaker;
      }
      if (this.time >= this.stay || this.members.length < 2) this.end();
    }
    return true;
  }

  /** Everybody lowers the cup and goes. */
  end(): boolean {
    this.phase = 'leaving';
    for (const m of this.members) {
      m.speaking = false;
      m.dismissCoffee();
    }
    return true;
  }
}

/** One to three people sitting at the dining table for a while. */
export class TableSession implements Talk {
  readonly kind: ConversationKind = 'chat';
  private time = 0;
  private seatedTime = 0;
  private readonly stay = between(TABLE_STAY);
  private ending = false;

  constructor(
    public members: Person[],
    readonly center: Vec2,
  ) {}

  /** false once everybody has left */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inMeeting);
    if (this.members.length === 0) return false;
    this.time += dt;
    if (this.members.every((m) => m.meetSeated)) this.seatedTime += dt;
    if (!this.ending && (this.seatedTime > this.stay || this.time > TABLE_GATHER + this.stay)) {
      this.ending = true;
      for (const m of this.members) m.dismissMeeting();
    }
    return true;
  }
}

/** The kitchen: scheduler for coffee breaks. */
export class Kitchen {
  current: CoffeeBreak | null = null;
  private timer = between(FIRST);
  /** who stands at each of the machine spots right now */
  private users: Array<Person | null> = [];

  /** benches at the dining table */
  readonly seats: MeetSeat[] = [];
  table: TableSession | null = null;
  private tableTimer = between(TABLE_FIRST);
  private seatSources = new Map<MeetSeat, OfficeModel['kitchen']['table'][number]>();

  constructor(
    private model: OfficeModel['kitchen'],
    nav: NavGrid,
  ) {
    for (const s of model.table) {
      const seat = this.seatFor(s, nav);
      if (!seat) continue;
      this.seats.push(seat);
      this.seatSources.set(seat, s);
    }
  }

  /** Seat plus the free cell behind the bench (away from the table) where people walk to before sitting down. */
  private seatFor(s: OfficeModel['kitchen']['table'][number], nav: NavGrid): MeetSeat | null {
    const back = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    const approach = nav.nearestWalkable({ x: s.x + back.x * 0.9, z: s.z + back.z * 0.9 }, 3);
    if (!approach || Math.hypot(approach.x - s.x, approach.z - s.z) > 1.4) return null;
    return { seat: { x: s.x, z: s.z }, approach: { ...approach }, yaw: s.yaw, occupant: null };
  }

  /** The room editor moved the table: the seats follow in place. */
  relayout(nav: NavGrid): void {
    for (const seat of this.seats) {
      const s = this.seatSources.get(seat)!;
      seat.seat.x = s.x;
      seat.seat.z = s.z;
      seat.yaw = s.yaw;
      const next = this.seatFor(s, nav);
      if (next) {
        seat.approach.x = next.approach.x;
        seat.approach.z = next.approach.z;
      }
    }
  }

  /** Sends `people` to sit at the dining table (they must be free). Null when none of the seats is free. */
  startTable(people: Person[], nav: NavGrid): TableSession | null {
    if (this.table) return null;
    const free = this.seats.filter((s) => !s.occupant);
    // adjacent seats on the same bench: start at a random one, take neighbours
    const first = Math.floor(Math.random() * free.length);
    const picked = [...free.slice(first), ...free.slice(0, first)].slice(0, people.length);
    if (!picked.length) return null;
    const group = people.slice(0, picked.length);
    const session = new TableSession(group, this.model.center);
    group.forEach((p, i) => p.callToMeeting(nav, picked[i], session));
    this.table = session;
    return session;
  }

  /** A free spot in front of the espresso machine for `p` to fetch a coffee at, or null when it is busy (or the group is standing there). */
  claimMachine(p: Person, nav: NavGrid): MachineSpot | null {
    if (this.current) return null;
    const m = this.model.machine;
    for (const [index, at] of this.model.stands.entries()) {
      if (this.users[index] && this.users[index] !== p) continue;
      const stand = nav.nearestWalkable(at, 2);
      if (!stand) continue;
      this.users[index] = p;
      return { index, stand: { ...stand }, yaw: Math.atan2(m.x - stand.x, m.z - stand.z) };
    }
    return null;
  }

  /** `p` is done at the machine (or gave up). */
  releaseMachine(p: Person): void {
    this.users = this.users.map((u) => (u === p ? null : u));
  }

  /** Calls `people` to the kitchen (they must be free). Returns the break, or null when one is already on or there is no room. */
  start(people: Person[], nav: NavGrid): CoffeeBreak | null {
    if (this.current || people.length < 2 || this.users.some(Boolean)) return null; // somebody still stands at the machine: kitchen is full
    const c = this.model.center;
    const group = people.slice(0, GROUP.max);
    // spread the circle around the centre starting where the first person comes from: walks cross less
    const sorted = [...group].sort((a, b) => Math.atan2(a.pos.z - c.z, a.pos.x - c.x) - Math.atan2(b.pos.z - c.z, b.pos.x - c.x));
    const a0 = Math.atan2(sorted[0].pos.z - c.z, sorted[0].pos.x - c.x);
    const placed: Array<{ p: Person; spot: CoffeeSpot }> = [];
    sorted.forEach((p, i) => {
      const a = a0 + (i * Math.PI * 2) / sorted.length;
      const stand = nav.nearestWalkable({ x: c.x + Math.cos(a) * RING, z: c.z + Math.sin(a) * RING }, 3);
      if (stand) placed.push({ p, spot: { stand: { ...stand }, yaw: Math.atan2(c.x - stand.x, c.z - stand.z), occupant: null } });
    });
    if (placed.length < 2) return null;
    const brk = new CoffeeBreak(
      placed.map((x) => x.p),
      c,
    );
    for (const { p, spot } of placed) p.callToCoffee(nav, spot, brk);
    this.current = brk;
    return brk;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    this.updateTable(dt, people, nav);
    if (this.current) {
      if (!this.current.update(dt)) {
        this.current = null;
        this.timer = between(PAUSE);
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    if (this.users.some(Boolean)) return;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob && !p.phoneJob && !p.run && !p.playerChat);
    const n = Math.min(free.length, Math.round(GROUP.min + Math.random() * (GROUP.max - GROUP.min)));
    if (n < GROUP.min) return;
    if (this.start(free.sort(() => Math.random() - 0.5).slice(0, n), nav)) this.timer = 0;
  }

  private updateTable(dt: number, people: readonly Person[], nav: NavGrid): void {
    if (this.table) {
      if (!this.table.update(dt)) {
        this.table = null;
        this.tableTimer = between(TABLE_PAUSE);
      }
      return;
    }
    this.tableTimer -= dt;
    if (this.tableTimer > 0) return;
    this.tableTimer = 10;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob && !p.phoneJob && !p.run && !p.playerChat && !p.coffeeJob);
    if (!free.length) return;
    const n = Math.min(free.length, 1 + Math.floor(Math.random() * 3));
    if (this.startTable(free.sort(() => Math.random() - 0.5).slice(0, n), nav)) this.tableTimer = 0;
  }
}
