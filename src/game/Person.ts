import { REACTION_TIME, type Reaction } from './Chatter';
import type * as THREE from 'three';
import { screenKindOf, screenSeed } from '../data/screens';
import type { TeamMember } from '../data/types';
import type { CharacterRig } from '../render/characterBuilder';
import { SIT_DROP } from '../render/officeBuilder';
import { screenVariants, type ScreenKind } from '../render/screens';
import { CORRIDOR_POINT } from '../render/officeModel';
import { DOOR_LANES, pickDoorLane, type DoorLane } from './Door';
import type { NavGrid, Vec2 } from './NavGrid';
import type { MeetSeat } from './Meeting';
import type { CoffeeSpot, Kitchen, MachineSpot } from './Coffee';
import type { Desk, FoosSpot, Office } from './Office';
import type { Talk } from './Social';
import type { Dog } from './Dog';
import { Walker } from './Walker';
import { KURT, rollHomeAlter, transformsOnLeave } from './AlterEgo';
import { random } from './rng';

const WORK_CHANCE = 0.75; // chance per decision to go sit down instead of wandering
const WORK_TIME = { min: 90, max: 240 }; // seconds a person stays at the desk
const PRINT_CHANCE = 0.12; // chance per decision to walk to the printer
const PRINT_TIME = { min: 4, max: 9 }; // seconds spent at the printer
const STEER_WALK = 2.2; // m/s while steered with the keyboard
const STEER_RUN = 5.4;
const VAPE_CHANCE = 0.15; // chance per decision (vapers only) to take a drag instead
const VAPE_RAISE = 0.6; // timeline of one drag, seconds: raise the hand, inhale, hold, exhale (arm drops during it)
const VAPE_DRAW = 2.0;
const VAPE_HOLD = 2.5;
const VAPE_LOWER = 3.0;
const VAPE_END = 5.2;
const FOOS_CHANCE = 0.03; // chance per decision to challenge somebody to foosball
const FOOS_TIME = { min: 25, max: 50 }; // seconds of one game
const FOOS_APPROACH = 90; // seconds both players may take to reach the table (from the far end of the office it takes about 45)
const PHONE_CHANCE = 0.4; // chance per decision (phone people only) to take a call while walking around
const PHONE_TIME = { min: 30, max: 80 }; // seconds of one call
const PHONE_PACE_CHANCE = 0.5; // chance that a call is spent pacing up and down one path instead of wandering
const SEAT_PHONE_RATE = 0.02; // per second while working at the desk (phone people): chance to take a call right in the chair
const SEAT_PHONE_TIME = { min: 15, max: 40 };
const UNSTUCK_AFTER = 2; // seconds somebody who stood up from a chair may stand without getting away before they step out
const UNSTUCK_AWAY = 0.6; // metres from where they stood up that count as got away
const UNSTUCK_TRIES = 3; // steps out of one stand-up, then they are left alone
const SEAT_VAPE_RATE = 0.015; // per second while working at the desk (vapers): chance to take a drag without getting up
const PHONE_PACE_LEN = { min: 3.5, max: 9 }; // metres between the two ends of a pacing path
const TRANSITION = 1.1; // seconds to sit down / stand up
const RUN_RATE = 0.012; // per second at the desk without a coffee: chance to get up and fetch one (a lot less with a mug still on the desk)
const RUN_CHANCE = 0.1; // per decision while wandering: fetch a coffee from the machine
const BREW = 4.2; // seconds at the machine
const SNACK_GRAB = 2.2; // seconds in the kitchen taking a bag of chips
const SNACK_TIME = { min: 45, max: 90 }; // seconds the chips last while strolling around
const SNACK_CHANCE = 0.12; // per decision while wandering (snackers only): go and get chips
const SNACK_RATE = 0.006; // per second at the desk (snackers only): chance to get up for chips
const BITE_GAP = 5.5; // seconds between two chips
const BITE_TIME = 2.0; // seconds one chip takes from the bag to the mouth and down again
const CUP_LIFE = 70; // seconds a carried cup lasts when it never makes it to a desk
const SEAT_DRINK_RATE = 0.14; // per second at the desk with coffee on it: chance to take a sip
/** timeline of a sip at the desk (seconds): hand out to the mug, back to the body, sip, down to the desk, mug set down, hand back to the keys */
const DRINK = { grab: 0.6, up: 1.1, sipEnd: 3.1, put: 3.6, end: 4.1 };
const EMOTE_GAP = { min: 12, max: 38 }; // seconds between two little gestures (yawn, stretch, ...)
export type Emote = 'yawn' | 'stretch' | 'scratch' | 'look';
const EMOTES: Array<[Emote, number, number]> = [
  // kind, weight, seconds
  ['yawn', 3, 2.8],
  ['stretch', 2, 3.0],
  ['scratch', 3, 3.2],
  ['look', 2, 2.4],
];

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
  /** where standing up from the chair ends (`Office.exit`), picked when they get up */
  out?: Vec2;
  /** about to leave the desk for a coffee: where at the machine, and how much work was left */
  errand?: { spot: MachineSpot; left: number; snack?: boolean };
}

/** On the way to the espresso machine, brewing, then back to the desk with the cup (the desk stays reserved meanwhile). */
interface CoffeeRun {
  phase: 'out' | 'brew';
  /** the desk to go back to (null: none, takes any free one on the way back) */
  desk: Desk | null;
  left: number;
  spot: MachineSpot;
  /** a bag of chips instead of a coffee */
  snack?: boolean;
  t: number;
  age: number;
  retries: number;
  retryIn: number;
}

