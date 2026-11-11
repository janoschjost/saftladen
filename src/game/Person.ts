import type * as THREE from 'three';
import { screenKindOf, screenSeed } from '../data/screens';
import type { TeamMember } from '../data/types';
import type { CharacterRig } from '../render/characterBuilder';
import { SIT_DROP } from '../render/officeBuilder';
import { screenVariants, type ScreenKind } from '../render/screens';
import { DOOR_IN, DOOR_OUT } from './Door';
import type { NavGrid, Vec2 } from './NavGrid';
import type { MeetSeat } from './Meeting';
import type { CoffeeSpot } from './Coffee';
import type { Desk, FoosSpot, Office } from './Office';
import type { Talk } from './Social';
import { Walker } from './Walker';

const WORK_CHANCE = 0.75; // chance per decision to go sit down instead of wandering
const WORK_TIME = { min: 90, max: 240 }; // seconds a person stays at the desk
const PRINT_CHANCE = 0.12; // chance per decision to walk to the printer
const PRINT_TIME = { min: 4, max: 9 }; // seconds spent at the printer
const STEER_WALK = 2.2; // m/s while steered with the keyboard
const STEER_RUN = 4.2;
const VAPE_CHANCE = 0.15; // chance per decision (vapers only) to take a drag instead
const VAPE_RAISE = 0.6; // timeline of one drag, seconds: raise the hand, inhale, hold, exhale (arm drops during it)
const VAPE_DRAW = 2.0;
const VAPE_HOLD = 2.5;
const VAPE_LOWER = 3.0;
const VAPE_END = 5.2;
const FOOS_CHANCE = 0.03; // chance per decision to challenge somebody to foosball
const FOOS_TIME = { min: 25, max: 50 }; // seconds of one game
const PHONE_CHANCE = 0.4; // chance per decision (phone people only) to take a call while walking around
const PHONE_TIME = { min: 30, max: 80 }; // seconds of one call
const PHONE_PACE_CHANCE = 0.5; // chance that a call is spent pacing up and down one path instead of wandering
const SEAT_PHONE_RATE = 0.02; // per second while working at the desk (phone people): chance to take a call right in the chair
const SEAT_PHONE_TIME = { min: 15, max: 40 };
const SEAT_VAPE_RATE = 0.015; // per second while working at the desk (vapers): chance to take a drag without getting up
const PHONE_PACE_LEN = { min: 3.5, max: 9 }; // metres between the two ends of a pacing path
const TRANSITION = 1.1; // seconds to sit down / stand up

type Phase = 'approach' | 'enter' | 'work' | 'leave';

/** in = in the office, leaving = on the way out, out = gone (errand or home office), returning = coming back through the door */
export type Presence = 'in' | 'leaving' | 'out' | 'returning';
/** errand = popped out for a while, home = working from home (live feed available) */
/** errand / home office, or `off`: finished for the day (night), not listed anywhere */
export type AwayKind = 'errand' | 'home' | 'off';

interface DeskTask {
  desk: Desk;
  phase: Phase;
  t: number; // 0..1 progress of enter / leave
  from: Vec2;
  remaining: number; // seconds of work left
  retries: number;
  retryIn: number;
}

interface PrintJob {
  phase: 'approach' | 'print';
  remaining: number;
  retries: number;
  retryIn: number;
}

interface FoosJob {
  spot: FoosSpot;
  partner: Person;
  /** approach = walking to the table, ready = waiting for the opponent, play = playing */
  phase: 'approach' | 'ready' | 'play';
  remaining: number;
  age: number;
  retries: number;
  retryIn: number;
}

interface MeetJob {
  seat: MeetSeat;
  talk: Talk;
  phase: 'approach' | 'enter' | 'sit' | 'leave';
  t: number;
  from: Vec2;
  age: number;
  retries: number;
  retryIn: number;
  /** the meeting is over: stand up and leave */
  dismissed: boolean;
}

interface CoffeeJob {
  spot: CoffeeSpot;
  talk: Talk;
  /** approach = walking to the kitchen, drink = standing with a cup, leave = lowering the cup before walking off */
  phase: 'approach' | 'drink' | 'leave';
  t: number;
  age: number;
  retries: number;
  retryIn: number;
  /** offsets the sip rhythm so a group doesn't drink in unison */
  offset: number;
  /** the break is over */
  dismissed: boolean;
}

interface PhoneJob {
  remaining: number;
  /** pace = walks back and forth between `a` and `b`, wander = strolls from spot to spot */
  mode: 'pace' | 'wander' | 'sit';
  a: Vec2;
  b: Vec2;
  /** pacing: the end walked to next */
  toB: boolean;
}

