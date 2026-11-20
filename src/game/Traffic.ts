import type { NavGrid, Vec2 } from './NavGrid';
import { Passages } from './Passages';
import type { Walker } from './Walker';
import { random } from './rng';

const RADIUS = 1.3; // how far a body's presence is felt (metres)
const WALK_WEIGHT = 0.4; // moving bodies hurt less than standing ones: they are about to leave
const LOOKAHEAD = 2; // waypoints of each walking body that also count
const REBUILD = 0.2; // seconds between density rebuilds
const CLAIM_TTL = 8; // seconds a picked destination stays reserved
const CLAIM_RADIUS = 1.6;
const PASSAGE_LOAD = 2; // standing around in a doorway or corridor counts like two bodies on the spot
const PASSAGE_ROOM = 1.6; // a chat gathers this far from one (its members stand about 0.6 m round the centre and keep 1 m clear, see `Conversation`)
const NEAR_PASSAGE_LOAD = 1.5;
const SHUN_COST = 40; // extra path cost per cell of a passage that is to be bypassed
const LYING_COST = 25; // extra path cost per cell next to a lying pet: walk around it when there is a way
const LYING_REACH = 0.7; // metres around a lying body whose cells cost extra (its radius plus a passer-by's)

interface Footprint {
  idx: number[];
  val: number[];
}

interface Claim {
  x: number;
  z: number;
  ttl: number;
  by: Walker;
}

/**
 * The traffic director: one shared picture of where everybody is and is heading.
 * - `route` plans paths on a density-weighted grid, so routes bend around crowds before anyone gets stuck.
 * - `wanderSpot` / `openSpotNear` hand out destinations away from crowds and from spots already picked by others.
 * - `passages` lets only one direction at a time through doorways, corridors and other narrow spots.
 * Walkers keep their own local steering (sidestepping, slowing); the director only decides where, which way and who goes first.
 */
export class Traffic {
  private density: Float32Array;
  private prints = new Map<Walker, Footprint>();
  private claims: Claim[] = [];
  private clock = REBUILD;
  private bodies: readonly Walker[] = [];
  readonly passages: Passages;

  constructor(private nav: NavGrid) {
    this.density = new Float32Array(nav.cols * nav.rows);
    this.passages = new Passages(nav);
  }

  /** The walkable floor changed (furniture moved): find the narrow passages again. */
  rebuild(): void {
    this.passages.rebuild();
  }

  update(dt: number, walkers: readonly Walker[]): void {
    this.passages.tick(dt, walkers);
    for (const c of this.claims) c.ttl -= dt;
    this.claims = this.claims.filter((c) => c.ttl > 0 && !c.by.away);
    this.bodies = walkers;
    this.clock += dt;
    if (this.clock < REBUILD) return;
    this.clock = 0;
    this.density.fill(0);
    this.prints.clear();
    this.nav.clearSoft();
    for (const w of walkers) if (!w.away && !w.held && w.obstacle) this.nav.markSoft(w.pos, LYING_REACH, LYING_COST);
    for (const w of walkers) {
      if (w.away || w.held) continue;
      const fp: Footprint = { idx: [], val: [] };
      this.stamp(fp, w.pos, w.state === 'idle' ? 1 : WALK_WEIGHT);
      if (w.state === 'walk') {
        for (const p of w.path.slice(0, LOOKAHEAD)) if (Math.hypot(p.x - w.pos.x, p.z - w.pos.z) < 4) this.stamp(fp, p, WALK_WEIGHT);
      }
      for (let i = 0; i < fp.idx.length; i++) this.density[fp.idx[i]] += fp.val[i];
      this.prints.set(w, fp);
    }
  }

