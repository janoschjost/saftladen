import type { OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import { Chat } from './Chatter';
import { nextSpeaker, type ConversationKind, type Talk } from './Social';
import { random } from './rng';
import type { TvMode } from '../render/screens';

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

type ModelSeat = OfficeModel['meeting']['seats'][number];

const GATHER_TIMEOUT = 60; // seconds the others wait for latecomers
const SESSION = { min: 45, max: 90 }; // seconds the door stays shut
const FIRST_MEETING = { min: 25, max: 50 }; // seconds after game start
const PAUSE = { min: 70, max: 140 }; // seconds between two meetings
const GROUP = { min: 3, max: 6 };
const KART_SESSION = { min: 60, max: 110 }; // a round of kart racing
const KART_GROUP = { min: 2, max: 4 };
const LUNCH = { from: 11.75, to: 13.5 }; // hours: kart rounds only happen around lunch
const KART_DAY = 0.3; // chance that a lunch break has a round at all

/** What the TV shows during an ordinary meeting: usually slides, sometimes nobody switched it on. */
const meetingScreen = (): TvMode => (random() < 0.6 ? 'slides' : 'off');

const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

/** One meeting: people walk to the room, sit down, talk behind the closed door, then leave together. */
export class Meeting implements Talk {
  readonly kind: ConversationKind = 'discussion';
  phase: 'gather' | 'session' | 'leaving' = 'gather';
  speaker: Person;
  text = '…';
  private time = 0;
  private chat: Chat | null = null;
  private speakerTimer = 0;
  private previous: Person | null = null;
  private duration: number;
  /** the door is shut and the doorway blocked: nobody else wanders in */
  closed = false;

  constructor(
    public members: Person[],
    readonly center: Vec2,
    private room: MeetingRoom,
    /** what the TV shows once everybody sits */
    readonly screen: TvMode = meetingScreen(),
  ) {
    this.speaker = members[0];
    this.duration = between(screen === 'kart' ? KART_SESSION : SESSION);
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
      // a kart round: everybody turns to the TV, not to each other
      if (this.screen === 'kart') for (const m of this.members) m.meetFocus = this.room.tvPos;
      this.speakerTimer -= dt;
      if (this.speakerTimer <= 0) {
        const next = nextSpeaker(this.members, this.speaker, this.previous);
        this.previous = this.speaker;
        this.speaker = next;
        this.speakerTimer = 1.5 + random() * 2.8;
        this.chat ??= new Chat();
        this.text = this.chat.next(this.speaker, this.members, this.kind);
        for (const m of this.members) m.speaking = m === this.speaker;
      }
      if (this.time >= this.duration || this.members.length < 2 || this.members.some((m) => !m.meetSeated)) {
        this.phase = 'leaving';
        this.closed = false;
        this.room.setClosed(false, nav);
        for (const m of this.members) {
          m.speaking = false;
          m.meetFocus = null;
          m.dismissMeeting();
        }
      }
      return true;
    }

    return this.members.length > 0;
  }

  /** Over on the spot: the door opens, everybody drops out where they are. */
  abort(nav: NavGrid): void {
    const members = [...this.members];
    this.finish(nav);
    for (const m of members) m.cancelMeet();
  }

  private finish(nav: NavGrid): boolean {
    this.room.setClosed(false, nav);
    this.closed = false;
    for (const m of this.members) {
      m.speaking = false;
      m.meetFocus = null;
      m.dismissMeeting();
    }
    return false;
  }
}

/** People the player dropped on meeting chairs: once two or more sit there they chat with each other. */
export class CasualChat implements Talk {
  readonly kind: ConversationKind = 'chat';
  speaker: Person;
  text = '…';
  private chat: Chat | null = null;
  private speakerTimer = 0;

  constructor(
    public members: Person[],
    readonly center: Vec2,
  ) {
    this.speaker = members[0];
  }

  update(dt: number): void {
    if (!this.members.includes(this.speaker)) this.speaker = this.members[0];
    this.speakerTimer -= dt;
    if (this.speakerTimer > 0) return;
    const others = this.members.filter((m) => m !== this.speaker);
    this.speaker = others[Math.floor(random() * others.length)] ?? this.speaker;
    this.speakerTimer = 1.5 + random() * 2.8;
    this.chat ??= new Chat();
    this.text = this.chat.next(this.speaker, this.members, this.kind);
    for (const m of this.members) m.speaking = m === this.speaker;
  }
}

/** The glass meeting room: table seats, the doorway (blocked while a meeting is on) and the scheduler for meetings. */
export class MeetingRoom {
  readonly seats: MeetSeat[] = [];
  current: Meeting | null = null;
  /** the chat between people the player seated here (null while fewer than two sit) */
  casual: CasualChat | null = null;
  private timer = between(FIRST_MEETING);
  /** this lunch break has a kart round coming (rolled once per lunch break) */
  private kartPending = false;
  private lunchRolled = false;
  private doorCell: { cx: number; cz: number };
  private sources = new Map<MeetSeat, ModelSeat>();
  /** called when the door should be locked shut (true) or released (false) */
  onClosed: (closed: boolean) => void = () => {};

  constructor(
    private model: OfficeModel['meeting'],
    nav: NavGrid,
  ) {
    this.doorCell = nav.toCell(model.doorPos);
    for (const s of model.seats) {
      const approach = this.approachFor(s, nav) ?? { x: s.x, z: s.z }; // boxed-in chair stays usable for dropping people on it
      const seat: MeetSeat = { seat: { x: s.x, z: s.z }, approach, yaw: s.yaw, occupant: null };
      this.seats.push(seat);
      this.sources.set(seat, s);
    }
  }