interface VapeJob {
  t: number;
  drags: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

export class Person extends Walker {
  speed = 1.0 + Math.random() * 0.5;
  radius = 0.4;
  root: THREE.Object3D;
  id: string;
  /** 0 standing .. 1 sitting (drives the pose) */
  sit = 0;
  /** where this person works, set by the game once the office exists */
  office: Office | null = null;
  task: DeskTask | null = null;
  /** walking to / standing at the printer */
  printJob: PrintJob | null = null;
  /** walking to / playing at the foosball table */
  foosJob: FoosJob | null = null;
  /** the desk assigned to this person (null = picks any free desk) */
  homeDesk: Desk | null = null;
  /** was asked to give up a desk; picks another free one right after standing up */
  private displaced = false;
  presence: Presence = 'in';
  /** true while the player steers this person with the keyboard */
  controlled = false;
  /** steering input in world space (direction on the floor, not normalised) */
  readonly steer = { x: 0, z: 0, run: false };
  /** the player (walk mode) is talking to this person: they stop and face `at` until `t` runs out */
  playerChat: { t: number; at: Vec2 } | null = null;
  awayKind: AwayKind | null = null;
  /** seconds until this person comes back (counts down while `out`) */
  awayLeft = 0;
  /** which of the home office variants this person works from */
  homeVariant = 0;
  /** the home office this person likes best (used when it is free) */
  preferredHome = 0;
  /** taking a drag on the vape */
  vapeJob: VapeJob | null = null;
  /** on a phone call, walking around with the phone at the ear */
  phoneJob: PhoneJob | null = null;
  /** 0 = phone down .. 1 = at the ear (eased, kept after the call ends until the hand is down) */
  phoneAmt = 0;
  /** on a call, sitting in the phone box (phone at the ear while seated) */
  boothCall = false;
  /** walking to / standing in the kitchen with a coffee */
  coffeeJob: CoffeeJob | null = null;
  /** 0 = no cup .. 1 = cup in the hand (eased) */
  cupAmt = 0;
  /** walking to / sitting in the meeting room */
  meetJob: MeetJob | null = null;
  /** called to a meeting while still at a desk: goes once they have stood up */
  private pendingMeet: { seat: MeetSeat; talk: Talk; nav: NavGrid } | null = null;
  private presenceRetry = 0;
  private presenceRetries = 0;
  private baseHead: number;
  private moodTimer = 2 + Math.random() * 6;
  private happy = true;
  private clock = Math.random() * 100;
  private scale: number;

  constructor(
    readonly member: TeamMember,
    readonly rig: CharacterRig,
    start: Vec2,
  ) {
    super(start);
    this.root = rig.root;
    this.baseHead = rig.headHeight;
    this.scale = rig.root.scale.y;
    this.id = member.id;
    if (member.speed) this.speed = member.speed;
    this.root.userData.walker = this;
  }

  get headHeight(): number {
    return this.baseHead - SIT_DROP * this.scale * this.sit;
  }

  override get fixed(): boolean {
    if (this.presence === 'out' || this.script) return true;
    if (this.printJob?.phase === 'print') return true;
    if (this.foosJob?.phase === 'play') return true;
    if (this.meetJob) return this.meetJob.phase !== 'approach';
    return !!this.task && this.task.phase !== 'approach';
  }

  /** True while on the way to the meeting, or already in it. */
  get inMeeting(): boolean {
    return !!this.meetJob || !!this.pendingMeet;
  }

  /** Where this person is in the meeting ('pending' = still standing up from the desk), null = not in one. */
  get meetPhase(): string | null {
    return this.meetJob?.phase ?? (this.pendingMeet ? 'pending' : null);
  }

  /** True once sitting at the meeting table. */
  get meetSeated(): boolean {
    return this.meetJob?.phase === 'sit';
  }

  /** Called to the meeting room: walks to `seat`, sits down and stays until `dismissMeeting`. */
  callToMeeting(nav: NavGrid, seat: MeetSeat, talk: Talk): void {
    seat.occupant = this;
    this.talk = talk;
    const t = this.task;
    if (t && t.phase !== 'approach') {
      // stand up from the desk first
      this.pendingMeet = { seat, talk, nav };
      if (t.phase !== 'leave') t.remaining = 0;
      return;
    }
    this.startMeetWalk(nav, seat, talk);
  }

  private startMeetWalk(nav: NavGrid, seat: MeetSeat, talk: Talk): void {
    this.cancelTask();
    this.pendingMeet = null;
    this.meetJob = { seat, talk, phase: 'approach', t: 0, from: { ...this.pos }, age: 0, retries: 0, retryIn: 0.5, dismissed: false };
    this.goTo(nav, seat.approach);
  }

  /** The meeting is over (or this person was pulled out): stand up and leave, or give up on the way. */
  dismissMeeting(): void {
    const j = this.meetJob;
    if (!j || j.phase === 'approach') this.cancelMeet();
    else j.dismissed = true;
  }

  /** Drops out of the meeting right where they are. */
  cancelMeet(): void {
    const j = this.meetJob;
    const pending = this.pendingMeet;
    const seat = j?.seat ?? pending?.seat;
    if (seat?.occupant === this) seat.occupant = null;
    if (this.talk === (j?.talk ?? pending?.talk)) this.talk = null;
    this.meetJob = null;
    this.pendingMeet = null;
    this.path = [];
    this.state = 'idle';
    this.timer = 0.3 + Math.random();
  }

  /** True while in the office and free to do office things (desk, chat). */
  get inOffice(): boolean {
    return this.presence === 'in';
  }

  /** Walk to the door and leave; comes back after `seconds`. */
  leaveOffice(nav: NavGrid, kind: AwayKind, seconds: number): void {
    this.cancelTask();
    this.presence = 'leaving';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.presenceRetries = 0;
    this.presenceRetry = 0;
    this.goTo(nav, DOOR_IN);
  }

