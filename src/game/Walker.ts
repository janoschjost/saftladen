import * as THREE from 'three';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Gate } from './Passages';
import type { Talk } from './Social';
import type { Traffic } from './Traffic';
import { random } from './rng';

export type WalkerState = 'idle' | 'walk';

const GATE_DETOUR = 3; // seconds of waiting at a passage before another route is tried
const GATE_PATIENCE = 6; // seconds of waiting (plus up to 3 more, per walker) before the walker gives way and does something else
const MOUTH_SIDE = 0.9; // metres a waiting walker keeps to the side of a passage's lane
const MOUTH_DEPTH = 2; // ... within this distance in front of its entrance
const LOITER = 1; // seconds somebody may stand idle inside a passage before moving on
const GATE_PUSH = 4; // seconds a walker that gave way in vain ignores reservations and goes through anyway

/**
 * Base for everything that wanders the floor. Holds sim state only;
 * the render side reads pos/yaw (interpolated) and animation phase.
 */
export abstract class Walker {
  pos: Vec2;
  prev: Vec2;
  yaw = random() * Math.PI * 2;
  prevYaw = this.yaw;
  phase = random() * 10;
  prevPhase = this.phase;
  moving = 0; // 0..1 eased walk amount (drives animation)
  state: WalkerState = 'idle';
  path: Vec2[] = [];
  timer = random() * 3;
  abstract speed: number;
  abstract radius: number;
  abstract root: THREE.Object3D;
  abstract headHeight: number;
  abstract id: string;
  /** Walker this one stays with (dog -> owner); excluded from avoidance and collision. */
  companion: Walker | null = null;
  protected blockedTime = 0;
  private stuckClock = 0;
  private stuckFrom: Vec2 = { x: 0, z: 0 };
  private stuckCount = 0;
  private replanned = false;
  /** seconds spent waiting in front of a narrow passage that carries oncoming traffic */
  private gateWait = 0;
  private gateDetoured = false;
  /** seconds this walker has been standing around inside a passage */
  private loiter = 0;
  /** how long this walker waits before it gives way (differs per walker, so two that block each other do not both leave) */
  private gatePatience = GATE_PATIENCE + random() * 3;
  /** gave way at a passage and has not got through one since */
  private gateGaveWay = false;
  /** seconds this walker still pushes through passages regardless of reservations (deadlock fallback) */
  private gateForce = 0;
  /** the traffic director (routes and destinations); set by the game */
  traffic: Traffic | null = null;
  /** which way this walker prefers to pass head-on (stable, so nobody dithers) */
  private dodgePref: 1 | -1 = random() < 0.5 ? 1 : -1;
  /** true while the user holds this walker with the mouse */
  held = false;
  /** conversation this walker is part of, if any */
  talk: Talk | null = null;
  speaking = false;
  /** render-side blend 0..1 of the conversation pose, and of the speaking gestures within it */
  talkAmt = 0;
  speakAmt = 0;
  /** seconds before this walker may join a new conversation */
  socialCooldown = 0;
  /** visual lift above the floor (eased in the render step) */
  lift = 0;
  /** outside the building (out the door / home office): invisible, not simulated, not clickable */
  away = false;
  /** scripted straight walk that ignores the nav grid (through the entrance door) */
  protected script: { from: Vec2; to: Vec2; t: number; dur: number } | null = null;

  constructor(start: Vec2) {
    this.pos = { ...start };
    this.prev = { ...start };
  }

  /** Called when idle time is up. */
  protected abstract decide(nav: NavGrid): void;

  /**
   * Hook for subclasses that script their own movement (e.g. sitting down at a desk).
   * Return true to skip the default idle/walk logic for this step.
   */
  protected control(_dt: number, _nav: NavGrid): boolean {
    return false;
  }

  /** Pinned in place: other walkers neither push this one nor get pushed by it. */
  get fixed(): boolean {
    return false;
  }

