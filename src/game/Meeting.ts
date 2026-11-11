import type { OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';

/** A chair at the meeting table. */
export interface MeetSeat {
  /** where the sitter's hips end up */
  seat: Vec2;
  /** free cell behind the chair, where people walk to before sitting down */
  approach: Vec2;
  /** direction the sitter faces (yaw, 0 = +z) */
  yaw: number;
  occupant: Person | null;
}

const GATHER_TIMEOUT = 60; // seconds the others wait for latecomers
const SESSION = { min: 45, max: 90 }; // seconds the door stays shut
const FIRST_MEETING = { min: 25, max: 50 }; // seconds after game start
const PAUSE = { min: 70, max: 140 }; // seconds between two meetings
const GROUP = { min: 3, max: 6 };
const BUBBLES = ['…', '!', '?', '…', '!?'];

const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

/** One meeting: people walk to the room, sit down, talk behind the closed door, then leave together. */
export class Meeting implements Talk {
  readonly kind: ConversationKind = 'discussion';
  phase: 'gather' | 'session' | 'leaving' = 'gather';
  speaker: Person;
  text = '…';
  private time = 0;
  private speakerTimer = 0;
  private duration = between(SESSION);
  /** the door is shut and the doorway blocked: nobody else wanders in */
  closed = false;

  constructor(
    public members: Person[],
    readonly center: Vec2,
    private room: MeetingRoom,
  ) {
    this.speaker = members[0];
  }

  /** false once everybody has left */
  update(dt: number, nav: NavGrid): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inMeeting);
    this.time += dt;

    if (this.phase === 'gather') {
      const seated = this.members.filter((m) => m.meetSeated);
      if (this.members.length < 2) return this.finish(nav);
      if (seated.length === this.members.length) {
        this.phase = 'session';
        this.time = 0;
        this.room.setClosed(true, nav);
        this.closed = true;
      } else if (this.time > GATHER_TIMEOUT + 10) {
        // stragglers give up
        for (const m of this.members) if (!m.meetSeated) m.cancelMeet();
      }
      return true;
    }

    if (this.phase === 'session') {
      this.speakerTimer -= dt;
      if (this.speakerTimer <= 0) {
        const others = this.members.filter((m) => m !== this.speaker);
        this.speaker = others[Math.floor(Math.random() * others.length)] ?? this.speaker;
        this.speakerTimer = 1.5 + Math.random() * 2.8;
        this.text = BUBBLES[Math.floor(Math.random() * BUBBLES.length)];
        for (const m of this.members) m.speaking = m === this.speaker;
      }
      if (this.time >= this.duration || this.members.length < 2 || this.members.some((m) => !m.meetSeated)) {
        this.phase = 'leaving';
        this.closed = false;
        this.room.setClosed(false, nav);
        for (const m of this.members) {
          m.speaking = false;
          m.dismissMeeting();
        }
      }
      return true;
    }

    return this.members.length > 0;
  }

  /** drops everybody (game reset, abort) */
  abort(nav: NavGrid): void {
    this.finish(nav);
  }

  private finish(nav: NavGrid): boolean {
    this.room.setClosed(false, nav);
    this.closed = false;
    for (const m of this.members) {
      m.speaking = false;
      m.dismissMeeting();
    }
    return false;
  }
}

/** The glass meeting room: table seats, the doorway (blocked while a meeting is on) and the scheduler for meetings. */
export class MeetingRoom {
  readonly seats: MeetSeat[] = [];
  current: Meeting | null = null;
  private timer = between(FIRST_MEETING);
  private doorCell: { cx: number; cz: number };
  /** called when the door should be locked shut (true) or released (false) */
  onClosed: (closed: boolean) => void = () => {};

  constructor(
    private model: OfficeModel['meeting'],
    nav: NavGrid,
  ) {
    this.doorCell = nav.toCell(model.doorPos);
    for (const s of model.seats) {
      const front = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      let approach: Vec2 | null = null;
      for (const dist of [0.9, 1.1, 1.4]) {
        const c = nav.toCell({ x: s.x - front.x * dist, z: s.z - front.z * dist });
        if (nav.walkable(c.cx, c.cz)) {
          approach = nav.center(c.cx, c.cz);
          break;
        }
      }
      approach ??= nav.nearestWalkable({ x: s.x - front.x * 1.1, z: s.z - front.z * 1.1 }, 4);
      if (approach) this.seats.push({ seat: { x: s.x, z: s.z }, approach, yaw: s.yaw, occupant: null });
    }
  }

  get doorPos(): Vec2 {
    return this.model.doorPos;
  }

  /** People currently on the way to / in the meeting. */
  get count(): number {
    return this.current?.members.length ?? 0;
  }

  setClosed(closed: boolean, nav: NavGrid): void {
    if (closed) nav.block(this.doorCell.cx, this.doorCell.cz);
    else nav.unblock(this.doorCell.cx, this.doorCell.cz);
    this.onClosed(closed);
  }

  /** Calls `people` to the room (first free seats, north to south). Returns the meeting, or null if there is no room for a meeting. */
  start(people: Person[], nav: NavGrid): Meeting | null {
    if (this.current) return null;
    const seats = this.seats.filter((s) => !s.occupant).sort((a, b) => a.seat.z - b.seat.z || a.seat.x - b.seat.x);
    const group = people.slice(0, seats.length);
    if (group.length < 2) return null;
    const m = new Meeting(group, this.model.center, this);
    // nearest person takes the seat nearest to the door side first
    group.forEach((p, i) => p.callToMeeting(nav, seats[i], m));
    this.current = m;
    return m;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    if (this.current) {
      if (!this.current.update(dt, nav)) {
        this.current = null;
        this.timer = between(PAUSE);
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob);
    const n = Math.min(free.length, Math.round(GROUP.min + Math.random() * (GROUP.max - GROUP.min)));
    if (n < GROUP.min) return;
    const group = free.sort(() => Math.random() - 0.5).slice(0, n);
    if (this.start(group, nav)) this.timer = 0;
  }
}