  /** Start the game already outside. */
  startAway(kind: AwayKind, seconds: number): void {
    this.cancelTask();
    this.sit = 0;
    this.presence = 'out';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.setAway(true);
  }

  private comeBack(): void {
    this.presence = 'returning';
    this.setAway(false);
    this.pos = { ...DOOR_OUT };
    this.prev = { ...DOOR_OUT };
    this.yaw = this.prevYaw = Math.PI;
    this.startScript(DOOR_IN, this.speed * 0.9);
  }

  /** Called back before they got out of the door. */
  cancelLeave(): void {
    if (this.presence === 'leaving') this.abortLeaving();
  }

  private abortLeaving(): void {
    this.presence = 'in';
    this.awayKind = null;
    this.script = null;
    this.state = 'idle';
    this.timer = 0.5;
  }

  private controlPresence(dt: number, nav: NavGrid): boolean {
    switch (this.presence) {
      case 'leaving': {
        if (this.held) {
          this.abortLeaving();
          return false;
        }
        if (this.sit > 0.01) {
          // stand up first, only then walk to the door
          this.sit = Math.max(0, this.sit - dt * 4);
          this.moving += (0 - this.moving) * Math.min(1, dt * 8);
          return true;
        }
        if (this.script) {
          if (this.runScript(dt)) return true;
          this.presence = 'out';
          this.setAway(true);
          return true;
        }
        if (this.isWalking()) return false; // normal walking to the door
        this.moving += (0 - this.moving) * Math.min(1, dt * 8);
        if (Math.hypot(DOOR_IN.x - this.pos.x, DOOR_IN.z - this.pos.z) < 0.7) {
          this.startScript(DOOR_OUT);
          return true;
        }
        this.presenceRetry -= dt;
        if (this.presenceRetry <= 0) {
          this.presenceRetry = 0.5;
          this.goTo(nav, DOOR_IN);
          if (!this.isWalking() && ++this.presenceRetries > 8) this.abortLeaving();
        }
        return true;
      }
      case 'out':
        this.awayLeft -= dt;
        if (this.awayLeft <= 0) this.comeBack();
        return true;
      case 'returning':
        if (this.held) {
          this.abortLeaving();
          return false;
        }
        if (this.runScript(dt)) return true;
        this.presence = 'in';
        this.awayKind = null;
        this.state = 'idle';
        this.timer = 0.4 + Math.random();
        return true;
      default:
        return false;
    }
  }

  /** 0 = hand down .. 1 = vape at the mouth */
  get vapeAmt(): number {
    const j = this.vapeJob;
    if (!j) return 0;
    if (j.t < VAPE_RAISE) return smooth(j.t / VAPE_RAISE);
    if (j.t < VAPE_LOWER) return 1;
    return 1 - smooth((j.t - VAPE_LOWER) / (VAPE_END - VAPE_LOWER - 1));
  }

  /** True while inhaling (the tip glows). */
  get vapeDraw(): boolean {
    const j = this.vapeJob;
    return !!j && j.t >= VAPE_RAISE && j.t < VAPE_DRAW;
  }

  /** Seconds since the exhale began, -1 when not exhaling. */
  get puffT(): number {
    const j = this.vapeJob;
    return j && j.t >= VAPE_HOLD ? j.t - VAPE_HOLD : -1;
  }

  /** True while sitting at a desk and working. */
  get working(): boolean {
    return this.task?.phase === 'work';
  }

  /** Start the game already sitting at a claimed desk. */
  sitAt(desk: Desk): void {
    this.task = { desk, phase: 'work', t: 0, from: desk.seat, remaining: (40 + Math.random() * 160) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0 };
    this.pos.x = this.prev.x = desk.seat.x;
    this.pos.z = this.prev.z = desk.seat.z;
    this.yaw = this.prevYaw = desk.yaw;
    this.sit = 1;
    this.state = 'idle';
    desk.setScreen(true, this.pickScreen());
  }

  /** Chair the held person is currently snapped to (set by the game while dragging). */
  snapDesk: Desk | null = null;

  /** Can this person be put on `desk` by the player (free chair, nothing else keeping them busy)? */
  canSit(desk: Desk): boolean {
    return this.presence === 'in' && !this.controlled && !this.talk && !this.inMeeting && !this.pendingMeet && !desk.pending && (!desk.occupant || desk.occupant === this);
  }

  /** Dropped on a chair by the player: sit there and start working. */
  sitDownAt(desk: Desk): boolean {
    if (!this.canSit(desk)) return false;
    this.cancelTask();
    desk.occupant = this;
    this.task = { desk, phase: 'work', t: 0, from: { ...desk.seat }, remaining: (WORK_TIME.min + Math.random() * (WORK_TIME.max - WORK_TIME.min)) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0 };
    this.pos.x = this.prev.x = desk.seat.x;
    this.pos.z = this.prev.z = desk.seat.z;
    this.yaw = this.prevYaw = desk.yaw;
    this.sit = 1;
    this.path = [];
    this.state = 'idle';
    desk.setScreen(true, this.pickScreen());
    return true;
  }