  /** Off until the game has set up (the initial cast appears without a show). */
  static animate = false;
  /** 0..1 how far materialised: the arrival / departure show scales the model with this. */
  fx = 1;
  private fxEvent: 'in' | 'out' | null = null;
  private baseScale: THREE.Vector3 | null = null;

  /** Pending 'in' / 'out' effect to play at the walker's spot (read once). */
  takeFx(): 'in' | 'out' | null {
    const e = this.fxEvent;
    this.fxEvent = null;
    return e;
  }

  /** Advances the materialise animation: shrinks into a light beam on leaving, pops back with an overshoot on arriving. */
  stepFx(dt: number): void {
    const target = this.away ? 0 : 1;
    if (this.fx === target) return;
    this.baseScale ??= this.root.scale.clone();
    this.fx = Math.max(0, Math.min(1, this.fx + Math.sign(target - this.fx) * (dt / (this.away ? 0.55 : 0.9))));
    const f = this.fx;
    let sx: number;
    let sy: number;
    if (this.away) {
      sx = Math.pow(f, 1.8);
      sy = (1 + (1 - f) * 0.7) * Math.sqrt(f);
    } else {
      const k = Math.max(0, (f - 0.25) / 0.75); // the beam lands first, then the body unfolds
      const back = (v: number) => 1 + 2.2 * Math.pow(v - 1, 3) + 1.2 * Math.pow(v - 1, 2); // easeOutBack
      sx = back(k);
      sy = back(Math.min(1, k * 1.25));
    }
    this.root.scale.set(this.baseScale.x * sx, this.baseScale.y * sy, this.baseScale.z * sx);
    if (this.fx === target) {
      this.root.scale.copy(this.baseScale);
      this.root.visible = !this.away;
    }
  }

  setAway(away: boolean): void {
    this.away = away;
    if (!Walker.animate) {
      this.fx = away ? 0 : 1;
      this.root.visible = !away;
    } else {
      this.fxEvent = away ? 'out' : 'in';
      if (!away) {
        this.fx = 0;
        this.baseScale ??= this.root.scale.clone();
        this.root.scale.set(0, 0, 0);
        this.root.visible = true;
      }
    }
    if (away) {
      this.path = [];
      this.state = 'idle';
      this.script = null;
      this.moving = 0;
    }
  }

  /** Start a scripted walk to `to` (arrives in dist / speed seconds). */
  startScript(to: Vec2, speed = this.speed * 0.8): void {
    const dist = Math.hypot(to.x - this.pos.x, to.z - this.pos.z);
    this.path = [];
    this.state = 'idle';
    this.script = { from: { ...this.pos }, to, t: 0, dur: Math.max(0.2, dist / speed) };
  }

