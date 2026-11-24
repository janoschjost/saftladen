import * as THREE from 'three';
import { christianLook } from '../data/christian';
import { CHRISTIAN_FACTS } from '../data/christianFacts';
import { CHRISTIAN_LINES, type LineKind } from '../data/christianLines';
import { bubbleSeconds } from '../data/sonLines';
import { buildCharacter, type CharacterRig } from '../render/characterBuilder';
import { DAY_OPACITY, GHOST_OPACITY, ghostify } from '../render/ghostFx';
import { solveArm, type ArmPose } from '../render/homeOffice';
import { buildMop } from '../render/mopProp';
import { PINCH } from '../render/smokeProps';
import { chillCrossed } from './Chill';
import type { MessItem } from './Mess';
import type { Vec2 } from './NavGrid';
import { DAY_START } from './Presence';
import { stream } from './rng';
import { CYCLE_SECONDS, cycleOf, hourOf } from './TimeOfDay';
import type { Sim } from './Sim';
import { hinge } from './petPose';
import { WALK_PHASE_PER_M, walkPose } from './walkPose';

/** Where he comes through the kitchen's outer (north) wall: just outside it (the wall is the 0.3 m slab z -0.15..0.15), so the wall hides him from the room until he steps through. */
export const WALL_ENTRY: Vec2 = { x: 18, z: -0.4 };
/** His glide speed (m/s): about twice the walking speed of the others. */
const GLIDE_SPEED = 2.6;
/** How fast he sweeps the floor with the mop (m/s). */
const MOP_SPEED = 0.9;
/** He mops around Jannik's desk (his old place) for this long (s): `MOP_TIME` plus up to `MOP_EXTRA`. */
const MOP_TIME = 15;
const MOP_EXTRA = 5;
/** Whose desk it is, and how far the strokes reach around the chair (m). */
const MOP_DESK_OWNER = 'jannik-stibi';
const STROKE = { x: 0.9, z: 0.45 };
/** Seconds he works on one piece of mess (the item goes at the half). */
export const WORK_TIME = 1.1;
/** Real seconds his last bubble takes before he may leave (it is up at least 3 s however fast he works): the speed-up leaves room for it. */
const LAST_WORD = 3.5;
/** Seconds he stands and says his last word before he leaves. */
const DONE_WAIT = 2.4;
/** How far in front of the mess he stands (m). */
const STAND_OFF = 0.55;
/**
 * He comes once a night, at a time drawn per night between these clock hours (the night is short: the clock races through it,
 * a later start could not be over by `VISIT_DEADLINE_HOUR`). A player who jumps the clock past `ARRIVE_LATEST` misses him.
 */
const ARRIVE_FROM = 0.5;
const ARRIVE_TO = 1.5;
export const ARRIVE_LATEST = 2.5;
/** The visit has to be over by this clock hour: the next working day starts (`Mess` clears what is left). */
export const VISIT_DEADLINE_HOUR = DAY_START;
/** At night the clock races (a clock hour is a few real seconds), so he speeds up to be done in time; at most this much (the 04:00 clear takes what is left). */
const MAX_RATE = 6;
/** How far from the wall (m) he is fully visible: he fades in over this. */
const WALL_FADE = 1;
/** A little above the floor: he glides, he does not walk. */
const FLOAT = 0.06;
/** How fast the walk cycle and the poses blend in and out (1/s). */
const EASE = 8;
/** Seconds between two of his bubbles (min, plus up to extra). */
const GAP = { min: 1.2, extra: 1.8 };

/**
 * The day wander (#256): every `WANDER_GAP` clock hours (3 to 5) in office hours he fades in at a free spot, glides about
 * for `WANDER_TIME` seconds (25 to 45) at `WANDER_SPEED`, dropping a useless fact every ~`FACT_GAP` s, and fades out.
 */
const WANDER_FROM = 8.5;
const WANDER_TO = 17;
const WANDER_FIRST = { min: 8.5, extra: 1.5 };
const WANDER_GAP = { min: 3, extra: 2 };
const WANDER_TIME = { min: 25, extra: 20 };
const WANDER_SPEED = 1.1;
const FACT_GAP = 15;
/** how long he takes to fade in and out (s) */
const WANDER_FADE = 1.5;

