import type * as THREE from 'three';
import type { TeamMember } from '../data/types';
import type { CharacterRig } from '../render/characterBuilder';
import { SIT_DROP } from '../render/officeBuilder';
import { DOOR_IN, DOOR_OUT } from './Door';
import type { NavGrid, Vec2 } from './NavGrid';
import type { MeetSeat } from './Meeting';
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
const TRANSITION = 1.1; // seconds to sit down / stand up

type Phase = 'approach' | 'enter' | 'work' | 'leave';

/** in = in the office, leaving = on the way out, out = gone (errand or home office), returning = coming back through the door */
export type Presence = 'in' | 'leaving' | 'out' | 'returning';
/** errand = popped out for a while, home = working from home (live feed available) */
export type AwayKind = 'errand' | 'home';

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
  awayKind: AwayKind | null = null;
  /** seconds until this person comes back (counts down while `out`) */
  awayLeft = 0;
  /** which of the home office variants this person works from */
  homeVariant = 0;
  /** the home office this person likes best (used when it is free) */
  preferredHome = 0;
  /** taking a drag on the vape */
  vapeJob: VapeJob | null = null;
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
    desk.setScreen(true);
  }

  override update(dt: number, nav: NavGrid, others: readonly Walker[] = []): void {
    super.update(dt, nav, others);
    this.clock += dt;
    if (this.rig.setMood && (this.moodTimer -= dt) <= 0) {
      this.moodTimer = 4 + Math.random() * 10;
      this.happy = !this.happy;
      this.rig.setMood(this.happy);
    }
  }

  private get adhd(): boolean {
    return !!this.member.adhd;
  }

  protected override idleTime(): number {
    return this.adhd ? 0.3 + Math.random() * 1.5 : super.idleTime();
  }

  protected decide(nav: NavGrid): void {
    const seek = this.displaced;
    this.displaced = false;
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

  protected override control(dt: number, nav: NavGrid): boolean {
    if (this.presence !== 'in') return this.controlPresence(dt, nav);
    if (this.controlled) {
      this.cancelPrint();
      this.cancelFoos();
      // the player takes over: stand up from the desk first, then walk freely
      const t = this.task;
      if (t?.phase === 'approach') this.cancelTask();
      else if (t?.phase === 'work') t.remaining = 0;
      if (this.inMeeting) this.dismissMeeting();
      if (!this.task && !this.meetJob) return this.steerStep(dt);
    }
    if (this.meetJob) return this.controlMeet(dt, nav);
    if (!this.task && this.sit > 0.01) {
      // dropped from the desk: stand up first, only then start the next thing
      this.sit = Math.max(0, this.sit - dt * 4);
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      return true;
    }
    if (this.vapeJob) return this.controlVape(dt);
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
          d.setScreen(true);
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
        if (task.remaining <= 0) {
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
    this.path = [];
    this.state = 'idle';
  }

  /** Drops whatever they were doing (desk, printer, vape) so a new activity can start. */
  interrupt(): void {
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
    this.vapeJob = null;
    if (!this.task) return;
    this.office?.release(this.task.desk, this);
    this.task = null;
    this.path = [];
    this.state = 'idle';
  }
}
