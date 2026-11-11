import type { OfficeModel } from '../render/officeModel';
import type { MeetSeat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';

const FIRST = { min: 30, max: 70 }; // seconds after game start
const PAUSE = { min: 60, max: 150 }; // seconds between two calls
const STAY = { min: 18, max: 40 }; // seconds on the phone
const GATHER_TIMEOUT = 45;
const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

/** One person on the stool in the phone box, taking a call. Reuses the meeting-seat logic (walk, sit down, stand up). */
export class PhoneBoothSession implements Talk {
  readonly kind: ConversationKind = 'chat';
  members: Person[];
  private time = 0;
  private seatedTime = 0;
  private stay = between(STAY);
  private ending = false;

  /** seated on the stool and on the phone: the door stays shut */
  get calling(): boolean {
    return this.members[0]?.boothCall ?? false;
  }

  constructor(
    person: Person,
    readonly center: Vec2,
  ) {
    this.members = [person];
  }

  /** false once the caller is gone */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inMeeting);
    const p = this.members[0];
    if (!p) return false;
    this.time += dt;
    p.boothCall = p.meetSeated && !this.ending;
    if (p.meetSeated) this.seatedTime += dt;
    if (!this.ending && (this.seatedTime > this.stay || this.time > GATHER_TIMEOUT + this.stay)) {
      this.ending = true;
      p.boothCall = false;
      p.dismissMeeting();
    }
    return true;
  }

  abort(): void {
    for (const m of this.members) {
      m.boothCall = false;
      m.dismissMeeting();
    }
  }
}

/** The phone box: one stool inside, and a scheduler that sends somebody in for a call now and then. */
export class PhoneBooth {
  readonly seat: MeetSeat | null = null;
  current: PhoneBoothSession | null = null;
  private timer = between(FIRST);
  private closed = false;
  /** called when the door should be shut (true, somebody is on a call) or released (false) */
  onClosed: (closed: boolean) => void = () => {};

  constructor(
    private model: OfficeModel['phoneBooth'],
    nav: NavGrid,
  ) {
    const approach = this.approachFor(nav);
    if (approach) this.seat = { seat: { x: model.seat.x, z: model.seat.z }, approach, yaw: model.seat.yaw, occupant: null };
  }

  /** First free cell outside the door (in front of the stool), where people walk to before stepping in. */
  private approachFor(nav: NavGrid): Vec2 | null {
    const s = this.model.seat;
    const front = { x: 0, z: 1 }; // the door is on the south side, whichever way the stool faces
    for (const dist of [1.9, 2.2, 1.6, 2.5]) {
      const c = nav.toCell({ x: s.x + front.x * dist, z: s.z + front.z * dist });
      if (nav.walkable(c.cx, c.cz)) return nav.center(c.cx, c.cz);
    }
    return nav.nearestWalkable({ x: s.x + front.x * 2, z: s.z + front.z * 2 }, 4);
  }

  /** The room editor moved the stool and the nav grid was rebuilt. */
  relayout(nav: NavGrid): void {
    if (!this.seat) return;
    this.seat.seat.x = this.model.seat.x;
    this.seat.seat.z = this.model.seat.z;
    this.seat.yaw = this.model.seat.yaw;
    const approach = this.approachFor(nav);
    if (approach) {
      this.seat.approach.x = approach.x;
      this.seat.approach.z = approach.z;
    }
  }

  /** Sends one person (already dropped from desk / conversation) into the box. Null if it is taken. */
  start(person: Person, nav: NavGrid): PhoneBoothSession | null {
    if (this.current || !this.seat || this.seat.occupant) return null;
    const session = new PhoneBoothSession(person, this.seat.seat);
    person.callToMeeting(nav, this.seat, session);
    this.current = session;
    return session;
  }

  /** The player dropped `person` on the stool: they sit down right away and take a call. False if the box is taken. */
  sitIn(person: Person): boolean {
    if (this.current || !this.seat || this.seat.occupant) return false;
    const session = new PhoneBoothSession(person, this.seat.seat);
    if (!person.sitDownAtMeeting(this.seat, session)) return false;
    this.current = session;
    return true;
  }

  get doorPos(): Vec2 {
    return this.model.doorPos;
  }

  private setClosed(closed: boolean): void {
    if (closed === this.closed) return;
    this.closed = closed;
    this.onClosed(closed);
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    if (this.current) {
      if (!this.current.update(dt)) {
        this.current = null;
        this.timer = between(PAUSE);
      }
      this.setClosed(!!this.current?.calling);
      return;
    }
    this.setClosed(false);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    const free = people.filter((p) => p.member.look.phone && p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob && !p.snackLeft && !p.phoneJob && !p.run);
    if (!free.length) return;
    if (this.start(free[Math.floor(Math.random() * free.length)], nav)) this.timer = 0;
  }
}