  private stamp(fp: Footprint, at: Vec2, weight: number): void {
    const nav = this.nav;
    const reach = Math.ceil(RADIUS / nav.cell);
    const { cx, cz } = nav.toCell(at);
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (!nav.inside(cx + dx, cz + dz)) continue;
        const c = nav.center(cx + dx, cz + dz);
        const d = Math.hypot(c.x - at.x, c.z - at.z);
        if (d >= RADIUS) continue;
        fp.idx.push((cz + dz) * nav.cols + cx + dx);
        fp.val.push(weight * (1 - d / RADIUS));
      }
    }
  }

  /** Adds (sign 1) or removes (sign -1) the bodies' own contribution, so a walker does not route around itself. */
  private apply(bodies: readonly Walker[], sign: 1 | -1): void {
    for (const b of bodies) {
      const fp = this.prints.get(b);
      if (fp) for (let i = 0; i < fp.idx.length; i++) this.density[fp.idx[i]] += sign * fp.val[i];
    }
  }

  private others(self: Walker): Walker[] {
    return self.companion ? [self, self.companion] : [self];
  }

  /**
   * Crowd-aware path for `self`. `avoid` scales how much crowds are shunned (0 = plain shortest path).
   * With `shun`, the cells of that passage are made very expensive, so the route takes another way if there is one.
   */
  route(self: Walker, to: Vec2, avoid = 3, shun = -1): Vec2[] {
    if (avoid <= 0 && shun < 0) return this.nav.findPath(self.pos, to);
    const mine = this.others(self);
    this.apply(mine, -1);
    const cost = new Float32Array(this.density.length);
    for (let i = 0; i < cost.length; i++) cost[i] = Math.max(0, this.density[i]) * avoid + (shun >= 0 && this.passages.atIndex(i) === shun ? SHUN_COST : 0);
    this.apply(mine, 1);
    return this.nav.findPath(self.pos, to, cost);
  }

  /** A route to `to` that does not use `passage` at all, or null if there is no other way. */
  detour(self: Walker, to: Vec2, passage: number): Vec2[] | null {
    if (this.passages.at(self.pos) === passage) return null;
    const path = this.route(self, to, 3, passage);
    return path.length && !this.passages.crosses(path, passage) ? path : null;
  }

  private claimed(p: Vec2, self: Walker): number {
    let n = 0;
    for (const c of this.claims) if (c.by !== self && Math.hypot(c.x - p.x, c.z - p.z) < CLAIM_RADIUS) n++;
    return n;
  }

  private load(p: Vec2, self: Walker): number {
    const { cx, cz } = this.nav.toCell(p);
    const own = this.prints.get(self)?.idx.indexOf(cz * this.nav.cols + cx) ?? -1;
    const mine = own >= 0 ? this.prints.get(self)!.val[own] : 0;
    return Math.max(0, this.density[cz * this.nav.cols + cx] - mine) + this.claimed(p, self) * 0.8 + (this.passages.at(p) >= 0 ? PASSAGE_LOAD : 0);
  }

  /** How many bodies (people and pets, not away or held) stand within `r` of `p`. */
  bodiesNear(p: Vec2, r: number): number {
    let n = 0;
    for (const w of this.bodies) if (!w.away && !w.held && Math.hypot(w.pos.x - p.x, w.pos.z - p.z) < r) n++;
    return n;
  }

  /**
   * A quiet spot to wander to: the least crowded of a few random candidates (slightly preferring nearer ones). Reserved for a while.
   * With `minDist`, spots closer than that to the walker are shunned (clearing out of the way).
   */
  wanderSpot(self: Walker, samples = 8, minDist = 0): Vec2 {
    let best: Vec2 | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < samples; i++) {
      const { cx, cz } = this.nav.randomWalkable();
      const p = this.nav.center(cx, cz);
      const dist = Math.hypot(p.x - self.pos.x, p.z - self.pos.z);
      const score = this.load(p, self) + dist * 0.02 + (dist < minDist ? 5 : 0) + random() * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    const spot = best ?? this.nav.center(0, 0);
    this.claims = this.claims.filter((c) => c.by !== self);
    this.claims.push({ x: spot.x, z: spot.z, ttl: CLAIM_TTL, by: self });
    return spot;
  }

  /** The least crowded walkable spot within `radius` of `p` (for gathering points of chats); `group` does not count as crowd. */
  openSpotNear(p: Vec2, radius: number, group: readonly Walker[] = []): Vec2 {
    this.apply(group, -1);
    let best = p;
    let bestScore = Infinity;
    const step = this.nav.cell;
    for (let dz = -radius; dz <= radius; dz += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const q = { x: p.x + dx, z: p.z + dz };
        const d = Math.hypot(dx, dz);
        if (d > radius) continue;
        const { cx, cz } = this.nav.toCell(q);
        if (!this.nav.walkable(cx, cz)) continue;
        const c = this.nav.center(cx, cz);
        const score = Math.max(0, this.density[cz * this.nav.cols + cx]) + this.claimed(c, group[0]) * 0.8 + d * 0.15 + (this.passages.at(c) >= 0 ? PASSAGE_LOAD : this.passages.near(c, PASSAGE_ROOM) ? NEAR_PASSAGE_LOAD : 0);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    this.apply(group, 1);
    return best;
  }
}
