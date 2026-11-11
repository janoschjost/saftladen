import * as THREE from 'three';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Conversation } from './Social';

export type WalkerState = 'idle' | 'walk';

/**
 * Base for everything that wanders the floor. Holds sim state only;
 * the render side reads pos/yaw (interpolated) and animation phase.
 */
export abstract class Walker {
  pos: Vec2;
  prev: Vec2;
  yaw = Math.random() * Math.PI * 2;
  prevYaw = this.yaw;
  phase = Math.random() * 10;
  prevPhase = this.phase;
  moving = 0; // 0..1 eased walk amount (drives animation)
  state: WalkerState = 'idle';
  path: Vec2[] = [];
  timer = Math.random() * 3;
  abstract speed: number;
  abstract radius: number;
  abstract root: THREE.Object3D;
  abstract headHeight: number;
  abstract id: string;
  /** Walker this one stays with (dog -> owner); excluded from avoidance and collision. */
  companion: Walker | null = null;
  private blockedTime = 0;
  /** true while the user holds this walker with the mouse */
  held = false;
  /** conversation this walker is part of, if any */
  talk: Conversation | null = null;
  speaking = false;
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

  setAway(away: boolean): void {
    this.away = away;
    this.root.visible = !away;
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
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      this.blockedTime = 0;
      if (this.talk) {
        // standing in a conversation: face the others
        const c = this.talk.center;
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

    // steering: sidestep walkers ahead (right-hand rule so head-on pairs pass each other), slow down if close
    let sx = 0;
    let sz = 0;
    let speedFactor = 1;
    for (const o of others) {
      if (o === this || o.away || this.ignores(o)) continue;
      const ox = o.pos.x - this.pos.x;
      const oz = o.pos.z - this.pos.z;
      const d = Math.hypot(ox, oz);
      const reach = this.radius + o.radius + 0.9;
      if (d >= reach || d === 0) continue;
      const ahead = (ox * dx + oz * dz) / d; // 1 = straight ahead
      if (ahead < -0.2) continue; // behind us
      const k = 1 - d / reach;
      // lateral offset of the other relative to our heading: side > 0 means it is on our right
      const side = ox * dz - oz * dx;
      const dodge = side > 0 ? 1 : -1; // go to the opposite side of it
      // perpendicular to heading (left = (-dz, dx)); dodge > 0 means other is on right, so go left
      sx += (-dz * dodge - ox / d * 0.3) * k * 2.2;
      sz += (dx * dodge - oz / d * 0.3) * k * 2.2;
      if (ahead > 0.6 && d < this.radius + o.radius + 0.35) speedFactor = Math.min(speedFactor, 0.25);
    }
    let mx = dx + sx;
    let mz = dz + sz;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml;
    mz /= ml;

    // stuck for too long -> give up and pick something else
    this.blockedTime = speedFactor < 0.5 ? this.blockedTime + dt : 0;
    if (this.blockedTime > 2.5) {
      this.blockedTime = 0;
      this.path = [];
      this.state = 'idle';
      this.timer = 0.3 + Math.random();
      return;
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
    return 1.5 + Math.random() * 5;
  }

  /** Walk to a random free cell, with random jitter so people don't stack on cell centres. */
  protected wanderTo(nav: NavGrid): void {
    const { cx, cz } = nav.randomWalkable();
    this.goTo(nav, nav.center(cx, cz));
  }

  protected goTo(nav: NavGrid, to: Vec2): void {
    const path = nav.findPath(this.pos, to);
    if (!path.length) {
      this.timer = 0.5;
      return;
    }
    const j = nav.cell * 0.3;
    this.path = path.map((p, i) => (i === path.length - 1 ? p : { x: p.x + (Math.random() - 0.5) * j, z: p.z + (Math.random() - 0.5) * j }));
    this.state = 'walk';
  }
}