/** A sip taken at the desk (see DRINK for the timeline). `held`: the mug is in the hand. */
interface Drink {
  t: number;
  held: boolean;
  sipped: boolean;
  desk: Desk;
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
  /** set when the player dropped the person on the chair: seconds left sitting there alone */
  solo?: number;
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
  speed = 1.0 + random() * 0.5;
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
  /** a day task pins this person: they stand (or sit) exactly there and turn to `yaw`; they are `controlled` meanwhile, so nothing else picks them up */
  scripted: { at: Vec2; yaw: number; sit: boolean; turn: number; arrived: boolean; tries: number } | null = null;
  /** a day task has the handheld console out (see `gameboy` for the eased amount) */
  gameboyOn = false;
  /** 0..1 eased: both hands hold a handheld console in front of the chest */
  gameboy = 0;
  /** the player (walk mode) is talking to this person: they stop and face `at` until `t` runs out */
  playerChat: { t: number; total: number; at: Vec2 } | null = null;
  /** stroking a pet (reuses the stop-and-turn of `playerChat`, but without the talking gestures) */
  petting = false;
  /** 0..1 eased petting pose */
  petAmt = 0;
  /** back height (m) of the pet being stroked: sets how deep the crouch goes */
  petHeight = 0.4;
  /** last frame time of the pet pose (s), to ease it in real time */
  petClock = 0;
  private kind: AwayKind | null = null;
  /** shows the alter ego right now (walking out after the spin) */
  alter = false;
  /** this home office spell shows the alter ego in the feed (rolled when the spell starts) */
  homeAlter = false;
  /** sent out by hand on the current trip: an alter ego stays itself, also if the plan turns it into going home */
  private leftManually = false;
  /** seconds left of the spin on the spot before walking out as the alter ego */
  spin = 0;
  /** set when the skin swaps (a poof for the game to show at this person), cleared by the game */
  poof = false;
  /** seconds until this person comes back (counts down while `out`) */
  awayLeft = 0;
  /** pets that come and go with this person (registered by `Dog`) */
  pets: Dog[] = [];
  /** which of the home office variants this person works from */
  homeVariant = 0;
  /** the home office this person likes best (used when it is free) */
  preferredHome = 0;
  /** taking a drag on the vape */
  vapeJob: VapeJob | null = null;
  /** on a phone call, walking around with the phone at the ear */
  phoneJob: PhoneJob | null = null;
  /** seconds the player's person still holds a picked-up phone to the ear (see `takeCall`) */
  playerCall = 0;
  /** 0 = phone down .. 1 = at the ear (eased, kept after the call ends until the hand is down) */
  phoneAmt = 0;
  /** on a call, sitting in the phone box (phone at the ear while seated) */
  boothCall = false;
  /** walking to / standing in the kitchen with a coffee */
  coffeeJob: CoffeeJob | null = null;
  /** 0 = no cup .. 1 = cup in the hand (eased) */
  cupAmt = 0;
  /** where the espresso machine is (set by the game) */
  kitchen: Kitchen | null = null;
  /** fetching a coffee from the machine */
  run: CoffeeRun | null = null;
  /** carrying a cup (from the machine, or from the kitchen chat) */
  cupHeld = false;
  /** how full the carried cup is, 0..1 */
  cupFill = 1;
  private cupLeft = 0;
  /** seconds the bag of chips in the left hand still lasts (0 = no chips) */
  snackLeft = 0;
  /** 0..1 eased: a bag of chips in the left hand */
  snackAmt = 0;
  private snackClock = 0;
  /** the chips stay in the hand although the player steers this person (set by `grabSnack`) */
  private snackSteered = false;
  /** taking a sip from the mug on the desk */
  drink: Drink | null = null;
  /** 0..1 eased: the left arm is busy with the mug */
  drinkAmt = 0;
  /** a little gesture in progress: yawn, stretch, scratching the head, looking around */
  emote: { kind: Emote; t: number; dur: number } | null = null;
  /** the last gesture, its progress 0..1, its strength 0..1 (eased in and out) and which way `look` turns */
  emoteKind: Emote = 'yawn';
  emoteP = 0;
  emoteAmt = 0;
  emoteDir: 1 | -1 = 1;
  /** body language during a talk (laugh, shrug, point, ...); `t` runs from a small negative delay up to `dur` */
  reaction: { kind: Reaction; t: number; dur: number; free?: boolean } | null = null;
  private emoteIn = EMOTE_GAP.min + random() * (EMOTE_GAP.max - EMOTE_GAP.min);
  /** walking to / sitting in the meeting room */
  meetJob: MeetJob | null = null;
  /** while sitting in a meeting: look at this point (the TV) instead of across the table */
  meetFocus: Vec2 | null = null;
  /** called to a meeting while still at a desk: goes once they have stood up */
  private pendingMeet: { seat: MeetSeat; talk: Talk; nav: NavGrid } | null = null;
  /** stood up from a desk: where, for how long they have not got away from there, and how often they stepped out (see `unstick`) */
  private stoodUp: { at: Vec2; t: number; tries: number } | null = null;
  /** the step out of a spot with no way on: a straight walk that ignores the nav grid (`fixed` meanwhile, so nothing pushes it back) */
  private stepOut: { from: Vec2; to: Vec2; t: number; dur: number } | null = null;
  private presenceRetry = 0;
  private presenceRetries = 0;
  private baseHead: number;
  private moodTimer = 2 + random() * 6;
  private happy = true;
  private clock = random() * 100;
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

  get awayKind(): AwayKind | null {
    return this.kind;
  }

  /** Every home office spell (by day, at night, or right from the start) rolls whether the feed shows the alter ego. */
  set awayKind(k: AwayKind | null) {
    if (k === 'home' && this.kind !== 'home') this.homeAlter = rollHomeAlter(this.member);
    this.kind = k;
  }

  /** The alter ego is what people see: walking out after the spin, or in the home office feed. */
  get asAlter(): boolean {
    return this.alter || (this.presence === 'out' && this.kind === 'home' && this.homeAlter);
  }

  /** Name for labels, tooltip, roster and feeds. */
  get displayName(): string {
    return this.asAlter ? KURT.name : this.member.name;
  }

  private setAlter(on: boolean): void {
    if (this.alter === on) return;
    this.alter = on;
    this.rig.setAlter?.(on);
  }

  get headHeight(): number {
    return this.baseHead - SIT_DROP * this.scale * this.sit;
  }

  override get fixed(): boolean {
    if (this.presence === 'out' || this.script || this.stepOut || this.scripted?.arrived) return true;
    if (this.printJob?.phase === 'print') return true;
    if (this.run?.phase === 'brew') return true;
    if (this.foosJob?.phase === 'play') return true;
    if (this.meetJob) return this.meetJob.phase !== 'approach';
    return !!this.task && this.task.phase !== 'approach';
  }

  /** Kneeling to stroke a pet: stays where they knelt down. */
  override get steady(): boolean {
    return this.petting;
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
      this.dropErrand(t);
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
    this.meetFocus = null;
    this.pendingMeet = null;
    this.path = [];
    this.state = 'idle';
    this.timer = 0.3 + random();
  }

  /** True while in the office and free to do office things (desk, chat). */
  get inOffice(): boolean {
    return this.presence === 'in';
  }

  /** the wing of the entrance door this person uses on the current trip */
  lane: DoorLane = DOOR_LANES[0];

  /** Walk to the door and leave; comes back after `seconds`. Going home (not `manual`ly sent), an alter ego spins and walks out as itself. */
  leaveOffice(nav: NavGrid, kind: AwayKind, seconds: number, manual = false): void {
    this.cancelTask();
    // a chat or a stroke ends at the door
    this.playerChat = null;
    this.speaking = false;
    this.petting = false;
    this.leftManually = manual;
    this.lane = pickDoorLane();
    this.presence = 'leaving';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.presenceRetries = 0;
    this.presenceRetry = 0;
    this.spin = transformsOnLeave(this.member, kind, manual) && !this.alter ? KURT.spin : 0;
    this.goTo(nav, this.lane.in);
  }