/** The lines that must not get lost when his bubble is busy. */
const IMPORTANT: ReadonlySet<LineKind> = new Set(['lunchbox', 'bin', 'done']);

type Pose = 'walk' | 'mop' | 'pick' | 'nose';

/** One leg of a visit: glide to `to` (at `speed`), then work `wait` seconds in `pose`; `at` fires at the half of the work. */
interface Step {
  to: Vec2;
  wait?: number;
  speed?: number;
  pose?: Pose;
  say?: LineKind;
  at?: () => void;
}

/** The arm poses of his work, solved for his rig (body frame: head centre y 1.58, face front z 0.18). */
export interface Poses {
  mopR: ArmPose;
  mopL: ArmPose;
  noseR: ArmPose;
  holdL: ArmPose;
  reachR: ArmPose;
}

/** The mop leans in front of the body: bottom on the floor ahead, top near the chest. His hands grip it high and low. */
const MOP_BOTTOM = new THREE.Vector3(0.05, 0, 0.85);
const MOP_TILT = -0.36;

/** Solved once per shoulder layout: his look is fixed, so every visit gets the same poses and the grid searches run once. */
const solved = new Map<string, Poses>();

export function solvePoses(rig: CharacterRig): Poses {
  const sr = rig.armR.position.clone();
  const sl = rig.armL.position.clone();
  const key = `${sl.x.toFixed(3)}|${sr.x.toFixed(3)}|${sl.y.toFixed(3)}`;
  const hit = solved.get(key);
  if (hit) return hit;
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const poses: Poses = {
    mopR: solveArm(sr, PINCH, v(0.05, 0.81, 0.55)),
    mopL: solveArm(sl, PINCH, v(0.05, 1.15, 0.43)),
    noseR: solveArm(sr, PINCH, v(0.03, 1.5, 0.25), true, [-1.2, 1.2]),
    holdL: solveArm(sl, PINCH, v(-0.28, 1.0, 0.5)),
    reachR: solveArm(sr, PINCH, v(0.12, 0.7, 0.55)),
  };
  solved.set(key, poses);
  return poses;
}

const { lerp } = THREE.MathUtils;
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/** Blends an arm from where the walk cycle left it towards a solved pose, `k` of the way. */
function armTo(arm: THREE.Object3D, elbow: THREE.Object3D, p: ArmPose, k: number): void {
  const side = Math.sign(arm.position.x) || 1;
  arm.rotation.x = lerp(arm.rotation.x, p.x, k);
  arm.rotation.z = lerp(0, p.z * side, k);
  elbow.rotation.x = lerp(0, p.e, k);
  elbow.rotation.z = lerp(0, p.ez * side, k);
}

/**
 * Taking a piece of mess, `k` of the way from the pose the rig is in: bent down, the right hand reaching for it
 * ('pick'), or a lunchbox: two fingers on the nose, the other arm held out, away from the smell ('nose'). The caller
 * lets the upper body lean around the hips (`hinge`). Christian's, and Oscar's on his tidy outings (#296).
 */
export function workPose(r: CharacterRig, p: Poses, pose: 'pick' | 'nose', k: number): void {
  if (pose === 'pick') {
    armTo(r.armR, r.elbowR, p.reachR, k);
    r.body.rotation.x = lerp(r.body.rotation.x, 0.6, k);
  } else {
    armTo(r.armR, r.elbowR, p.noseR, k);
    armTo(r.armL, r.elbowL, p.holdL, k);
    r.body.rotation.x = lerp(r.body.rotation.x, -0.12, k);
  }
}

/**
 * Christian Davatz, the ghost of the Ordnungskreis (#255): comes through the kitchen's outer wall, mops around Jannik's
 * old desk, cleans the office's mess away piece by piece muttering about the Ordnung, and goes back into the wall. He
 * glides in straight lines through walls, doors and furniture (no nav grid). See-through, blue, glowing.
 */