  override update(dt: number, nav: NavGrid, others: readonly Walker[] = []): void {
    this.updatePhone(dt);
    this.cupAmt += ((this.coffeeJob?.phase === 'drink' ? 1 : 0) - this.cupAmt) * Math.min(1, dt * 4);
    if (this.cupAmt < 0.005) this.cupAmt = 0;
    super.update(dt, nav, others);
    this.clock += dt;
    if (this.rig.setMood && (this.moodTimer -= dt) <= 0) {
      this.moodTimer = 4 + Math.random() * 10;
      this.happy = !this.happy;
      this.rig.setMood(this.happy);
    }
  }

  /** Counts the call down, ends it when something else takes over, and raises / lowers the hand. */
  private updatePhone(dt: number): void {
    const j = this.phoneJob;
    if (j) {
      j.remaining -= dt;
      if (j.remaining <= 0 || this.held || this.controlled || this.presence !== 'in' || this.talk || this.meetJob || this.pendingMeet || this.printJob || this.foosJob || (this.task ? j.mode !== 'sit' || this.task.phase !== 'work' : j.mode === 'sit') || (this.vapeJob && j.mode !== 'sit')) {
        this.endPhone();
      }
    }
    this.phoneAmt += ((this.phoneJob || (this.boothCall && this.meetSeated) ? 1 : 0) - this.phoneAmt) * Math.min(1, dt * 5);
    if (this.phoneAmt < 0.005) this.phoneAmt = 0;
  }

  /** Starts a phone call: walks around with the phone at the ear, either up and down one path or from spot to spot. */
  startPhone(nav: NavGrid): void {
    const pace = Math.random() < PHONE_PACE_CHANCE;
    const a = { ...this.pos };
    let b = a;
    if (pace) {
      // the far end of the path: a free spot a few metres away
      let best = Infinity;
      for (let i = 0; i < 16; i++) {
        const { cx, cz } = nav.randomWalkable();
        const c = nav.center(cx, cz);
        const d = Math.hypot(c.x - a.x, c.z - a.z);
        const miss = d < PHONE_PACE_LEN.min ? PHONE_PACE_LEN.min - d : d > PHONE_PACE_LEN.max ? d - PHONE_PACE_LEN.max : 0;
        if (miss < best) {
          best = miss;
          b = c;
        }
        if (miss === 0) break;
      }
    }
    this.phoneJob = { remaining: PHONE_TIME.min + Math.random() * (PHONE_TIME.max - PHONE_TIME.min), mode: pace ? 'pace' : 'wander', a, b, toB: true };
    this.phoneStep(nav);
  }

  /** Takes a call without leaving the chair. */
  private startSeatedPhone(task: DeskTask): void {
    const time = SEAT_PHONE_TIME.min + Math.random() * (SEAT_PHONE_TIME.max - SEAT_PHONE_TIME.min);
    this.phoneJob = { remaining: Math.min(time, Math.max(2, task.remaining - 1)), mode: 'sit', a: { ...this.pos }, b: { ...this.pos }, toB: true };
  }

  /** Occasionally a phone call or a vape drag while sitting at the desk. */
  private seatedBreaks(dt: number, task: DeskTask): void {
    if (this.held || this.talk || this.phoneJob || this.vapeJob || task.remaining < 6) return;
    if (this.member.look.phone && Math.random() < SEAT_PHONE_RATE * dt) this.startSeatedPhone(task);
    else if (this.member.look.vape && Math.random() < SEAT_VAPE_RATE * dt) this.startVape(Math.random() < 0.35 ? 2 : 1);
  }

  /** Advances a drag taken in the chair (the arm and puffs are animated from `vapeJob.t`). */
  private tickSeatedVape(dt: number): void {
    const job = this.vapeJob;
    if (!job) return;
    if (this.held || this.controlled || this.talk) {
      this.vapeJob = null;
      return;
    }
    job.t += dt;
    if (job.t >= VAPE_END) {
      if (--job.drags > 0) job.t = VAPE_RAISE;
      else this.vapeJob = null;
    }
  }

  /** Hangs up (the hand comes down on its own). */
  endPhone(): void {
    this.phoneJob = null;
    if (!this.task) this.timer = 0.3 + Math.random();
  }

  /** Next leg of the call: the other end of the path, or a new spot. */
  private phoneStep(nav: NavGrid): void {
    const j = this.phoneJob!;
    if (j.mode === 'pace') {
      this.goTo(nav, j.toB ? j.b : j.a);
      if (this.state === 'walk') j.toB = !j.toB;
      else this.timer = 0.5;
    } else {
      this.wanderTo(nav);
    }
  }

  /** What this person's monitor shows: their kind of work, mostly their usual picture, now and then another. */
  private pickScreen(): { kind: ScreenKind; variant: number } {
    const kind = screenKindOf(this.member.role);
    const own = screenSeed(this.member);
    return { kind, variant: Math.random() < 0.7 ? own : Math.floor(Math.random() * screenVariants(kind)) };
  }

  private get adhd(): boolean {
    return !!this.member.adhd;
  }

  protected override idleTime(): number {
    if (this.phoneJob) return this.phoneJob.mode === 'pace' ? 0.2 + Math.random() * 0.8 : 0.3 + Math.random() * 2;
    return this.adhd ? 0.3 + Math.random() * 1.5 : super.idleTime();
  }