  /** Plans changed while away or on the way out (lunch became the end of the day): going home now, an alter ego still spins first. */
  leaveAs(kind: AwayKind): void {
    this.awayKind = kind;
    if (this.presence === 'leaving' && !this.script && !this.alter && this.spin === 0 && transformsOnLeave(this.member, kind, this.leftManually)) this.spin = KURT.spin;
  }

  /** Start the game already outside. */
  startAway(kind: AwayKind, seconds: number): void {
    this.cancelTask();
    this.sit = 0;
    this.presence = 'out';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.spin = 0;
    this.setAlter(false);
    this.setAway(true);
  }

  /** In the office at `at` right now, without the walk through the door (a scene puts them there). */
  arriveNow(at: Vec2): void {
    this.spin = 0;
    this.setAlter(false);
    this.script = null;
    this.presence = 'in';
    this.awayKind = null;
    this.appearNow();
    this.placeAt(at);
    this.timer = 0.5;
  }

  private comeBack(): void {
    this.setAlter(false); // always back in as Marco
    this.presence = 'returning';
    this.setAway(false);
    this.lane = pickDoorLane();
    this.pos = { ...this.lane.out };
    this.prev = { ...this.lane.out };
    this.yaw = this.prevYaw = Math.PI;
    this.startScript(this.lane.in, this.speed * 0.9);
    for (const d of this.pets) d.arriveWith(this);
  }

  /** Called back before they got out of the door. */
  cancelLeave(): void {
    if (this.presence === 'leaving') this.abortLeaving();
  }