  /** First free cell behind the chair. */
  private approachFor(s: ModelSeat, nav: NavGrid): Vec2 | null {
    const front = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    // never a spot behind glass: it has to be reachable from the chair in a straight line
    const ok = (p: Vec2) => nav.lineClear(p, s, 0.5);
    for (const dist of [0.9, 1.1, 1.4]) {
      const c = nav.toCell({ x: s.x - front.x * dist, z: s.z - front.z * dist });
      if (nav.walkable(c.cx, c.cz) && ok(nav.center(c.cx, c.cz))) return nav.center(c.cx, c.cz);
    }
    const near = nav.nearestWalkable({ x: s.x - front.x * 1.1, z: s.z - front.z * 1.1 }, 4);
    return near && ok(near) ? near : null;
  }

  /** Chairs were moved (room editor) and the nav grid rebuilt: the seats follow in place, a running meeting keeps its door shut. */
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
    if (this.current?.closed) nav.block(this.doorCell.cx, this.doorCell.cz);
  }

  /** Is this floor point inside the glass room (the table seats plus a margin)? */
  contains(p: Vec2): boolean {
    const m = 1.4;
    const xs = this.model.seats.map((s) => s.x);
    const zs = this.model.seats.map((s) => s.z);
    return p.x >= Math.min(...xs) - m && p.x <= Math.max(...xs) + m && p.z >= Math.min(...zs) - m && p.z <= Math.max(...zs) + m;
  }

  /** where the TV hangs */
  get tvPos(): Vec2 {
    return this.model.tv;
  }

  /** How many people (in the office, not carried by the player) are inside the room right now; drives its lamp at night. */
  occupants(people: readonly Person[]): number {
    return people.filter((p) => p.inOffice && !p.held && this.contains(p.pos)).length;
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

  /** Chairs a new meeting could take: none while one is on. */
  get emptySeats(): number {
    return this.current ? 0 : this.seats.filter((s) => !s.occupant).length;
  }

  /** No meeting on and at least two chairs empty: one can start. */
  get free(): boolean {
    return this.emptySeats >= 2;
  }

  /** Calls `people` to the room (first free seats, north to south). Returns the meeting, or null if there is no room for a meeting. */
  start(people: Person[], nav: NavGrid, screen?: TvMode): Meeting | null {
    if (!this.free) return null;
    // side chairs first (north to south), the two head chairs only when the group is big
    const isHead = (s: MeetSeat) => Math.abs(Math.cos(s.yaw)) > 0.5; // heads face north / south
    const seats = this.seats.filter((s) => !s.occupant).sort((a, b) => Number(isHead(a)) - Number(isHead(b)) || a.seat.z - b.seat.z || a.seat.x - b.seat.x);
    const group = people.slice(0, seats.length);
    if (group.length < 2) return null;
    const m = new Meeting(group, this.model.center, this, screen);
    // nearest person takes the seat nearest to the door side first
    group.forEach((p, i) => p.callToMeeting(nav, seats[i], m));
    this.current = m;
    return m;
  }

  /** Seated drop-ins (`meetJob.solo`) chat once there are two of them. */
  private updateCasual(dt: number, people: readonly Person[]): void {
    const sitters = people.filter((p) => p.meetJob?.solo !== undefined && p.meetJob.phase === 'sit' && !p.held);
    if (sitters.length < 2) {
      if (this.casual) {
        for (const m of this.casual.members) {
          m.speaking = false;
          if (m.meetJob?.talk === this.casual) m.meetJob.talk = { kind: 'chat', center: { ...m.meetJob.seat.seat }, members: [m] };
          if (m.talk === this.casual) m.talk = null;
        }
        this.casual = null;
      }
      return;
    }
    if (!this.casual) this.casual = new CasualChat(sitters, this.model.center);
    const chat = this.casual;
    for (const m of sitters) {
      if (m.talk !== chat) m.talk = chat;
      if (m.meetJob) m.meetJob.talk = chat;
    }
    chat.members = sitters;
    chat.update(dt);
  }

  /** What the TV in the room shows: slides or a kart race while a meeting sits, otherwise nothing. */
  get tv(): TvMode {
    return this.current?.phase === 'session' ? this.current.screen : 'off';
  }

  /** Some lunch breaks a few people gather here for a round of kart racing. */
  private rollKart(hour: number): void {
    const lunch = hour >= LUNCH.from && hour < LUNCH.to;
    if (lunch && !this.lunchRolled) {
      this.lunchRolled = true;
      this.kartPending = random() < KART_DAY;
    } else if (!lunch) {
      this.lunchRolled = false;
      this.kartPending = false;
    }
  }

  /** Ends a running meeting on the spot: the room is free at once. */
  abort(nav: NavGrid): void {
    this.current?.abort(nav);
    this.current = null;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid, hour = 0): void {
    this.updateCasual(dt, people);
    this.rollKart(hour);
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
    const kart = this.kartPending;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob);
    const size = kart ? KART_GROUP : GROUP;
    const n = Math.min(free.length, Math.round(size.min + random() * (size.max - size.min)));
    if (n < size.min) return;
    const group = free.sort(() => random() - 0.5).slice(0, n);
    if (this.start(group, nav, kart ? 'kart' : undefined)) {
      this.timer = 0;
      this.kartPending = false;
    }
  }
}