  protected decide(nav: NavGrid): void {
    if (this.phoneJob) {
      this.phoneStep(nav);
      return;
    }
    const seek = this.displaced;
    this.displaced = false;
    if (this.member.look.phone && !seek && !this.talk && Math.random() < PHONE_CHANCE) {
      this.startPhone(nav);
      return;
    }
    if (this.member.look.vape && !seek && Math.random() < VAPE_CHANCE) {
      this.startVape(Math.random() < 0.35 ? 2 : 1);
      return;
    }
    if (!seek && Math.random() < PRINT_CHANCE && this.startPrint(nav)) return;
    if (!seek && Math.random() < FOOS_CHANCE && this.office?.challenge(this, nav)) return;
    if (this.office && (seek || Math.random() < (this.adhd ? WORK_CHANCE * 0.6 : WORK_CHANCE))) {
      const desk = this.office.claim(this);
      if (desk) {
        this.task = { desk, phase: 'approach', t: 0, from: { ...this.pos }, remaining: (WORK_TIME.min + Math.random() * (WORK_TIME.max - WORK_TIME.min)) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0.5 };
        this.goTo(nav, desk.approach);
        return;
      }
    }
    // sometimes just look around instead of walking
    if (Math.random() < (this.adhd ? 0.5 : 0.25)) {
      this.yaw += (Math.random() - 0.5) * (this.adhd ? 4 : 2.4);
      this.timer = this.idleTime();
      return;
    }
    this.wanderTo(nav);
  }

  /** The player talks to this person: they drop their walk and turn around. False when they are too busy to stop (desk, meeting, printer, …). */
  talkTo(at: Vec2, seconds: number): boolean {
    if (this.fixed || this.held || this.controlled || this.talk || this.presence !== 'in' || this.inMeeting) return false;
    this.interrupt();
    this.path = [];
    this.state = 'idle';
    this.playerChat = { t: seconds, at };
    return true;
  }

  protected override control(dt: number, nav: NavGrid): boolean {
    if (this.presence !== 'in') return this.controlPresence(dt, nav);
    const chat = this.playerChat;
    if (chat) {
      chat.t -= dt;
      if (chat.t <= 0 || this.held || this.controlled || this.talk) {
        this.playerChat = null;
        this.timer = 0.4 + Math.random();
      } else {
        this.state = 'idle';
        this.timer = 1;
        this.sit = Math.max(0, this.sit - dt * 4);
        this.moving += (0 - this.moving) * Math.min(1, dt * 8);
        this.turnTo(Math.atan2(chat.at.x - this.pos.x, chat.at.z - this.pos.z), dt);
        return true;
      }
    }
    if (this.controlled) {
      this.cancelPrint();
      this.cancelFoos();
      this.cancelCoffee();
      // the player takes over: stand up from the desk first, then walk freely
      const t = this.task;
      if (t?.phase === 'approach') this.cancelTask();
      else if (t?.phase === 'work') t.remaining = 0;
      if (this.inMeeting) this.dismissMeeting();
      if (!this.task && !this.meetJob) return this.steerStep(dt);
    }
    if (this.meetJob) return this.controlMeet(dt, nav);
    if (this.coffeeJob) return this.controlCoffee(dt, nav);
    if (this.held && !this.task && !this.printJob && !this.foosJob && !this.vapeJob) {
      // carried by the player: sits down in the air while snapped to a chair, stands otherwise
      const snap = this.snapDesk;
      this.sit += ((snap ? 1 : 0) - this.sit) * Math.min(1, dt * 10);
      if (snap) this.turnTo(snap.yaw, dt);
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      this.path = [];
      this.state = 'idle';
      this.timer = 0.6;
      return true;
    }
    if (!this.task && this.sit > 0.01) {
      // dropped from the desk: stand up first, only then start the next thing
      this.sit = Math.max(0, this.sit - dt * 4);
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      return true;
    }
    if (this.vapeJob && this.task?.phase !== 'work') return this.controlVape(dt);
    if (this.printJob) return this.controlPrint(dt, nav);
    if (this.foosJob) return this.controlFoos(dt, nav);
    const task = this.task;
    if (!task) {
      this.sit = Math.max(0, this.sit - dt * 4);
      return false;
    }
    if (this.held) {
      this.cancelTask();
      return false;
    }
    const d = task.desk;
    const ease = Math.min(1, dt * 8);

    switch (task.phase) {
      case 'approach': {
        if (this.isWalking()) return false; // normal walking, we only care once it stops
        this.moving += (0 - this.moving) * ease;
        if (Math.hypot(d.approach.x - this.pos.x, d.approach.z - this.pos.z) < 0.6) {
          if (d.occupant !== this) return true; // squatter still sitting there, wait until they stand up
          task.phase = 'enter';
          task.t = 0;
          task.from = { ...this.pos };
          return true;
        }
        // stopped short (blocked, gave up): try again a few times
        task.retryIn -= dt;
        if (task.retryIn <= 0) {
          task.retryIn = 0.5;
          this.goTo(nav, d.approach);
          if (!this.isWalking() && ++task.retries > 6) this.cancelTask();
        }
        return true;
      }
      case 'enter': {
        task.t += dt / TRANSITION;
        const e = smooth(task.t / 0.65);
        this.pos.x = task.from.x + (d.seat.x - task.from.x) * e;
        this.pos.z = task.from.z + (d.seat.z - task.from.z) * e;
        this.sit = smooth((task.t - 0.55) / 0.45);
        this.turnTo(d.yaw, dt);
        this.step(dt, task.t < 0.65 ? 0.7 : 0);
        if (task.t >= 1) {
          task.phase = 'work';
          d.setScreen(true, this.pickScreen());
        }
        return true;
      }
      case 'work': {
        this.pos.x = d.seat.x;
        this.pos.z = d.seat.z;
        this.sit = 1;
        // restless: keeps swivelling on the chair
        this.turnTo(this.adhd ? d.yaw + Math.sin(this.clock * 2.3) * Math.sin(this.clock * 0.7) * 0.9 : d.yaw, dt);
        this.moving += (0 - this.moving) * ease;
        task.remaining -= dt;
        this.tickSeatedVape(dt);
        this.seatedBreaks(dt, task);
        if (task.remaining <= 0) {
          this.vapeJob = null;
          this.phoneJob = null;
          task.phase = 'leave';
          task.t = 0;
          d.setScreen(false);
        }
        return true;
      }
      case 'leave': {
        task.t += dt / TRANSITION;
        const e = smooth((task.t - 0.35) / 0.65);
        this.pos.x = d.seat.x + (d.approach.x - d.seat.x) * e;
        this.pos.z = d.seat.z + (d.approach.z - d.seat.z) * e;
        this.sit = 1 - smooth(task.t / 0.4);
        if (task.t > 0.25) this.turnTo(d.yaw + Math.PI, dt);
        this.step(dt, task.t > 0.35 ? 0.7 : 0);
        if (task.t >= 1) this.finishTask();
        return true;
      }
    }
  }