  private abortLeaving(): void {
    if (this.alter || this.spin > 0) this.poof = true; // back to themselves
    this.spin = 0;
    this.setAlter(false);
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
        if (this.spin > 0) {
          // going home: spin on the spot, swap into the alter ego halfway (poof), then off to the door
          this.spin = Math.max(0, this.spin - dt);
          this.yaw += (dt / KURT.spin) * Math.PI * 4;
          this.moving += (0 - this.moving) * Math.min(1, dt * 8);
          if (!this.alter && this.spin <= KURT.spin / 2) {
            this.setAlter(true);
            this.poof = true;
          }
          if (this.spin === 0) this.goTo(nav, this.lane.in);
          return true;
        }
        if (this.script) {
          if (this.runScript(dt)) return true;
          this.presence = 'out';
          this.setAway(true); // still Kurt while he fades out of the doorway, Marco again once gone (see 'out')
          for (const d of this.pets) d.sendAway(); // pets vanish with the owner, wherever they are
          return true;
        }
        if (this.isWalking()) return false; // normal walking to the door
        this.moving += (0 - this.moving) * Math.min(1, dt * 8);
        if (Math.hypot(this.lane.in.x - this.pos.x, this.lane.in.z - this.pos.z) < 0.7) {
          this.startScript(this.lane.out);
          return true;
        }
        this.presenceRetry -= dt;
        if (this.presenceRetry <= 0) {
          this.presenceRetry = 0.5;
          this.goTo(nav, this.lane.in);
          if (!this.isWalking() && ++this.presenceRetries > 8) this.abortLeaving();
        }
        return true;
      }
      case 'out':
        if (this.alter && this.fx === 0) this.setAlter(false); // through the door and gone: Marco again
        this.awayLeft -= dt;
        // pets still around (not yet despawned) hold up the arrival: both appear together
        if (this.awayLeft <= 0) {
          if (this.pets.some((d) => !d.away)) this.awayLeft = 0.3;
          else this.comeBack();
        }
        return true;
      case 'returning':
        if (this.held) {
          this.abortLeaving();
          return false;
        }
        if (this.fx < 1) {
          // still materialising: stand there until the show is over, then walk in
          this.moving += (0 - this.moving) * Math.min(1, dt * 8);
          return true;
        }
        if (this.runScript(dt)) return true;
        this.presence = 'in';
        this.awayKind = null;
        this.state = 'idle';
        // just in: walk on to a desk right away instead of standing about in the entrance (later arrivals need the room)
        this.timer = 0.1 + random() * 0.3;
        this.displaced = true;
        this.socialCooldown = Math.max(this.socialCooldown, 10);
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
    this.task = { desk, phase: 'work', t: 0, from: desk.seat, remaining: (40 + random() * 160) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0 };
    this.pos.x = this.prev.x = desk.seat.x;
    this.pos.z = this.prev.z = desk.seat.z;
    this.yaw = this.prevYaw = desk.yaw;
    this.sit = 1;
    this.state = 'idle';
    desk.setScreen(true, this.pickScreen());
    if (random() < 0.35 && !this.member.hatesCoffee) desk.putMug(0.25 + random() * 0.7); // a coffee already waiting on the desk
  }

  /** Chair the held person is currently snapped to (set by the game while dragging). */
  snapDesk: Desk | null = null;

  /** Can this person be put on `desk` by the player (free chair, nothing else keeping them busy)? */
  canSit(desk: Desk, steal = false): boolean {
    const o = desk.occupant;
    return this.presence === 'in' && !this.controlled && !this.talk && !this.inMeeting && !this.pendingMeet && !desk.pending && (!o || o === this || (steal && o.canBeBumped));
  }

  /** Somebody else may take this person's chair: they are in the office and not carried / steered by the player. */
  get canBeBumped(): boolean {
    return this.presence === 'in' && !this.controlled && !this.held;
  }

  /** The player put somebody else on this person's desk: they stand up and look for another one. */
  evictFromDesk(desk: Desk): void {
    if (this.run?.desk === desk) {
      this.run.desk = null;
      this.office?.release(desk, this);
    } else {
      this.cancelTask();
      if (desk.occupant === this) this.office?.release(desk, this);
    }
    this.displaced = true;
    this.sit = 0;
    this.pos.x = this.prev.x = desk.approach.x;
    this.pos.z = this.prev.z = desk.approach.z;
    this.timer = 0.4 + random() * 0.6;
  }

  /** The player put somebody else on this person's meeting chair: they stand up where the chair is open. */
  evictFromMeeting(seat: MeetSeat): void {
    this.cancelMeet();
    this.sit = 0;
    this.pos.x = this.prev.x = seat.approach.x;
    this.pos.z = this.prev.z = seat.approach.z;
  }

  /** Meeting-room chair the held person is currently snapped to (set by the game while dragging). */
  snapMeetSeat: MeetSeat | null = null;

  /** Can this person be put on this meeting chair by the player? */
  canSitMeet(seat: MeetSeat, steal = false): boolean {
    const o = seat.occupant;
    return this.presence === 'in' && !this.controlled && !this.talk && !this.inMeeting && !this.pendingMeet && (!o || o === this || (steal && o.canBeBumped));
  }

  /** Dropped on a meeting chair by the player: sit there for a while (or until `session` ends, e.g. the phone box call). */
  sitDownAtMeeting(seat: MeetSeat, session?: Talk): boolean {
    if (!this.canSitMeet(seat)) return false;
    this.cancelTask();
    seat.occupant = this;
    const talk: Talk = session ?? { kind: 'chat', center: { ...seat.seat }, members: [this] };
    if (session) this.talk = session;
    this.meetJob = { seat, talk, phase: 'sit', t: 0, from: { ...seat.seat }, age: 0, retries: 0, retryIn: 0, dismissed: false, solo: session ? undefined : 20 + random() * 25 };
    this.pos.x = this.prev.x = seat.seat.x;
    this.pos.z = this.prev.z = seat.seat.z;
    this.yaw = this.prevYaw = seat.yaw;
    this.sit = 1;
    this.path = [];
    this.state = 'idle';
    return true;
  }

  /** Dropped on a chair by the player: sit there and start working. */
  sitDownAt(desk: Desk): boolean {
    if (!this.canSit(desk)) return false;
    this.cancelTask();
    desk.occupant = this;
    this.task = { desk, phase: 'work', t: 0, from: { ...desk.seat }, remaining: (WORK_TIME.min + random() * (WORK_TIME.max - WORK_TIME.min)) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0 };
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
    this.gameboy += ((this.gameboyOn && this.presence === 'in' ? 1 : 0) - this.gameboy) * Math.min(1, dt * 10);
    if (this.gameboy < 0.005) this.gameboy = 0;
    this.updatePhone(dt);
    if (this.cupHeld && ((this.cupLeft -= dt) <= 0 || this.presence !== 'in' || this.meetJob || this.held)) this.cupHeld = false;
    this.updateSnack(dt);
    this.cupAmt += ((this.coffeeJob?.phase === 'drink' || this.cupHeld ? 1 : 0) - this.cupAmt) * Math.min(1, dt * 4);
    if (this.cupAmt < 0.005) this.cupAmt = 0;
    this.drinkAmt += ((this.drink ? 1 : 0) - this.drinkAmt) * Math.min(1, dt * 6);
    if (this.drinkAmt < 0.005) this.drinkAmt = 0;
    this.updateEmote(dt);
    const rc = this.reaction;
    if (rc && ((rc.t += dt) >= rc.dur || (!rc.free && (!this.talk || this.moving > 0.3)))) this.reaction = null;
    super.update(dt, nav, others);
    this.clock += dt;
    if (this.rig.setMood && (this.moodTimer -= dt) <= 0) {
      this.moodTimer = 4 + random() * 10;
      this.happy = !this.happy;
      this.rig.setMood(this.happy);
    }
  }

  /** Chips in the hand: they run out, or get binned as soon as something else (desk, meeting, call, being picked up) takes over. */
  private updateSnack(dt: number): void {
    if (this.snackLeft > 0) {
      this.snackLeft -= dt;
      this.snackClock += dt;
      const busy = this.presence !== 'in' || this.held || (this.controlled && !this.snackSteered) || this.task || this.run || this.meetJob || this.coffeeJob || this.printJob || this.foosJob || this.phoneJob || this.vapeJob || this.cupHeld;
      if (busy) this.snackLeft = 0;
    }
    if (this.snackLeft <= 0) this.snackSteered = false;
    this.snackAmt += ((this.snackLeft > 0 ? 1 : 0) - this.snackAmt) * Math.min(1, dt * 4);
    if (this.snackAmt < 0.005) this.snackAmt = 0;
  }

  /** The player picked up a snack: a bag of chips in the hand and a chip to the mouth right away, also while steered. */
  grabSnack(): void {
    if (this.snackLeft <= 0 || this.snackBite === 0) this.snackClock = BITE_GAP * 3 - 0.6 - this.homeVariant * 1.3;
    this.snackLeft = Math.max(this.snackLeft, SNACK_TIME.min * 0.2);
    this.snackSteered = true;
  }

  /** 0 = hand down .. 1 = chip at the mouth (one every few seconds). */
  get snackBite(): number {
    if (this.snackLeft <= 0) return 0;
    const k = (this.snackClock + this.homeVariant * 1.3) % BITE_GAP;
    return k < BITE_TIME ? Math.sin((k / BITE_TIME) * Math.PI) : 0;
  }

  /** The chip is still in the fingers (on its way up), not yet eaten. */
  get snackChipInHand(): boolean {
    if (this.snackLeft <= 0) return false;
    const k = (this.snackClock + this.homeVariant * 1.3) % BITE_GAP;
    return k > 0.15 && k < BITE_TIME * 0.5;
  }

  /** Play a bit of body language during a talk, after `delay` seconds. */
  react(kind: Reaction, delay = 0): void {
    if (!this.talk || this.held || this.controlled) return;
    this.reaction = { kind, t: -delay, dur: REACTION_TIME[kind] };
  }

  /** A welcome gesture (cheer, wave) that needs no conversation, for `seconds`: for greeting somebody who just came in. */
  welcome(kind: Reaction, delay = 0, seconds = REACTION_TIME[kind] * 1.6): void {
    if (this.presence !== 'in' || this.held || (this.controlled && !this.scripted)) return;
    this.reaction = { kind, t: -delay, dur: seconds, free: true };
  }

  /** Free to do a little gesture: sitting at the desk working, or standing around doing nothing. */
  private canEmote(): boolean {
    if (this.presence !== 'in' || this.held || this.controlled || this.phoneJob || this.vapeJob || this.drink || this.cupHeld || this.coffeeJob || this.meetJob || this.pendingMeet || this.run) return false;
    if (this.printJob || this.foosJob || this.playerChat) return false;
    if (this.task) return this.task.phase === 'work' && !this.task.errand;
    return this.state === 'idle' && this.moving < 0.2 && this.sit < 0.05 && !this.talk;
  }

  /** Now and then a yawn, a stretch, a scratch of the head or a look around; eases in and out of the pose. */
  private updateEmote(dt: number): void {
    const e = this.emote;
    if (e) {
      e.t += dt;
      this.emoteP = Math.min(1, e.t / e.dur);
      if (e.t >= e.dur || !this.canEmote()) this.emote = null;
    } else if ((this.emoteIn -= dt) <= 0) {
      this.emoteIn = (EMOTE_GAP.min + random() * (EMOTE_GAP.max - EMOTE_GAP.min)) * (this.adhd ? 0.6 : 1);
      if (this.canEmote()) {
        let pick = random() * EMOTES.reduce((n, x) => n + x[1], 0);
        const [kind, , dur] = EMOTES.find((x) => (pick -= x[1]) < 0) ?? EMOTES[0];
        this.emote = { kind, t: 0, dur };
        this.emoteKind = kind;
        this.emoteP = 0;
        this.emoteDir = random() < 0.5 ? 1 : -1;
      }
    }
    const k = this.emote ? smooth(Math.min(this.emote.t, this.emote.dur - this.emote.t) / 0.45) : 0;
    this.emoteAmt += (k - this.emoteAmt) * Math.min(1, dt * 12);
    if (this.emoteAmt < 0.005) this.emoteAmt = 0;
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
    if (this.playerCall > 0) this.playerCall -= dt;
    this.phoneAmt += ((this.phoneJob || this.playerCall > 0 || (this.boothCall && this.meetSeated) ? 1 : 0) - this.phoneAmt) * Math.min(1, dt * 5);
    if (this.phoneAmt < 0.005) this.phoneAmt = 0;
  }

  /** The player picked up a ringing phone: the phone goes to the ear for a few seconds, also while steered. */
  takeCall(seconds = 3): void {
    this.playerCall = Math.max(this.playerCall, seconds);
  }

  /** Starts a phone call: walks around with the phone at the ear, either up and down one path or from spot to spot. */
  startPhone(nav: NavGrid): void {
    const pace = random() < PHONE_PACE_CHANCE;
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
    this.phoneJob = { remaining: PHONE_TIME.min + random() * (PHONE_TIME.max - PHONE_TIME.min), mode: pace ? 'pace' : 'wander', a, b, toB: true };
    this.phoneStep(nav);
  }

  /** Takes a call without leaving the chair. */
  private startSeatedPhone(task: DeskTask): void {
    const time = SEAT_PHONE_TIME.min + random() * (SEAT_PHONE_TIME.max - SEAT_PHONE_TIME.min);
    this.phoneJob = { remaining: Math.min(time, Math.max(2, task.remaining - 1)), mode: 'sit', a: { ...this.pos }, b: { ...this.pos }, toB: true };
  }

  /** Occasionally a phone call or a vape drag while sitting at the desk. */
  private seatedBreaks(dt: number, task: DeskTask, nav: NavGrid): void {
    if (this.held || this.talk || this.phoneJob || this.vapeJob || this.drink || this.cupHeld || task.remaining < 6) return;
    if (this.member.look.phone && random() < SEAT_PHONE_RATE * dt) this.startSeatedPhone(task);
    else if (this.member.look.vape && random() < SEAT_VAPE_RATE * dt) this.startVape(random() < 0.35 ? 2 : 1);
    else if (!this.emote) {
      const d = task.desk;
      const coffee = d.mugFill !== null && d.mugFill > 0.06;
      if (coffee && random() < SEAT_DRINK_RATE * dt) this.drink = { t: 0, held: false, sipped: false, desk: d };
      else if (this.member.snacker && task.remaining > 18 && !task.errand && random() < SNACK_RATE * dt) this.startRun(task, nav, true);
      else if (!this.member.hatesCoffee && task.remaining > 18 && !task.errand && random() < RUN_RATE * (coffee ? 0.15 : 1) * dt) this.startRun(task, nav);
    }
  }

  /** Gets up for a coffee: the desk stays theirs while they are at the machine. */
  private startRun(task: DeskTask, nav: NavGrid, snack = false): void {
    const spot = this.kitchen?.claimMachine(this, nav);
    if (!spot) return;
    task.errand = { spot, left: task.remaining, snack };
    task.remaining = 0; // the usual stand-up follows; `beginRun` takes over at the end of it
  }

  /** Changed their mind about the coffee run (called to a meeting, desk wanted by its owner). */
  private dropErrand(task: DeskTask): void {
    if (!task.errand) return;
    task.errand = undefined;
    this.kitchen?.releaseMachine(this);
  }

  /** Stood up from the desk with a coffee in mind: off to the machine, the desk stays reserved. */
  private beginRun(task: DeskTask, nav: NavGrid): void {
    const e = task.errand!;
    this.task = null;
    this.sit = 0;
    this.state = 'idle';
    this.path = [];
    this.run = { phase: 'out', desk: task.desk, left: e.left, spot: e.spot, snack: e.snack, t: 0, age: 0, retries: 0, retryIn: 0.5 };
    this.goTo(nav, e.spot.stand);
  }

  /** Walks over from wherever they are (no desk to go back to; they pick one on the way back). */
  private startWanderRun(nav: NavGrid, snack = false): boolean {
    const spot = this.kitchen?.claimMachine(this, nav);
    if (!spot) return false;
    this.run = { phase: 'out', desk: null, left: 0, spot, snack, t: 0, age: 0, retries: 0, retryIn: 0.5 };
    this.goTo(nav, spot.stand);
    return true;
  }

  private controlRun(dt: number, nav: NavGrid): boolean {
    const j = this.run!;
    if (this.held) {
      this.cancelRun();
      return false;
    }
    const ease = Math.min(1, dt * 8);
    j.age += dt;
    if (j.phase === 'out') {
      if (j.age > 70) {
        this.cancelRun();
        return false;
      }
      if (this.isWalking()) return false;
      this.moving += (0 - this.moving) * ease;
      if (Math.hypot(j.spot.stand.x - this.pos.x, j.spot.stand.z - this.pos.z) < 0.6) {
        j.phase = 'brew';
        j.t = 0;
        if (j.snack) return true; // reaches into the cupboard for chips
        this.cupHeld = true; // takes a cup from the shelf
        this.cupFill = 0;
        this.cupLeft = CUP_LIFE + BREW;
        return true;
      }
      j.retryIn -= dt;
      if (j.retryIn <= 0) {
        j.retryIn = 0.5;
        this.goTo(nav, j.spot.stand);
        if (!this.isWalking() && ++j.retries > 8) this.cancelRun();
      }
      return true;
    }
    // brew: facing the machine with the cup under the spout
    this.moving += (0 - this.moving) * ease;
    this.path = [];
    this.state = 'idle';
    this.timer = 1;
    this.turnTo(j.spot.yaw, dt);
    const k = Math.min(1, dt * 3);
    this.pos.x += (j.spot.stand.x - this.pos.x) * k;
    this.pos.z += (j.spot.stand.z - this.pos.z) * k;
    j.t += dt;
    if (j.snack) {
      if (j.t >= SNACK_GRAB) this.finishSnackGrab();
      return true;
    }
    this.cupFill = Math.min(1, j.t / (BREW - 0.8));
    if (j.t >= BREW) this.finishBrew(nav);
    return true;
  }

  /** Got the chips: the desk (if the run started there) is given up, now strolling around the office eating them. */
  private finishSnackGrab(): void {
    const j = this.run!;
    this.kitchen?.releaseMachine(this);
    this.run = null;
    if (j.desk) this.office?.release(j.desk, this);
    this.snackLeft = SNACK_TIME.min + random() * (SNACK_TIME.max - SNACK_TIME.min);
    this.snackClock = BITE_GAP - 0.6; // first chip right away
    this.state = 'idle';
    this.path = [];
    this.timer = 0.2;
  }

  /** Coffee is ready: back to the desk with it (or to any free one). */
  private finishBrew(nav: NavGrid): void {
    const j = this.run!;
    this.kitchen?.releaseMachine(this);
    this.run = null;
    this.cupFill = 1;
    this.cupLeft = CUP_LIFE;
    this.displaced = false;
    this.state = 'idle';
    this.path = [];
    this.timer = 0.2;
    const desk = j.desk ?? this.office?.claim(this) ?? null;
    if (!desk) return;
    const left = j.desk ? Math.max(j.left, 20) : (WORK_TIME.min + random() * (WORK_TIME.max - WORK_TIME.min)) * (this.adhd ? 0.3 : 1);
    this.task = { desk, phase: 'approach', t: 0, from: { ...this.pos }, remaining: left, retries: 0, retryIn: 0.5 };
    this.goTo(nav, desk.approach);
  }

  /** Gives up the coffee run where they stand (the desk is free again). */
  cancelRun(): void {
    this.kitchen?.releaseMachine(this);
    const j = this.run;
    if (!j) return;
    this.run = null;
    if (j.phase === 'brew') this.cupHeld = false;
    if (j.desk) this.office?.release(j.desk, this);
    this.path = [];
    this.state = 'idle';
    this.timer = 0.3 + random();
  }

  /** Advances the sip at the desk; arrived with a coffee: sip first, then set it down. */
  private tickDrink(dt: number, task: DeskTask): void {
    const d = task.desk;
    let dr = this.drink;
    if (!dr) {
      if (!this.cupHeld) return;
      this.cupLeft = CUP_LIFE;
      // arrived with the cup: it goes down on the desk first, the sips follow from there
      this.drink = dr = { t: DRINK.sipEnd, held: true, sipped: true, desk: d };
    }
    dr.t += dt;
    if (!dr.held && dr.t >= DRINK.grab && dr.t < DRINK.put) {
      dr.held = true;
      this.cupHeld = true;
      this.cupFill = d.mugFill ?? 1;
      this.cupLeft = CUP_LIFE;
      d.holdMug();
    }
    if (!dr.sipped && dr.t >= (DRINK.up + DRINK.sipEnd) / 2) {
      dr.sipped = true;
      this.cupFill = Math.max(0, this.cupFill - 0.2);
    }
    if (dr.held && dr.t >= DRINK.put) {
      dr.held = false;
      this.cupHeld = false;
      d.putMug(this.cupFill);
    }
    if (dr.t >= DRINK.end) this.drink = null;
  }

  /** The sip is cut short (they get up): the mug goes back on the desk. */
  private endDrink(): void {
    const dr = this.drink;
    if (!dr) return;
    this.drink = null;
    if (dr.held) {
      this.cupHeld = false;
      dr.desk.putMug(this.cupFill);
    }
  }

  /** 0..1: how far the left hand has reached out sideways to the mug on the desk. */
  get cupReach(): number {
    const dr = this.drink;
    if (!dr) return 0;
    const t = dr.t;
    if (t < DRINK.grab) return smooth(t / DRINK.grab);
    if (t < DRINK.up) return 1 - smooth((t - DRINK.grab) / (DRINK.up - DRINK.grab));
    if (t < DRINK.sipEnd) return 0;
    if (t < DRINK.put) return smooth((t - DRINK.sipEnd) / (DRINK.put - DRINK.sipEnd));
    return 1 - smooth((t - DRINK.put) / (DRINK.end - DRINK.put));
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
    if (!this.task) this.timer = 0.3 + random();
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
    return { kind, variant: random() < 0.7 ? own : Math.floor(random() * screenVariants(kind)) };
  }

  private get adhd(): boolean {
    return !!this.member.adhd;
  }

  protected override idleTime(): number {
    if (this.phoneJob) return this.phoneJob.mode === 'pace' ? 0.2 + random() * 0.8 : 0.3 + random() * 2;
    return this.adhd ? 0.3 + random() * 1.5 : super.idleTime();
  }

  protected decide(nav: NavGrid): void {
    if (this.phoneJob) {
      this.phoneStep(nav);
      return;
    }
    const seek = this.displaced;
    this.displaced = false;
    if (this.member.look.phone && !seek && !this.talk && !this.snackLeft && random() < PHONE_CHANCE) {
      this.startPhone(nav);
      return;
    }
    if (this.member.look.vape && !seek && !this.snackLeft && random() < VAPE_CHANCE) {
      this.startVape(random() < 0.35 ? 2 : 1);
      return;
    }
    if (!seek && !this.snackLeft && random() < PRINT_CHANCE && this.startPrint(nav)) return;
    if (!seek && !this.snackLeft && random() < FOOS_CHANCE && this.office?.challenge(this, nav)) return;
    if (!seek && this.member.snacker && !this.cupHeld && !this.snackLeft && !this.talk && random() < SNACK_CHANCE && this.startWanderRun(nav, true)) return;
    if (!seek && !this.cupHeld && !this.snackLeft && !this.member.hatesCoffee && !this.talk && random() < RUN_CHANCE && this.startWanderRun(nav)) return;
    if (this.office && !this.snackLeft && (seek || random() < (this.adhd ? WORK_CHANCE * 0.6 : WORK_CHANCE))) {
      const desk = this.office.claim(this);
      if (desk) {
        this.headForDesk(desk, nav);
        return;
      }
    }
    // sometimes just look around instead of walking (not when they should move on: no free desk, so off somewhere else)
    if (!seek && random() < (this.adhd ? 0.5 : 0.25)) {
      this.yaw += (random() - 0.5) * (this.adhd ? 4 : 2.4);
      this.timer = this.idleTime();
      return;
    }
    this.wanderTo(nav);
  }

  /** Walks to a claimed `desk`, sits down and works there. */
  headForDesk(desk: Desk, nav: NavGrid): void {
    this.task = { desk, phase: 'approach', t: 0, from: { ...this.pos }, remaining: (WORK_TIME.min + random() * (WORK_TIME.max - WORK_TIME.min)) * (this.adhd ? 0.3 : 1), retries: 0, retryIn: 0.5 };
    this.goTo(nav, desk.approach);
  }

  /** The player talks to this person: they drop their walk and turn around. False when they are too busy to stop (desk, meeting, printer, …). */
  talkTo(at: Vec2, seconds: number, stayAtDesk = true): boolean {
    if (this.fixed || this.held || this.controlled || this.talk || this.presence !== 'in' || this.inMeeting) return false;
    if (stayAtDesk && this.task?.phase === 'work') {
      // seated: swivel the chair towards the player instead of standing up
      this.phoneJob = null;
      this.vapeJob = null;
    } else this.interrupt();
    this.path = [];
    this.state = 'idle';
    this.playerChat = { t: seconds, total: seconds, at };
    this.petting = false; // a chat cuts the petting short (`petDog` sets it again for its own stop)
    this.speaking = true; // answers right away
    return true;
  }

  /** Stops and strokes a pet at `at` for a few seconds. False when busy (desk, meeting, call, …). */
  petDog(at: Vec2, seconds: number, petHeight = 0.4): boolean {
    if (!this.talkTo(at, seconds, false)) return false;
    this.petHeight = petHeight;
    this.petting = true;
    this.speaking = false;
    return true;
  }

  protected override control(dt: number, nav: NavGrid): boolean {
    if (this.unstick(dt, nav)) return true;
    if (this.presence !== 'in') {
      this.petting = false;
      return this.controlPresence(dt, nav);
    }
    if (this.scripted) return this.controlScripted(dt, nav);
    const chat = this.playerChat;
    if (!chat) this.petting = false;
    if (chat) {
      chat.t -= dt;
      if (chat.t <= 0 || this.held || this.controlled || this.talk) {
        this.playerChat = null;
        this.petting = false;
        this.speaking = false;
        this.timer = 0.4 + random();
      } else {
        this.state = 'idle';
        this.timer = 1;
        this.speaking = !this.petting && chat.total - chat.t < 2.6; // answers first, then listens
        const seat = this.task?.phase === 'work' ? this.task.desk.seat : null;
        if (seat) {
          this.pos.x = seat.x;
          this.pos.z = seat.z;
          this.sit = 1;
        } else this.sit = Math.max(0, this.sit - dt * 4);
        this.moving += (0 - this.moving) * Math.min(1, dt * 8);
        this.turnTo(Math.atan2(chat.at.x - this.pos.x, chat.at.z - this.pos.z), dt);
        return true;
      }
    }
    if (this.controlled) {
      this.cancelPrint();
      this.cancelFoos();
      this.cancelCoffee();
      this.cancelRun();
      // the player takes over: stand up from the desk first, then walk freely
      const t = this.task;
      if (t?.phase === 'approach') this.cancelTask();
      else if (t?.phase === 'work') t.remaining = 0;
      if (this.inMeeting) this.dismissMeeting();
      if (!this.task && !this.meetJob) return this.steerStep(dt);
    }
    if (this.meetJob) return this.controlMeet(dt, nav);
    if (this.coffeeJob) return this.controlCoffee(dt, nav);
    if (this.run) return this.controlRun(dt, nav);
    if (this.held && !this.task && !this.printJob && !this.foosJob && !this.vapeJob) {
      // carried by the player: sits down in the air while snapped to a chair, stands otherwise
      const snap = this.snapDesk ?? this.snapMeetSeat;
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
          task.out = undefined;
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
        this.tickDrink(dt, task);
        this.seatedBreaks(dt, task, nav);
        if (task.remaining <= 0) {
          this.endDrink();
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
        const out = this.exitOf(task);
        this.pos.x = d.seat.x + (out.x - d.seat.x) * e;
        this.pos.z = d.seat.z + (out.z - d.seat.z) * e;
        this.sit = 1 - smooth(task.t / 0.4);
        if (task.t > 0.25) this.turnTo(d.yaw + Math.PI, dt);
        this.step(dt, task.t > 0.35 ? 0.7 : 0);
        if (task.t >= 1) {
          this.stoodUp = { at: { ...this.pos }, t: 0, tries: 0 };
          if (task.errand) this.beginRun(task, nav);
          else this.finishTask();
        }
        return true;
      }
    }
  }

  /** Where standing up from this desk ends (`Office.exit`), picked once per stand-up (sitting down again forgets it). */
  private exitOf(task: DeskTask): Vec2 {
    return (task.out ??= this.office?.exit(task.desk) ?? task.desk.approach);
  }

  /**
   * Safety net for standing up from a desk into a spot with no way on (a plant or a neighbour in the way, cells blocked
   * since the desk was laid out): somebody who stood up and has not got away for UNSTUCK_AFTER seconds steps straight
   * to the closest free cell that leads into the office, then carries on with what they stood up for. Returns true
   * while stepping.
   */
  private unstick(dt: number, nav: NavGrid): boolean {
    if (this.held || this.controlled || this.away) this.stepOut = null; // carried, steered or gone: no step of their own
    const step = this.stepOut;
    if (step) {
      step.t = Math.min(1, step.t + dt / step.dur);
      this.pos.x = step.from.x + (step.to.x - step.from.x) * step.t;
      this.pos.z = step.from.z + (step.to.z - step.from.z) * step.t;
      this.turnTo(Math.atan2(step.to.x - step.from.x, step.to.z - step.from.z), dt);
      this.step(dt, 0.7);
      if (step.t >= 1) this.stepOut = null;
      return true;
    }
    const s = this.stoodUp;
    if (!s) return false;
    const seated = (this.task && this.task.phase !== 'approach') || (this.meetJob && this.meetJob.phase !== 'approach');
    if (seated || this.held || this.controlled || this.away || Math.hypot(this.pos.x - s.at.x, this.pos.z - s.at.z) > UNSTUCK_AWAY) {
      this.stoodUp = null;
      return false;
    }
    // still getting up or spinning, in a chat of their own or with the player: standing there is what they do
    if (this.sit > 0.01 || this.spin > 0 || this.playerChat || (this.talk && !this.meetJob && !this.coffeeJob)) return false;
    // in the open with nowhere to go (standing about after work) is no reason to step anywhere
    const going =
      this.path.length > 0 ||
      this.presence === 'leaving' ||
      !!this.run ||
      this.meetJob?.phase === 'approach' ||
      this.coffeeJob?.phase === 'approach' ||
      this.printJob?.phase === 'approach' ||
      this.foosJob?.phase === 'approach' ||
      this.task?.phase === 'approach';
    // a way on from here: only a walker that gave up on it (path dropped) needs the step; waiting at a passage does not
    if ((!going || this.path.length > 0) && nav.opens(this.pos, CORRIDOR_POINT)) {
      s.t = 0; // the 2 s count one stall, not stalls added up
      return false;
    }
    if ((s.t += dt) < UNSTUCK_AFTER) return false;
    const to = nav.openNear(this.pos, CORRIDOR_POINT, 2, true); // a step (at most 1 m), not a walk through the furniture
    if (!to || ++s.tries > UNSTUCK_TRIES) {
      this.stoodUp = null;
      return false;
    }
    s.at = { ...to };
    s.t = 0;
    this.path = [];
    this.state = 'idle';
    this.stepOut = { from: { ...this.pos }, to, t: 0, dur: Math.max(0.2, Math.hypot(to.x - this.pos.x, to.z - this.pos.z) / (this.speed * 0.6)) };
    return true;
  }

  /** Pins this person for a day task: they walk to `at` first when `walk` is set (else they are there at once), then stay and turn to `yaw`. */
  pinTo(s: { at: Vec2; yaw: number; sit?: boolean; turn?: number; walk?: boolean }): void {
    this.scripted = { at: { ...s.at }, yaw: s.yaw, sit: !!s.sit, turn: s.turn ?? 1, arrived: !s.walk, tries: 0 };
    this.controlled = true;
    this.steer.x = this.steer.z = 0;
    this.playerChat = null;
    this.petting = false;
    this.speaking = false;
    if (!s.walk) {
      this.pos.x = this.prev.x = s.at.x;
      this.pos.z = this.prev.z = s.at.z;
      this.path = [];
      this.state = 'idle';
    }
  }

  /** Turns the pinned person to face `yaw`. */
  faceTo(yaw: number): void {
    if (this.scripted) this.scripted.yaw = yaw;
  }

  /** Back to normal life (a pinned person at a desk simply keeps working). */
  unpin(): void {
    if (!this.scripted) return;
    this.scripted = null;
    this.controlled = false;
    this.gameboyOn = false;
    this.timer = 0.5;
  }

  private controlScripted(dt: number, nav: NavGrid): boolean {
    const s = this.scripted!;
    this.speaking = false;
    this.timer = 1;
    if (!s.arrived) {
      if (Math.hypot(s.at.x - this.pos.x, s.at.z - this.pos.z) < 0.3) s.arrived = true;
      else if (!this.isWalking()) {
        this.walkTo(nav, s.at);
        if (!this.isWalking() && ++s.tries > 6) s.arrived = true; // no way there: appears on the spot
      } else return false; // normal walking
      if (!s.arrived) return false;
    }
    this.state = 'idle';
    this.path = [];
    this.pos.x = s.at.x;
    this.pos.z = s.at.z;
    this.sit += ((s.sit ? 1 : 0) - this.sit) * Math.min(1, dt * 8);
    this.moving += (0 - this.moving) * Math.min(1, dt * 8);
    this.turnTo(s.yaw, dt * s.turn);
    return true;
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
    const away = this.run;
    if (away?.desk) {
      // off for a coffee: the desk is handed over right away, a new one is picked on the way back
      const d = away.desk;
      away.desk = null;
      this.displaced = true;
      this.office?.release(d, this);
      return;
    }
    const task = this.task;
    if (!task) return;
    this.dropErrand(task);
    this.displaced = true;
    if (task.phase === 'approach') this.cancelTask();
    else task.remaining = Math.min(task.remaining, 0.6 + random() * 0.8);
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
    this.timer = 0.3 + random();
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
        if (this.sit > 0.01) {
          // pulled out of the chair by an event: stand up first, only then walk to the room
          this.sit = Math.max(0, this.sit - dt * 4);
          this.moving += (0 - this.moving) * ease;
          return true;
        }
        if (this.isWalking()) return false;
        this.moving += (0 - this.moving) * ease;
        if (Math.hypot(s.approach.x - this.pos.x, s.approach.z - this.pos.z) < 0.6 && nav.lineClear(this.pos, s.approach)) {
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
        this.turnTo(this.meetFocus ? Math.atan2(this.meetFocus.x - s.seat.x, this.meetFocus.z - s.seat.z) : s.yaw, dt);
        this.moving += (0 - this.moving) * ease;
        if (j.solo !== undefined && (j.solo -= dt) <= 0) j.dismissed = true;
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
          this.socialCooldown = 15 + random() * 20;
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
      this.timer = 0.3 + random();
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
      if (job.age > FOOS_APPROACH) {
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
      else if (job.age > FOOS_APPROACH) this.cancelFoos();
      return true;
    }
    // play: ease onto the exact spot
    const k = Math.min(1, dt * 3);
    this.pos.x += (job.spot.stand.x - this.pos.x) * k;
    this.pos.z += (job.spot.stand.z - this.pos.z) * k;
    job.remaining -= dt;
    if (job.remaining <= 0) {
      this.cancelFoos();
      this.timer = 0.5 + random();
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
    this.foosJob = { spot, partner, phase: 'approach', remaining: FOOS_TIME.min + random() * (FOOS_TIME.max - FOOS_TIME.min), age: 0, retries: 0, retryIn: 0.5 };
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
    this.timer = 0.5 + random();
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
    const dr = this.drink;
    if (dr) return dr.t >= DRINK.up && dr.t < DRINK.sipEnd ? Math.sin(((dr.t - DRINK.up) / (DRINK.sipEnd - DRINK.up)) * Math.PI) : 0;
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
    this.coffeeJob = { spot, talk, phase: 'approach', t: 0, age: 0, retries: 0, retryIn: 0.5, offset: random() * 7, dismissed: false };
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
    if (j.phase !== 'approach' && !this.held && !this.controlled && this.presence === 'in') {
      // the break is over: the cup comes along (and is set down at the desk)
      this.cupHeld = true;
      this.cupFill = 0.7;
      this.cupLeft = CUP_LIFE;
    }
    this.path = [];
    this.state = 'idle';
    this.timer = 0.3 + random();
    this.socialCooldown = Math.max(this.socialCooldown, 6 + random() * 10);
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
        this.timer = 0.8 + random() * 2;
      }
    }
    return true;
  }

  /** There is a printer and nobody stands at it. */
  get canPrint(): boolean {
    const pr = this.office?.printer;
    return !!pr && !pr.occupant;
  }

  /** Walk to the printer and print; false when it is busy. */
  startPrint(nav: NavGrid): boolean {
    const pr = this.office?.printer;
    if (!pr || !this.canPrint) return false;
    pr.occupant = this;
    this.printJob = { phase: 'approach', remaining: PRINT_TIME.min + random() * (PRINT_TIME.max - PRINT_TIME.min), retries: 0, retryIn: 0.5 };
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

  /** Waits in a queue as part of `talk` (e.g. for the toilet): walks to `spot`, then stands there facing `talk.center` until the talk is taken away. */
  queueAt(nav: NavGrid, spot: Vec2, talk: Talk): void {
    this.talk = talk;
    if (Math.hypot(spot.x - this.pos.x, spot.z - this.pos.z) > 0.4) this.goTo(nav, spot);
  }

  /** Drops whatever they were doing (desk, printer, vape) so a new activity can start. */
  interrupt(): void {
    this.phoneJob = null;
    this.stepOut = null;
    if (this.inMeeting) this.dismissMeeting();
    const t = this.task;
    if (t && t.phase !== 'approach') {
      // sitting (or sitting down / getting up): step out of the chair, the stand-up pose plays in control()
      const out = this.exitOf(t);
      this.pos.x = out.x;
      this.pos.z = out.z;
      this.prev = { ...this.pos };
      this.stoodUp = { at: { ...out }, t: 0, tries: 0 };
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
    this.cancelRun();
    this.endDrink();
    this.vapeJob = null;
    this.phoneJob = null;
    if (!this.task) return;
    this.office?.release(this.task.desk, this);
    this.task = null;
    this.path = [];
    this.state = 'idle';
  }
}