export class Christian {
  rig: CharacterRig | null = null;
  /** what his bubble says now (null: nothing) */
  text: string | null = null;
  private ghost: ReturnType<typeof ghostify> | null = null;
  private mop: THREE.Group | null = null;
  private poses: Poses | null = null;
  private t = 0;
  private pos: Vec2 = { ...WALL_ENTRY };
  private yaw = 0;
  private moving = 0;
  private phase = 0;
  private steps: Step[] = [];
  private cur: Step | null = null;
  private arrived = false;
  private dwell = 0;
  private fired = false;
  private pose: Pose = 'walk';
  private hold = 0;
  private textT = 0;
  private gapT = 0;
  private lastLine = '';
  /** an important line (the lunchbox, the bin, his last word) that came while his bubble was busy: said as soon as it is free */
  private pending: LineKind | null = null;
  /** how much faster than normal he works (1 by day, more at night so he is done by `VISIT_DEADLINE_HOUR`) */
  rate = 1;
  private visitedDay = -1;
  /** the running day wander: how long it lasts (s); null on a night visit or when he is not there */
  private wander: { dur: number } | null = null;
  private wanderDay = -1;
  /** the clock hour the next day wander comes at */
  private wanderAt = 0;
  private factT = 0;
  /** the working day the running visit began on: a new one (04:00) ends it, the mess is cleared then anyway */
  private startDay = -1;
  private arriveDay = -1;
  private arriveAt = 0;
  private readonly rnd = stream(0xc4157);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sim: Sim,
  ) {}

  get active(): boolean {
    return this.rig !== null;
  }

  get root(): THREE.Object3D | null {
    return this.rig?.root ?? null;
  }

  /** His position (game metres), while he is there. */
  get at(): Vec2 | null {
    return this.rig ? { ...this.pos } : null;
  }

  /** Whether he is on a day wander (not the night cleaning). */
  get wandering(): boolean {
    return this.wander !== null;
  }

  /** A visit: false when there is nothing to clean (then he does not come). */
  start(): boolean {
    this.stop();
    const steps = this.plan();
    if (!steps.length) return false;
    this.build(GHOST_OPACITY);
    this.startDay = this.sim.presence.days;
    if (hourOf(this.sim.tod.cycle) < ARRIVE_LATEST) this.visitedDay = this.startDay; // a visit in the small hours (the dev event too) is that night's one
    this.pos = { ...WALL_ENTRY };
    this.yaw = 0; // facing +z, into the room
    this.moving = 0;
    this.phase = 0;
    this.steps = steps;
    this.rate = this.rateFor(steps);
    this.pose = 'walk';
    this.hold = 0;
    this.textT = 0;
    this.gapT = 0;
    this.apply();
    return true;
  }

  /**
   * A day wander: at a free spot, fainter than at night, no mop. False when the office has no free spot.
   * `first`: seconds to his first fact (short for a dev event, so it shows soon).
   */
  startWander(first = FACT_GAP / 3): boolean {
    this.stop();
    const from = this.freeSpot();
    if (!from) return false;
    this.build(DAY_OPACITY);
    this.startDay = this.sim.presence.days;
    this.wander = { dur: WANDER_TIME.min + this.rnd() * WANDER_TIME.extra };
    this.factT = first;
    this.pos = from;
    this.yaw = this.rnd() * Math.PI * 2;
    this.moving = 0;
    this.phase = 0;
    this.steps = [];
    this.rate = 1;
    this.pose = 'walk';
    this.hold = 0;
    this.textT = 0;
    this.gapT = 0;
    this.apply();
    return true;
  }

  /** His rig as a ghost of the given strength, in the scene; the mop on his body (shown only while he mops). */
  private build(opacity: number): void {
    this.rig = buildCharacter(christianLook);
    this.mop = buildMop();
    this.mop.position.copy(MOP_BOTTOM);
    this.mop.rotation.x = MOP_TILT;
    this.mop.visible = false;
    this.rig.body.add(this.mop);
    this.ghost = ghostify(this.rig, opacity); // after the mop is on, so it turns into a ghost too
    this.poses = solvePoses(this.rig);
    this.scene.add(this.rig.root);
    this.t = 0;
  }

  /** A random free floor cell (his own dice: the simulation's are not touched), null when there is none. */
  private freeSpot(): Vec2 | null {
    const nav = this.sim.nav;
    for (let i = 0; i < 300; i++) {
      const cx = Math.floor(this.rnd() * nav.cols);
      const cz = Math.floor(this.rnd() * nav.rows);
      if (nav.walkable(cx, cz)) return nav.center(cx, cz);
    }
    return null;
  }

  stop(): void {
    if (this.wander) {
      this.wander = null;
      this.wanderAt = hourOf(this.sim.tod.cycle) + WANDER_GAP.min + this.rnd() * WANDER_GAP.extra; // the next one, 3 to 5 clock hours on
    }
    if (!this.rig) return;
    this.scene.remove(this.rig.root);
    this.rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.ghost?.dispose();
    this.ghost = null;
    this.rig = null;
    this.mop = null;
    this.poses = null;
    this.steps = [];
    this.cur = null;
    this.text = null;
    this.pending = null;
  }

  /** The visit: in through the wall, the mop at Jannik's desk, every piece of mess nearest first, a word, back into the wall. */
  private plan(): Step[] {
    const mess = this.sim.mess;
    const left = [...mess.list()];
    if (!left.length) return [];
    const steps: Step[] = [];
    const desk = this.sim.people.find((p) => p.id === MOP_DESK_OWNER)?.homeDesk;
    let from: Vec2 = WALL_ENTRY;
    if (desk) {
      steps.push({ to: desk.approach, say: 'arrive' });
      from = desk.approach;
      let budget = MOP_TIME + this.rnd() * MOP_EXTRA;
      for (let k = 0; budget > 0; k++) {
        const to = { x: desk.seat.x + (k % 2 ? -STROKE.x : STROKE.x), z: desk.seat.z + ((k >> 1) % 2 ? STROKE.z : -STROKE.z) };
        steps.push({ to, pose: 'mop', speed: MOP_SPEED });
        budget -= dist(to, from) / MOP_SPEED;
        from = to;
      }
    }
    const clean = this.cleanSteps(left, from, !desk);
    steps.push(...clean.steps);
    steps.push(this.checkStep(clean.at));
    return steps;
  }

  /** Every piece of `left` away, nearest first. `first`: the first stop is also where he arrives (a word about it). */
  private cleanSteps(left: MessItem[], from: Vec2, first: boolean): { steps: Step[]; at: Vec2 } {
    const mess = this.sim.mess;
    const steps: Step[] = [];
    const todo = left.map((item) => ({ item, w: mess.where(item) }));
    while (todo.length) {
      let best = 0;
      let bestD = Infinity;
      todo.forEach(({ w }, i) => {
        const d = dist(w, from);
        if (d < bestD) [best, bestD] = [i, d];
      });
      const [{ item, w }] = todo.splice(best, 1);
      const d = Math.max(0.01, bestD);
      const to = { x: w.x + ((from.x - w.x) / d) * STAND_OFF, z: w.z + ((from.z - w.z) / d) * STAND_OFF };
      steps.push(this.workStep(item, to, first && steps.length === 0));
      from = to;
    }
    return { steps, at: from };
  }

  /**
   * The end of the work: more mess came up while he was at it (people are still about) → that too; otherwise a word and back
   * into the wall.
   */
  private checkStep(at: Vec2): Step {
    return {
      to: at,
      at: () => {
        const more = this.cleanSteps([...this.sim.mess.list()], at, false);
        if (more.steps.length) this.steps.unshift(...more.steps, this.checkStep(more.at)); // its rate: when the next step starts
        else this.steps.unshift({ to: at, wait: DONE_WAIT, say: 'done' }, { to: WALL_ENTRY });
      },
    };
  }

  /**
   * How much faster than normal he has to work to be done by `VISIT_DEADLINE_HOUR`, the next 04:00 (1 when no 04:00 is
   * coming: the clock stands still or is paused, or there is plenty of time, as by day). The clock races through the night.
   */
  private rateFor(steps: Step[], from: Vec2 = WALL_ENTRY): number {
    const tod = this.sim.tod;
    if (!tod.auto || tod.pinned) return 1;
    const deadline = cycleOf(VISIT_DEADLINE_HOUR);
    const left = (tod.cycle < deadline ? deadline - tod.cycle : 1 - tod.cycle + deadline) * CYCLE_SECONDS; // game seconds to the next 04:00, over midnight
    let need = 0;
    let at = from;
    for (const s of steps) {
      need += dist(s.to, at) / (s.speed ?? GLIDE_SPEED) + (s.wait ?? 0);
      at = s.to;
    }
    need += DONE_WAIT + dist(WALL_ENTRY, at) / GLIDE_SPEED; // his last word, and the way back to the wall
    return Math.min(MAX_RATE, Math.max(1, need / Math.max(1, left * 0.7 - LAST_WORD)));
  }

  private workStep(item: MessItem, to: Vec2, first: boolean): Step {
    const own = item.kind === 'lunchbox' || item.kind === 'bin' ? item.kind : undefined;
    const kind: LineKind | undefined = first ? 'arrive' : own ?? (this.rnd() < 0.6 ? 'tidy' : undefined);
    return { to, wait: WORK_TIME, pose: item.kind === 'lunchbox' ? 'nose' : 'pick', say: kind, at: () => void this.sim.mess.take(item) };
  }

  /** The next stretch of the wander: in a straight line to another free spot, through whatever is in between. */
  private nextLeg(): Step | null {
    const to = this.freeSpot();
    return to ? { to, speed: WANDER_SPEED } : null;
  }

  /** One of his useless facts (not the one before), then about `FACT_GAP` s until the next. */
  private sayFact(): void {
    const facts = CHRISTIAN_FACTS.filter((f) => f !== this.lastLine);
    const line = facts[Math.floor(this.rnd() * facts.length)];
    this.text = this.lastLine = line;
    this.textT = bubbleSeconds(line);
    this.factT = FACT_GAP * (0.85 + this.rnd() * 0.3);
  }

  /** A line of his, if his bubble is free. */
  private speak(kind: LineKind): void {
    if (this.text !== null || this.gapT > 0) {
      if (IMPORTANT.has(kind)) this.pending = kind; // his steps run on a faster clock than his bubbles: do not lose these
      return;
    }
    this.pending = null;
    const lines = CHRISTIAN_LINES[kind].filter((l) => l !== this.lastLine);
    const line = lines[Math.floor(this.rnd() * lines.length)] ?? CHRISTIAN_LINES[kind][0];
    this.text = this.lastLine = line;
    this.textT = bubbleSeconds(line);
  }

  /** The night visit: once per working day, in the small hours, when something is lying around. */
  private schedule(): void {
    const { tod, presence, mess } = this.sim;
    const day = presence.days;
    if (day !== this.arriveDay) {
      this.arriveDay = day;
      this.arriveAt = ARRIVE_FROM + this.rnd() * (ARRIVE_TO - ARRIVE_FROM);
    }
    const hour = hourOf(tod.cycle);
    if (day !== this.wanderDay) {
      this.wanderDay = day;
      const first = WANDER_FIRST.min + this.rnd() * WANDER_FIRST.extra;
      // a game opened (or a clock set) after that time: he does not jump out at once, the next one is 3 to 5 hours away
      this.wanderAt = first < hour ? hour + WANDER_GAP.min + this.rnd() * WANDER_GAP.extra : first;
    }
    if (hour >= this.wanderAt && hour >= WANDER_FROM && hour < WANDER_TO) {
      if (this.startWander()) return;
      this.wanderAt = hour + 1; // no free spot just now: try again in an hour
    }
    if (this.visitedDay === day || !mess.count()) return; // the cheap checks first: this runs every frame
    if (hour < this.arriveAt || hour >= ARRIVE_LATEST) return;
    this.start();
  }

  update(dt: number): void {
    if (!this.rig) {
      this.schedule();
      if (!this.rig) return;
    }
    if (this.sim.presence.days !== this.startDay) return this.stop(); // a new working day: he is gone
    this.t += dt;
    if (this.wander && this.t >= this.wander.dur) return this.stop(); // faded out
    if (this.wander && this.text === null && (this.factT -= dt) <= 0) this.sayFact();
    if (this.text !== null) {
      this.textT -= dt;
      if (this.textT <= 0) {
        this.text = null;
        this.gapT = this.pending ? 0.3 : GAP.min + this.rnd() * GAP.extra; // a short breath, then the line that had to wait
      }
    } else {
      this.gapT -= dt;
      if (this.pending && this.gapT <= 0) this.speak(this.pending);
    }
    let work = dt * this.rate; // his own clock: faster at night
    let target = 0;
    let s: Step;
    // one frame can finish a step and go on with the next: what is left of the frame is not lost (at 25× a frame is long)
    for (let guard = 0; ; guard++) {
      if (!this.cur) {
        this.cur = this.steps.shift() ?? (this.wander ? this.nextLeg() : null);
        if (!this.cur) return this.stop(); // back in the wall
        this.arrived = false;
        this.fired = false;
        // the clock may have been let go, sped up or resumed since he came: keep him on time for 04:00
        if (!this.wander) this.rate = Math.max(this.rate, this.rateFor([this.cur, ...this.steps], this.pos));
        if (this.cur.say) this.speak(this.cur.say);
      }
      s = this.cur;
      if (!this.arrived) {
        const speed = s.speed ?? GLIDE_SPEED;
        const dx = s.to.x - this.pos.x;
        const dz = s.to.z - this.pos.z;
        const gap = Math.hypot(dx, dz);
        const d = Math.min(gap, speed * work);
        if (gap > 0.001) {
          this.pos.x += (dx / gap) * d;
          this.pos.z += (dz / gap) * d;
          this.yaw = Math.atan2(dx, dz);
          this.phase += d * WALK_PHASE_PER_M;
          target = 1;
        }
        work = Math.max(0, work - d / speed); // no float dust below 0: it would hold a finished step over
        if (d < gap) break;
        this.arrived = true;
        this.dwell = s.wait ?? 0;
      }
      const used = Math.min(work, Math.max(0, this.dwell));
      this.dwell -= used;
      work -= used;
      if (!this.fired && this.dwell <= (s.wait ?? 0) / 2) {
        this.fired = true;
        s.at?.();
      }
      if (this.dwell > 0 || (s.say === 'done' && (this.pending || this.text !== null))) break; // his last word is heard first
      this.cur = null;
      if (work <= 0 || guard > 64) break;
    }
    const pose = s.pose === 'mop' || (this.arrived && s.pose) ? s.pose : 'walk';
    if (pose !== 'walk') this.pose = pose;
    if (pose === 'mop') this.speak('mop');
    this.moving += (target - this.moving) * Math.min(1, dt * EASE);
    this.hold += ((pose === 'walk' ? 0 : 1) - this.hold) * Math.min(1, dt * EASE);
    this.apply();
  }

  private apply(): void {
    const r = this.rig!;
    const p = this.poses!;
    const k = this.hold;
    r.root.position.set(this.pos.x, FLOAT + Math.sin(this.t * 2) * 0.015, this.pos.z);
    r.root.rotation.y = this.yaw;
    // a fresh frame: the walk cycle sets the legs and the arm swing, the work poses blend over it
    r.armL.rotation.z = r.armR.rotation.z = 0;
    r.elbowL.rotation.set(0, 0, 0);
    r.elbowR.rotation.set(0, 0, 0);
    r.body.rotation.x = 0;
    r.body.position.z = 0; // the lean below shifts it every frame: start from the rig's own
    walkPose(r, this.phase, this.moving);
    this.mop!.visible = this.pose === 'mop' && k > 0.05;
    if (k > 0.001) {
      if (this.pose === 'mop') {
        armTo(r.armR, r.elbowR, p.mopR, k);
        armTo(r.armL, r.elbowL, p.mopL, k);
        r.body.rotation.x = 0.12 * k;
      } else if (this.pose !== 'walk') workPose(r, p, this.pose, k);
      hinge(r); // the upper body leans around the hips, not around the feet
    }
    // he fades in as he steps out of the wall (and out as he goes back in): the glow must not show outside the building
    // on the wander he fades in and out where he stands
    const fade = this.wander
      ? Math.min(this.t, this.wander.dur - this.t) / WANDER_FADE
      : (this.pos.z - WALL_ENTRY.z) / WALL_FADE;
    this.ghost!.set(Math.min(1, Math.max(0, fade)), this.t);
    chillCrossed(this.sim.people, this.pos); // whoever he glides through shivers, by day and at night
  }
}