  /** Keyboard-steered movement; wall and furniture collisions are resolved by the game's separation pass. */
  private steerStep(dt: number): boolean {
    if (this.held) return false;
    this.sit = Math.max(0, this.sit - dt * 4);
    this.path = [];
    this.state = 'idle';
    this.timer = 1;
    const { x, z, run } = this.steer;
    const len = Math.hypot(x, z);
    if (len < 0.01) {
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      return true;
    }
    const v = run ? STEER_RUN : STEER_WALK;
    this.pos.x += (x / len) * v * dt;
    this.pos.z += (z / len) * v * dt;
    this.turnTo(Math.atan2(x, z), dt);
    this.moving += ((run ? 1 : 0.8) - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * v * 3.6 * this.moving;
    return true;
  }

  /** The desk's owner is coming: stand up soon and look for another desk. */
  yieldDesk(): void {
    const task = this.task;
    if (!task) return;
    this.displaced = true;
    if (task.phase === 'approach') this.cancelTask();
    else task.remaining = Math.min(task.remaining, 0.6 + Math.random() * 0.8);
  }

  private isWalking(): boolean {
    return this.state === 'walk';
  }

  /** Ease the walk amount towards a target and advance the walk-cycle while moving. */
  private step(dt: number, target: number): void {
    this.moving += (target - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * 4.2 * this.moving;
  }

  private finishTask(): void {
    this.cancelTask();
    this.sit = 0;
    this.state = 'idle';
    this.path = [];
    this.timer = 0.3 + Math.random();
    const p = this.pendingMeet;
    if (p) this.startMeetWalk(p.nav, p.seat, p.talk);
  }

  private controlMeet(dt: number, nav: NavGrid): boolean {
    const j = this.meetJob!;
    const s = j.seat;
    if (this.held) {
      this.cancelMeet();
      this.sit = 0;
      return false;
    }
    const ease = Math.min(1, dt * 8);
    switch (j.phase) {
      case 'approach': {
        j.age += dt;
        if (j.age > 70) {
          this.cancelMeet();
          return false;
        }
        if (this.isWalking()) return false;
        this.moving += (0 - this.moving) * ease;
        if (Math.hypot(s.approach.x - this.pos.x, s.approach.z - this.pos.z) < 0.6) {
          j.phase = 'enter';
          j.t = 0;
          j.from = { ...this.pos };
          return true;
        }
        j.retryIn -= dt;
        if (j.retryIn <= 0) {
          j.retryIn = 0.5;
          this.goTo(nav, s.approach);
          if (!this.isWalking() && ++j.retries > 8) this.cancelMeet();
        }
        return true;
      }
      case 'enter': {
        j.t += dt / TRANSITION;
        const e = smooth(j.t / 0.65);
        this.pos.x = j.from.x + (s.seat.x - j.from.x) * e;
        this.pos.z = j.from.z + (s.seat.z - j.from.z) * e;
        this.sit = smooth((j.t - 0.55) / 0.45);
        this.turnTo(s.yaw, dt);
        this.step(dt, j.t < 0.65 ? 0.7 : 0);
        if (j.t >= 1) j.phase = 'sit';
        return true;
      }
      case 'sit': {
        this.pos.x = s.seat.x;
        this.pos.z = s.seat.z;
        this.sit = 1;
        this.turnTo(s.yaw, dt);
        this.moving += (0 - this.moving) * ease;
        if (j.dismissed) {
          j.phase = 'leave';
          j.t = 0;
        }
        return true;
      }
      case 'leave': {
        j.t += dt / TRANSITION;
        const e = smooth((j.t - 0.35) / 0.65);
        this.pos.x = s.seat.x + (s.approach.x - s.seat.x) * e;
        this.pos.z = s.seat.z + (s.approach.z - s.seat.z) * e;
        this.sit = 1 - smooth(j.t / 0.4);
        if (j.t > 0.25) this.turnTo(s.yaw + Math.PI, dt);
        this.step(dt, j.t > 0.35 ? 0.7 : 0);
        if (j.t >= 1) {
          this.cancelMeet();
          this.sit = 0;
          this.socialCooldown = 15 + Math.random() * 20;
        }
        return true;
      }
    }
  }

  private controlPrint(dt: number, nav: NavGrid): boolean {
    const job = this.printJob!;
    const pr = this.office?.printer;
    if (!pr || this.held) {
      this.cancelPrint();
      return false;
    }
    if (job.phase === 'approach') {
      if (this.state === 'walk') return false;
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      if (Math.hypot(pr.stand.x - this.pos.x, pr.stand.z - this.pos.z) < 0.6) {
        job.phase = 'print';
        pr.showPaper(true);
        return true;
      }
      job.retryIn -= dt;
      if (job.retryIn <= 0) {
        job.retryIn = 0.5;
        this.goTo(nav, pr.stand);
        if (!this.isWalking() && ++job.retries > 6) this.cancelPrint();
      }
      return true;
    }
    this.moving += (0 - this.moving) * Math.min(1, dt * 8);
    this.turnTo(pr.yaw, dt);
    job.remaining -= dt;
    if (job.remaining <= 0) {
      this.cancelPrint();
      this.timer = 0.3 + Math.random();
    }
    return true;
  }

  private controlFoos(dt: number, nav: NavGrid): boolean {
    const job = this.foosJob!;
    const other = job.partner.foosJob;
    if (this.held || !other || other.partner !== this || !job.partner.inOffice) {
      this.cancelFoos();
      return false;
    }
    if (job.phase === 'approach') {
      job.age += dt;
      if (job.age > 40) {
        this.cancelFoos();
        return false;
      }
      if (this.isWalking()) return false;
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      if (Math.hypot(job.spot.stand.x - this.pos.x, job.spot.stand.z - this.pos.z) < 0.6) {
        job.phase = 'ready';
        return true;
      }
      job.retryIn -= dt;
      if (job.retryIn <= 0) {
        job.retryIn = 0.5;
        this.goTo(nav, job.spot.stand);
        if (!this.isWalking() && ++job.retries > 6) this.cancelFoos();
      }
      return true;
    }
    this.moving += (0 - this.moving) * Math.min(1, dt * 8);
    this.turnTo(job.spot.yaw, dt);
    if (job.phase === 'ready') {
      job.age += dt;
      if (other.phase !== 'approach') job.phase = 'play';
      else if (job.age > 40) this.cancelFoos();
      return true;
    }
    // play: ease onto the exact spot
    const k = Math.min(1, dt * 3);
    this.pos.x += (job.spot.stand.x - this.pos.x) * k;
    this.pos.z += (job.spot.stand.z - this.pos.z) * k;
    job.remaining -= dt;
    if (job.remaining <= 0) {
      this.cancelFoos();
      this.timer = 0.5 + Math.random();
    }
    return true;
  }

  /** 0 = not playing .. 1 = hands on the rods */
  get foosAmt(): number {
    return this.foosJob?.phase === 'play' ? 1 : 0;
  }

  /** Walk to this side of the foosball table; `partner` plays the other side. False when already busy. */
  startFoosball(nav: NavGrid, spot: FoosSpot, partner: Person): boolean {
    if (spot.occupant || this.foosJob) return false;
    this.interrupt();
    spot.occupant = this;
    this.foosJob = { spot, partner, phase: 'approach', remaining: FOOS_TIME.min + Math.random() * (FOOS_TIME.max - FOOS_TIME.min), age: 0, retries: 0, retryIn: 0.5 };
    this.goTo(nav, spot.stand);
    return true;
  }

  /** Stops playing (game over, interrupted, or never got there); the opponent stops too. */
  cancelFoos(): void {
    const job = this.foosJob;
    if (!job) return;
    this.foosJob = null;
    if (job.spot.occupant === this) job.spot.occupant = null;
    this.path = [];
    this.state = 'idle';
    this.timer = 0.5 + Math.random();
    if (job.partner.foosJob?.partner === this) job.partner.cancelFoos();
  }

  /** True while on the way to the kitchen coffee break, or already in it. */
  get inCoffee(): boolean {
    return !!this.coffeeJob;
  }

  /** True once standing in the kitchen with a cup. */
  get coffeeReady(): boolean {
    return this.coffeeJob?.phase === 'drink';
  }

  /** 0 = cup held at chest height .. 1 = cup at the mouth (a sip every few seconds). */
  get cupSip(): number {
    const j = this.coffeeJob;
    if (!j || j.phase !== 'drink') return 0;
    const k = (j.t + j.offset) % 7;
    return k < 2.2 ? Math.sin((k / 2.2) * Math.PI) : 0;
  }

  /** Called to the kitchen: drops what they were doing, walks to `spot` and drinks a coffee until `dismissCoffee`. */
  callToCoffee(nav: NavGrid, spot: CoffeeSpot, talk: Talk): void {
    this.interrupt();
    spot.occupant = this;
    this.talk = talk;
    this.coffeeJob = { spot, talk, phase: 'approach', t: 0, age: 0, retries: 0, retryIn: 0.5, offset: Math.random() * 7, dismissed: false };
    this.goTo(nav, spot.stand);
  }

  /** The break is over (or this person was pulled out): lower the cup and leave, or give up on the way. */
  dismissCoffee(): void {
    const j = this.coffeeJob;
    if (!j || j.phase === 'approach') this.cancelCoffee();
    else j.dismissed = true;
  }

  /** Drops out of the coffee break right where they are. */
  cancelCoffee(): void {
    const j = this.coffeeJob;
    if (!j) return;
    if (j.spot.occupant === this) j.spot.occupant = null;
    if (this.talk === j.talk) {
      this.talk = null;
      this.speaking = false;
    }
    this.coffeeJob = null;
    this.path = [];
    this.state = 'idle';
    this.timer = 0.3 + Math.random();
    this.socialCooldown = Math.max(this.socialCooldown, 6 + Math.random() * 10);
  }

  private controlCoffee(dt: number, nav: NavGrid): boolean {
    const j = this.coffeeJob!;
    if (this.held) {
      this.cancelCoffee();
      return false;
    }
    const ease = Math.min(1, dt * 8);
    if (this.sit > 0.01) {
      // dropped from the desk: stand up first
      this.sit = Math.max(0, this.sit - dt * 4);
      this.moving += (0 - this.moving) * ease;
      return true;
    }
    const spot = j.spot;
    if (j.phase === 'approach') {
      j.age += dt;
      if (j.age > 70) {
        this.cancelCoffee();
        return false;
      }
      if (this.isWalking()) return false;
      this.moving += (0 - this.moving) * ease;
      if (Math.hypot(spot.stand.x - this.pos.x, spot.stand.z - this.pos.z) < 0.6) {
        j.phase = 'drink';
        j.t = 0;
        return true;
      }
      j.retryIn -= dt;
      if (j.retryIn <= 0) {
        j.retryIn = 0.5;
        this.goTo(nav, spot.stand);
        if (!this.isWalking() && ++j.retries > 8) this.cancelCoffee();
      }
      return true;
    }
    this.moving += (0 - this.moving) * ease;
    this.path = [];
    this.state = 'idle';
    this.timer = 1;
    const c = j.talk.center;
    this.turnTo(Math.atan2(c.x - this.pos.x, c.z - this.pos.z), dt);
    if (j.phase === 'drink') {
      j.t += dt;
      // drift back onto the spot when somebody nudged them
      const k = Math.min(1, dt * 2);
      this.pos.x += (spot.stand.x - this.pos.x) * k;
      this.pos.z += (spot.stand.z - this.pos.z) * k;
      if (j.dismissed) {
        j.phase = 'leave';
        j.t = 0;
      }
      return true;
    }
    // leave: the cup goes down first
    j.t += dt;
    if (j.t > 0.8) this.cancelCoffee();
    return true;
  }

  private controlVape(dt: number): boolean {
    const job = this.vapeJob!;
    if (this.held || this.controlled || this.talk) {
      this.vapeJob = null;
      return false;
    }
    this.moving += (0 - this.moving) * Math.min(1, dt * 8);
    this.path = [];
    job.t += dt;
    if (job.t >= VAPE_END) {
      if (--job.drags > 0) job.t = VAPE_RAISE;
      else {
        this.vapeJob = null;
        this.state = 'idle';
        this.timer = 0.8 + Math.random() * 2;
      }
    }
    return true;
  }

  /** Walk to the printer and print; false when it is busy. */
  startPrint(nav: NavGrid): boolean {
    const pr = this.office?.printer;
    if (!pr || pr.occupant) return false;
    pr.occupant = this;
    this.printJob = { phase: 'approach', remaining: PRINT_TIME.min + Math.random() * (PRINT_TIME.max - PRINT_TIME.min), retries: 0, retryIn: 0.5 };
    this.goTo(nav, pr.stand);
    return true;
  }

  /** Take a drag on the vape right where they stand. */
  startVape(drags = 1): void {
    this.vapeJob = { t: 0, drags };
    if (this.task?.phase === 'work') return; // seated: stays in the chair
    this.path = [];
    this.state = 'idle';
  }

  /** Drops whatever they were doing (desk, printer, vape) so a new activity can start. */
  interrupt(): void {
    this.phoneJob = null;
    if (this.inMeeting) this.dismissMeeting();
    const t = this.task;
    if (t && t.phase !== 'approach') {
      // sitting (or sitting down / getting up): step out of the chair, the stand-up pose plays in control()
      this.pos.x = t.desk.approach.x;
      this.pos.z = t.desk.approach.z;
      this.prev = { ...this.pos };
    }
    this.cancelTask();
  }

  /** Leaves the printer (done, interrupted, or never got there). */
  cancelPrint(): void {
    if (!this.printJob) return;
    const pr = this.office?.printer;
    if (pr?.occupant === this) {
      pr.occupant = null;
      pr.showPaper(false);
    }
    this.printJob = null;
    this.path = [];
    this.state = 'idle';
  }

  private cancelTask(): void {
    this.cancelPrint();
    this.cancelFoos();
    this.cancelCoffee();
    this.vapeJob = null;
    this.phoneJob = null;
    if (!this.task) return;
    this.office?.release(this.task.desk, this);
    this.task = null;
    this.path = [];
    this.state = 'idle';
  }
}
