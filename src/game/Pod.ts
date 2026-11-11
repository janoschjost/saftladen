import type { OfficeModel } from '../render/officeModel';
import type { MeetSeat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';

const FIRST = { min: 20, max: 45 }; // seconds after game start
const PAUSE = { min: 50, max: 110 }; // seconds between two visits
const STAY = { min: 25, max: 55 }; // seconds the two sit together
const GATHER_TIMEOUT = 45;
type ModelSeat = OfficeModel['pod']['seats'][number];
const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

/** Two people sitting together in the wooden pod. Reuses the meeting-room seat logic (walk, sit down, stand up). */
export class PodSession implements Talk {
  readonly kind: ConversationKind = 'chat';
  private time = 0; // since the call
  private seatedTime = 0; // both sitting
  private stay = between(STAY);
  private ending = false;

  constructor(
    public members: Person[],
    readonly center: Vec2,
  ) {}

  /** false once everybody is gone */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inMeeting);
    if (this.members.length === 0) return false;
    this.time += dt;
    const seated = this.members.length === 2 && this.members.every((m) => m.meetSeated);
    if (seated) this.seatedTime += dt;
    if (!this.ending && (this.members.length < 2 || this.seatedTime > this.stay || this.time > GATHER_TIMEOUT + this.stay)) {
      this.ending = true;
      for (const m of this.members) m.dismissMeeting();
    }
    return true;
  }

  abort(): void {
    for (const m of this.members) m.dismissMeeting();
  }
}

/** The wooden pod: two bench seats and a scheduler that sends two people in now and then. */
export class Pod {
  readonly seats: MeetSeat[] = [];
  current: PodSession | null = null;
  private timer = between(FIRST);
  private sources = new Map<MeetSeat, ModelSeat>();

  constructor(
    private model: OfficeModel['pod'],
    nav: NavGrid,
  ) {
    for (const s of model.seats) {
      const approach = this.approachFor(s, nav);
      if (!approach) continue;
      const seat: MeetSeat = { seat: { x: s.x, z: s.z }, approach, yaw: s.yaw, occupant: null };
      this.seats.push(seat);
      this.sources.set(seat, s);
    }
  }

  /** First free cell in front of the pod, where people walk to before sitting down. */
  private approachFor(s: ModelSeat, nav: NavGrid): Vec2 | null {
    const front = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    for (const dist of [1.7, 2.0, 2.3]) {
      const c = nav.toCell({ x: s.x + front.x * dist, z: s.z + front.z * dist });
      if (nav.walkable(c.cx, c.cz)) return nav.center(c.cx, c.cz);
    }
    return nav.nearestWalkable({ x: s.x + front.x * 1.9, z: s.z + front.z * 1.9 }, 4);
  }

  /** The pod was moved (room editor) and the nav grid rebuilt: the seats follow in place. */
  relayout(nav: NavGrid): void {
    for (const seat of this.seats) {
      const s = this.sources.get(seat)!;
      seat.seat.x = s.x;
      seat.seat.z = s.z;
      seat.yaw = s.yaw;
      const approach = this.approachFor(s, nav);
      if (approach) {
        seat.approach.x = approach.x;
        seat.approach.z = approach.z;
      }
    }
  }

  /** Sends two people to sit in the pod (they must be free: dropped from desk / conversation already). Null if the pod is taken. */
  start(people: Person[], nav: NavGrid): PodSession | null {
    if (this.current || this.seats.length < 2 || people.length < 2 || this.seats.some((s) => s.occupant)) return null;
    const group = people.slice(0, 2);
    const session = new PodSession(group, this.model.center);
    group.forEach((p, i) => p.callToMeeting(nav, this.seats[i], session));
    this.current = session;
    return session;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
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
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob);
    if (free.length < 2) return;
    const pair = free.sort(() => Math.random() - 0.5).slice(0, 2);
    if (this.start(pair, nav)) this.timer = 0;
  }
}