  /** Advances the scripted walk; true while it is still running, false once it arrived (or if there is none). */
  protected runScript(dt: number): boolean {
    const s = this.script;
    if (!s) return false;
    s.t += dt / s.dur;
    const e = Math.min(1, s.t);
    this.pos.x = s.from.x + (s.to.x - s.from.x) * e;
    this.pos.z = s.from.z + (s.to.z - s.from.z) * e;
    this.turnTo(Math.atan2(s.to.x - s.from.x, s.to.z - s.from.z), dt);
    this.moving += (0.8 - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * 4.2 * this.moving;
    if (s.t >= 1) {
      this.script = null;
      return false;
    }
    return true;
  }

  /** Lies on the floor for a while (a pet beside its seated owner): routes go around it (see `Traffic.update`). */
  get obstacle(): boolean {
    return false;
  }

  /** Walking, but held up by somebody in its way. */
  get stuck(): boolean {
    return this.state === 'walk' && this.blockedTime > 0.3 && this.path.length > 0;
  }

  /** Standing in front of a narrow passage until the oncoming traffic is through. */
  get yielding(): boolean {
    return this.state === 'walk' && this.gateWait > 0.1;
  }

  ignores(o: Walker): boolean {
    return this.companion === o || o.companion === this;
  }

  update(dt: number, nav: NavGrid, others: readonly Walker[] = []): void {
    this.prev = { ...this.pos };
    this.prevYaw = this.yaw;
    this.prevPhase = this.phase;

    this.socialCooldown = Math.max(0, this.socialCooldown - dt);

    if (this.control(dt, nav)) return;

    if (this.held) {
      this.path = [];
      this.state = 'idle';
      this.timer = 0.6;
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      return;
    }

    if (this.state === 'idle') {
      this.timer -= dt;
      this.blockedTime = 0;
      if (!this.talk && this.stepAside(dt, nav, others)) return;
      if (!this.talk && !this.fixed && this.timer < 1 && this.crowded(others)) {
        // packed in with a bunch of bystanders: walk off somewhere else
        this.wanderTo(nav);
        if (this.path.length) return;
      }
      // nobody loiters in a doorway or corridor: everybody else would have to wait for it
      this.loiter = !this.talk && !this.fixed && !this.companion && this.traffic && this.traffic.passages.at(this.pos) >= 0 ? this.loiter + dt : 0;
      if (this.loiter > LOITER) {
        this.loiter = 0;
        this.wanderTo(nav);
        if (this.path.length) return;
      }
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      if (this.talk) {
        // standing in a conversation: face the others
        const sp = this.talk.speaker;
        const c = sp && (sp as Walker) !== this && sp.speaking ? sp.pos : this.talk.center;
        this.turnTo(Math.atan2(c.x - this.pos.x, c.z - this.pos.z), dt);
        return;
      }
      if (this.timer <= 0) this.decide(nav);
      return;
    }

    const next = this.path[0];
    if (!next) {
      this.state = 'idle';
      this.timer = this.idleTime();
      return;
    }

    // desired direction towards the next waypoint
    let dx = next.x - this.pos.x;
    let dz = next.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-6;
    dx /= dist;
    dz /= dist;

    if (this.waitAtPassage(dt, nav, others, dx, dz)) return;

    // steering: sidestep walkers ahead (right-hand rule so head-on pairs pass each other), slow down if close
    let sx = 0;
    let sz = 0;
    let speedFactor = 1;
    let back = 0;
    let backSide = 1;
    for (const o of others) {
      if (o === this || o.away || this.ignores(o)) continue;
      const ox = o.pos.x - this.pos.x;
      const oz = o.pos.z - this.pos.z;
      const d = Math.hypot(ox, oz);
      const reach = this.radius + o.radius + 1.7;
      if (d >= reach || d === 0) continue;
      const ahead = (ox * dx + oz * dz) / d; // 1 = straight ahead
      if (ahead < -0.5) continue; // behind us
      const k = 1 - d / reach;
      // lateral offset of the other relative to our heading: side > 0 means it is on our right
      const side = ox * dz - oz * dx;
      // somebody waiting beside our lane for us to come through is no obstacle
      const yielding = o.yielding;
      if (yielding && Math.abs(side) > this.radius + o.radius) continue;
      const dodge = Math.abs(side) < 0.15 ? this.dodgePref : side > 0 ? 1 : -1; // go to the opposite side of it (head-on: our usual side)
      // perpendicular to heading (left = (-dz, dx)); dodge > 0 means other is on right, so go left
      sx += (-dz * dodge - ox / d * 0.3) * k * 3.2;
      sz += (dx * dodge - oz / d * 0.3) * k * 3.2;
      if (ahead > 0.4 && d < this.radius + o.radius + 0.9) {
        speedFactor = Math.min(speedFactor, Math.max(yielding ? 0.6 : 0.25, (d - this.radius - o.radius) / 0.9));
        // nose to nose: back off a little instead of pushing through (only from somebody walking, and not if they wait for us: walk around those).
        // If they come at us too, only one of the two backs off; the other edges past. Both backing off creep apart ever
        // slower, come back and stay in each other's way for good
        const mutual = (-ox * Math.sin(o.yaw) - oz * Math.cos(o.yaw)) / d > 0.4;
        if (!yielding && o.state === 'walk' && d < this.radius + o.radius + 0.4 && !(mutual && this.id < o.id)) {
          back = Math.max(back, 1 - (d - this.radius - o.radius) / 0.4);
          backSide = side > 0 ? -1 : 1;
        }
      }
    }
    let mx = dx + sx;
    let mz = dz + sz;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;
    // avoidance must never steer us into a wall: fall back to the plain heading (or a pure slowdown)
    if (!this.clear(nav, mx, mz)) {
      mx = dx;
      mz = dz;
      if (!this.clear(nav, mx, mz)) speedFactor = Math.max(speedFactor, 0.6);
    }

    // stuck for too long -> give up and pick something else
    this.blockedTime = speedFactor < 0.5 ? this.blockedTime + dt : 0;
    if (this.blockedTime === 0) this.replanned = false;
    if (this.blockedTime > 0.8 && !this.replanned && this.path.length) {
      // wedged behind people: flip our passing side and plan a route that stays well clear of them
      this.replanned = true;
      this.dodgePref = this.dodgePref === 1 ? -1 : 1;
      const goal = this.path[this.path.length - 1];
      this.goTo(nav, goal, 12);
      if (this.path.length) return;
    }
    if (this.blockedTime > 2.5) {
      this.blockedTime = 0;
      this.path = [];
      this.state = 'idle';
      this.timer = 0.3 + random();
      return;
    }

    if (back > 0 && this.clear(nav, -dx, -dz)) {
      // step backwards (and slightly sideways), keep facing the way we were going
      const bs = this.speed * 0.5 * Math.min(1, back) * dt;
      this.pos.x += (-dx - dz * backSide * 0.6) * bs;
      this.pos.z += (-dz + dx * backSide * 0.6) * bs;
      this.moving += (0.4 - this.moving) * Math.min(1, dt * 8);
      this.phase -= dt * this.speed * 2;
      return;
    }

    // no real progress for a while (wedged in a doorway / against furniture): re-plan, then give up
    this.stuckClock += dt;
    if (this.stuckClock >= 1.2) {
      const moved = Math.hypot(this.pos.x - this.stuckFrom.x, this.pos.z - this.stuckFrom.z);
      this.stuckClock = 0;
      this.stuckFrom = { ...this.pos };
      if (moved < this.speed * 0.25) {
        const goal = this.path[this.path.length - 1];
        if (++this.stuckCount >= 2 || !goal) {
          this.stuckCount = 0;
          this.path = [];
          this.state = 'idle';
          this.timer = 0.2 + random() * 0.5;
          return;
        }
        this.goTo(nav, goal, 12);
        return;
      }
      this.stuckCount = 0;
    }

    const step = this.speed * speedFactor * dt;
    this.pos.x += mx * step;
    this.pos.z += mz * step;
    const arrive = this.path.length > 1 ? 0.35 : 0.2;
    if (Math.hypot(next.x - this.pos.x, next.z - this.pos.z) <= Math.max(arrive, step)) this.path.shift();
    if (speedFactor > 0.3) this.turnTo(Math.atan2(mx, mz), dt);
    this.moving += (Math.min(1, speedFactor * 1.5) - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * speedFactor * 4.2;
  }

  /**
   * Doorways, corridors and gaps between desks take one direction at a time: with oncoming traffic in the passage ahead,
   * stop in front of it (the one already inside goes first) and keep out of the way of whoever comes out.
   * Deadlock fallback: after GATE_DETOUR seconds take another route if there is one; when patience runs out give way
   * (drop the route and clear off, like any stuck walker), and after giving way in vain go through regardless.
   * Returns true while waiting (replaces the walk for this step).
   */
  private waitAtPassage(dt: number, nav: NavGrid, others: readonly Walker[], dx: number, dz: number): boolean {
    const passages = this.traffic?.passages;
    if (!passages) return false;
    this.gateForce = Math.max(0, this.gateForce - dt);
    const gate = passages.gate(this, this.path, this.gateWait, this.gateForce > 0);
    // face to face with somebody inside a passage: the one who has to give way backs out to open floor
    const out = passages.headOn(this);
    if (out) {
      const back = nav.findPath(this.pos, out);
      if (back.length) {
        this.follow(nav, back);
        return true;
      }
    }
    if (!gate) {
      // drains instead of dropping to zero, so a way that keeps opening and closing still runs out of patience
      this.gateWait = Math.max(0, this.gateWait - dt * 2);
      if (this.gateWait === 0) this.gateDetoured = false;
      if (passages.at(this.pos) >= 0) this.gateGaveWay = false;
      return false;
    }
    this.gateWait += dt;
    if (this.gateWait > this.gatePatience) {
      this.gateWait = 0;
      this.gateDetoured = false;
      if (this.gateGaveWay) {
        this.gateGaveWay = false;
        this.gateForce = GATE_PUSH;
        passages.gate(this, this.path, 0, true);
        return false;
      }
      this.gateGaveWay = true;
      this.path = [];
      this.state = 'idle';
      this.timer = 0.2 + random() * 0.5;
      return true;
    }
    if (this.gateWait > GATE_DETOUR && !this.gateDetoured) {
      this.gateDetoured = true;
      const detour = this.traffic!.detour(this, this.path[this.path.length - 1], gate.passage);
      if (detour) {
        this.follow(nav, detour);
        return true;
      }
    }
    // waiting is not being stuck
    this.blockedTime = 0;
    this.stuckClock = 0;
    this.stuckFrom = { ...this.pos };
    if (this.clearMouth(dt, nav, gate) || this.stepAside(dt, nav, others)) return true;
    this.turnTo(Math.atan2(dx, dz), dt);
    this.moving += (0 - this.moving) * Math.min(1, dt * 8);
    return true;
  }

  /**
   * Waiting right in front of a passage would block whoever comes out of it: shuffle sideways out of its lane
   * (or backwards if there is no room beside it). Returns true while moving.
   */
  private clearMouth(dt: number, nav: NavGrid, gate: Gate): boolean {
    const rx = this.pos.x - gate.mouth.x;
    const rz = this.pos.z - gate.mouth.z;
    const along = rx * gate.dx + rz * gate.dz; // negative: still in front of the entrance
    const side = rx * gate.dz - rz * gate.dx;
    if (Math.abs(side) >= MOUTH_SIDE || along < -MOUTH_DEPTH) return false;
    const sgn = Math.abs(side) < 0.1 ? this.dodgePref : side > 0 ? 1 : -1;
    let mx = gate.dz * sgn;
    let mz = -gate.dx * sgn;
    if (!this.clear(nav, mx, mz)) {
      if (Math.abs(side) < 0.3 && this.clear(nav, -mx, -mz)) [mx, mz] = [-mx, -mz];
      else if (this.clear(nav, -gate.dx, -gate.dz)) [mx, mz] = [-gate.dx, -gate.dz];
      else return false;
    }
    const step = this.speed * 0.8 * dt;
    this.pos.x += mx * step;
    this.pos.z += mz * step;
    this.moving += (0.5 - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * 2.5;
    return true;
  }

  /** true when 4+ other bodies stand within ~1.8 and this walker is not part of a talk: time to move on */
  private crowded(others: readonly Walker[]): boolean {
    let n = 0;
    for (const o of others) {
      if (o === this || o.away || o.held || this.ignores(o) || o.talk) continue;
      if (Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < 1.8 && ++n >= 4) return true;
    }
    return false;
  }

  /** true if there is free floor (with body clearance) a short way in direction (dx,dz). */
  private clear(nav: NavGrid, dx: number, dz: number): boolean {
    const m = 0.3;
    for (const k of [0.5, 1]) {
      const c = nav.toCell({ x: this.pos.x + dx * m * k + dx * 0.15, z: this.pos.z + dz * m * k + dz * 0.15 });
      if (!nav.walkable(c.cx, c.cz)) return false;
    }
    return true;
  }

  private stepAside(dt: number, nav: NavGrid, others: readonly Walker[]): boolean {
    let ax = 0;
    let az = 0;
    for (const o of others) {
      if (o === this || o.away || o.held || this.ignores(o)) continue;
      const ox = this.pos.x - o.pos.x; // from them to us
      const oz = this.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      // a walker stuck behind people (waiting) asks bystanders in its lane to clear out, from further away
      const stuck = o.stuck;
      const near = this.radius + o.radius + (stuck ? 2.4 : 1.2);
      if (d >= near) continue;
      if (o.state === 'walk') {
        let hx = Math.sin(o.yaw);
        let hz = Math.cos(o.yaw);
        if (stuck) {
          // head for where they want to go, not where they currently face
          const t = o.path[0];
          const tl = Math.hypot(t.x - o.pos.x, t.z - o.pos.z);
          if (tl > 1e-4) {
            hx = (t.x - o.pos.x) / tl;
            hz = (t.z - o.pos.z) / tl;
          }
        }
        const along = -(ox * hx + oz * hz); // how far in front of them we stand
        const side = ox * hz - oz * hx;
        if (stuck) {
          if (along < -0.2 || Math.abs(side) > this.radius + o.radius + 0.9) continue; // not in their lane
        } else if (d > 1e-4 && (ox * hx + oz * hz) / d > -0.2) continue; // they are not heading at us
        // sidestep perpendicular to their heading, to the side we are already on
        const sgn = side >= 0 ? 1 : -1;
        const k = stuck ? 1 : 1 - d / near;
        ax += hz * sgn * k * 2 + (d > 1e-4 ? (ox / d) * 0.3 : 0);
        az += -hx * sgn * k * 2 + (d > 1e-4 ? (oz / d) * 0.3 : 0);
        if (stuck && this.state === 'idle') this.timer = Math.max(this.timer, 1.5); // stay out of the way a moment after they pass
      } else if (d < this.radius + o.radius && d > 1e-4 && !o.fixed) {
        // two standing bodies overlap: drift apart
        ax += ox / d;
        az += oz / d;
      }
    }
    const l = Math.hypot(ax, az);
    if (l < 0.05) return false;
    const idle = this.state === 'idle';
    ax /= l;
    az /= l;
    // never shuffle into walls, shelves or door frames: try the mirrored side, else stay put
    if (!this.clear(nav, ax, az)) {
      if (this.clear(nav, -az, ax)) [ax, az] = [-az, ax];
      else if (this.clear(nav, az, -ax)) [ax, az] = [az, -ax];
      else return false;
    }
    const step = this.speed * 0.9 * dt;
    this.pos.x += ax * step;
    this.pos.z += az * step;
    this.moving += (0.5 - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * 2.5;
    if (idle) this.timer = Math.max(this.timer, 0.4); // don't wander off while shuffling
    return true;
  }

  walkTo(nav: NavGrid, to: Vec2): void {
    this.path = [];
    this.state = 'idle';
    this.goTo(nav, to);
  }

  protected turnTo(target: number, dt: number): void {
    let d = target - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 10);
  }

  protected idleTime(): number {
    return 1.5 + random() * 5;
  }

  /** Walk to a random free cell, with random jitter so people don't stack on cell centres. */
  protected wanderTo(nav: NavGrid): void {
    if (this.traffic) return this.goTo(nav, this.traffic.wanderSpot(this));
    const { cx, cz } = nav.randomWalkable();
    this.goTo(nav, nav.center(cx, cz));
  }

  protected goTo(nav: NavGrid, to: Vec2, avoid = 3): void {
    const path = this.traffic ? this.traffic.route(this, to, avoid) : nav.findPath(this.pos, to);
    if (!path.length) {
      this.timer = 0.5;
      return;
    }
    this.follow(nav, path);
  }

  private follow(nav: NavGrid, path: Vec2[]): void {
    const j = nav.cell * 0.3;
    this.path = path.map((p, i) => (i === path.length - 1 ? p : { x: p.x + (random() - 0.5) * j, z: p.z + (random() - 0.5) * j }));
    this.state = 'walk';
    this.stuckClock = 0;
    this.stuckFrom = { ...this.pos };
  }
}
