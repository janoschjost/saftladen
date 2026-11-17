import * as THREE from 'three';
import { avoid, WALL_CLEARANCE, type Body } from './Avoidance';
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
const NEIGHBOUR = 3; // metres within which other bodies are avoided
const MAX_NEIGHBOURS = 10; // ... the closest ones of them
const KEEP_RIGHT = 0.25; // radians the wish leans to the right with somebody coming the other way
const KEEP_RIGHT_RANGE = 4; // ... within this distance ahead
const REPLAN = 1.5; // seconds held up (crawling) before a route around the crowd is planned
const GIVE_UP = 5; // ... before the walker drops its route and does something else
const CLOSE_ENOUGH = 0.5; // metres from its target at which a held-up walker counts as arrived (jobs take 0.6)
const CLOSE_ENOUGH_AFTER = 0.4; // ... once it has been held up this long
const SQUEEZE_PAST = 0.5; // seconds held up after which bodies standing in the way no longer count
const SQUEEZE_FOR = 1.5; // ... for this long, until the walker is past them
const STILL: Vec2 = { x: 0, z: 0 };

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
  /** velocity of the last step (m/s); zero unless walking */
  vel: Vec2 = STILL;
  /**
   * unit direction this walker was last steering towards (its next waypoint). Kept, not recomputed from the route: while
   * it waits at a door it still counts as going that way for whoever comes the other way (keep right)
   */
  heading: Vec2 = STILL;
  path: Vec2[] = [];
  /** where the route leads: the spot asked for (the route itself ends on that spot's nav cell centre) */
  private target: Vec2 = STILL;
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
  /** seconds this walker still squeezes past bodies standing in its way */
  private squeeze = 0;
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

  /** The rest of this walker's planned route (for the interior doors: they open for whoever goes through them); null = no plan, the doors open by proximity. */
  get doorPath(): Vec2[] | null {
    return this.script ? [this.script.to] : this.path;
  }

  /** Pinned in place: other walkers neither push this one nor get pushed by it. */
  get fixed(): boolean {
    return false;
  }

  /** Holds its ground (stroking a pet, being stroked): bumping walkers get pushed off it, not the other way round. */
  get steady(): boolean {
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

  /** Stands at `at` now, without a walk. */
  placeAt(at: Vec2): void {
    this.pos = { ...at };
    this.prev = { ...at };
    this.path = [];
    this.state = 'idle';
  }

  /** There at once, fully materialised: no arrival show (a scene puts somebody into the office). */
  appearNow(): void {
    this.away = false;
    this.fx = 1;
    this.fxEvent = null;
    if (this.baseScale) this.root.scale.copy(this.baseScale);
    this.root.visible = true;
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

  /** Gave way at a passage (dropped its route after waiting too long) and has not got through one since. */
  get gaveWay(): boolean {
    return this.gateGaveWay;
  }

  /** Pushing through passages regardless of reservations, after giving way did not help (deadlock fallback). */
  get forcing(): boolean {
    return this.gateForce > 0;
  }

  ignores(o: Walker): boolean {
    return this.companion === o || o.companion === this;
  }

  update(dt: number, nav: NavGrid, others: readonly Walker[] = []): void {
    // how fast we really got on last step, the bodies' collision included (ORCA may pick a speed that a push undoes)
    const last = this.vel;
    const made = (last.x || last.z) && dt > 0 ? Math.hypot(this.pos.x - this.prev.x, this.pos.z - this.prev.z) / dt : Infinity;
    this.prev = { ...this.pos };
    this.prevYaw = this.yaw;
    this.prevPhase = this.phase;

    this.socialCooldown = Math.max(0, this.socialCooldown - dt);
    this.vel = STILL;

    if (this.control(dt, nav)) return;

    if (this.held) {
      this.halt(0.6);
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

    const v = this.avoidance(dt, nav, others, dx, dz, last);
    const speedFactor = Math.hypot(v.x, v.z) / this.speed;
    const progress = Math.min(speedFactor, made / this.speed);

    // held up by a crowd: re-plan a route that stays well clear of it, and give up if that does not help either
    this.blockedTime = progress < 0.4 ? this.blockedTime + dt : 0;
    if (this.blockedTime === 0) this.replanned = false;
    // nearly there, but somebody stands on the spot or it hugs a wall: close enough
    if (this.blockedTime > CLOSE_ENOUGH_AFTER && this.path.length === 1 && Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < CLOSE_ENOUGH) {
      this.halt(this.idleTime());
      return;
    }
    if (this.blockedTime > REPLAN && !this.replanned && this.path.length) {
      this.replanned = true;
      this.goTo(nav, this.target, 12);
      if (this.path.length) return;
    }
    if (this.blockedTime > GIVE_UP) {
      this.blockedTime = 0;
      this.halt(0.3 + random());
      return;
    }

    // no real progress for a while (wedged in a doorway / against furniture): re-plan, then give up
    this.stuckClock += dt;
    if (this.stuckClock >= 1.2) {
      const moved = Math.hypot(this.pos.x - this.stuckFrom.x, this.pos.z - this.stuckFrom.z);
      this.stuckClock = 0;
      this.stuckFrom = { ...this.pos };
      if (moved < this.speed * 0.25 && this.blockedTime === 0) {
        if (++this.stuckCount >= 2 || !this.path.length) {
          this.stuckCount = 0;
          this.halt(0.2 + random() * 0.5);
          return;
        }
        this.goTo(nav, this.target, 12);
        return;
      }
      this.stuckCount = 0;
    }

    this.pos.x += v.x * dt;
    this.pos.z += v.z * dt;
    this.vel = v;
    const arrive = this.path.length > 1 ? 0.35 : 0.2;
    if (Math.hypot(next.x - this.pos.x, next.z - this.pos.z) <= Math.max(arrive, speedFactor * this.speed * dt)) this.path.shift();
    if (speedFactor > 0.3) this.turnTo(Math.atan2(v.x, v.z), dt);
    this.moving += (Math.min(1, speedFactor * 1.5) - this.moving) * Math.min(1, dt * 8);
    this.phase += dt * this.speed * speedFactor * 4.2;
  }

  /**
   * The velocity to walk with this step: towards the next waypoint at full speed, bent by ORCA (`Avoidance.ts`) around
   * everybody close by and off the walls. Walking neighbours share the avoiding; standing, seated or waiting ones are
   * fixed obstacles. With somebody coming the other way, the wish leans a little to the right, so both sides keep to
   * their own lane and two streams pass each other.
   */
  private avoidance(dt: number, nav: NavGrid, others: readonly Walker[], dx: number, dz: number, vel: Vec2): Vec2 {
    this.squeeze = this.blockedTime > SQUEEZE_PAST ? SQUEEZE_FOR : Math.max(0, this.squeeze - dt);
    let wx = dx * this.speed;
    let wz = dz * this.speed;
    const near: Array<Body & { d: number }> = [];
    let oncoming = false;
    for (const o of others) {
      if (o === this || o.away || this.ignores(o)) continue;
      const ox = o.pos.x - this.pos.x;
      const oz = o.pos.z - this.pos.z;
      const dSq = ox * ox + oz * oz;
      if (dSq > NEIGHBOUR * NEIGHBOUR || dSq < 1e-12) continue;
      const d = Math.sqrt(dSq);
      const moving = o.state === 'walk' && !o.fixed && !o.held && !o.yielding;
      const standing = !moving && !o.held;
      // somebody standing in a gap only one fits through (a doorway, the row of meeting seats): after a moment squeeze
      // past them ("excuse me"); the bodies' collision then nudges a bystander aside
      if (standing && this.squeeze > 0) continue;
      // coming the other way: judged by where they want to go, as somebody held up stands still
      if (o.state === 'walk' && d < KEEP_RIGHT_RANGE && (ox * dx + oz * dz) / d > 0.5 && o.heading.x * dx + o.heading.z * dz < -0.2) oncoming = true;
      near.push({ pos: o.pos, vel: moving ? o.vel : STILL, radius: o.radius, share: moving ? 0.5 : 1, d });
    }
    this.heading = { x: dx, z: dz };
    near.sort((a, b) => a.d - b.d);
    if (near.length > MAX_NEIGHBOURS) near.length = MAX_NEIGHBOURS;
    if (oncoming) {
      const c = Math.cos(KEEP_RIGHT);
      const s = Math.sin(KEEP_RIGHT);
      [wx, wz] = [wx * c - wz * s, wx * s + wz * c];
    }
    return avoid({ pos: this.pos, vel, radius: this.radius }, { x: wx, z: wz }, this.speed, near, nav, WALL_CLEARANCE, dt);
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
      this.halt(0.2 + random() * 0.5);
      return true;
    }
    if (this.gateWait > GATE_DETOUR && !this.gateDetoured) {
      this.gateDetoured = true;
      const detour = this.traffic!.detour(this, this.path[this.path.length - 1], gate.passage);
      if (detour) {
        this.follow(nav, detour, this.target);
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

  /** Drops the route and stands, for `timer` seconds before deciding again. */
  private halt(timer: number): void {
    this.path = [];
    this.state = 'idle';
    this.timer = timer;
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
    this.follow(nav, path, to);
  }

  private follow(nav: NavGrid, path: Vec2[], target = path[path.length - 1]): void {
    this.target = target;
    const j = nav.cell * 0.3;
    this.path = path.map((p, i) => (i === path.length - 1 ? p : { x: p.x + (random() - 0.5) * j, z: p.z + (random() - 0.5) * j }));
    this.state = 'walk';
    this.stuckClock = 0;
    this.stuckFrom = { ...this.pos };
  }
}
