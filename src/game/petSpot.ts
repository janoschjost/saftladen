import type { NavGrid, Vec2 } from './NavGrid';

/** Which passage a spot lies in (-1 = open floor); `Passages.at`. */
export type PassageAt = (p: Vec2) => number;

const SEARCH = 1.6; // metres around the ideal heel spot that are looked at
const NEAR_PASSAGE = 0.8; // score penalty for a cell right beside a passage entrance
const SHELTER = 0.12; // score bonus per blocked neighbour (against a desk or a wall is out of everybody's way)
const KEEP_OFF = 0.8; // metres a lying spot keeps from each spot in `avoid`

/**
 * Where a pet lies down beside its seated owner: a free cell near `ideal`, within `reach` of the owner, never inside a
 * passage (doorway, corridor, gap between desks), preferably not right beside one and tucked against furniture or a wall.
 * `avoid` are spots the pet has had to clear for somebody, and points it must not lie on (a walker's route).
 * Returns null if no such cell exists; the caller then falls back to the plain heel spot.
 */
export function lieSpot(nav: NavGrid, passageAt: PassageAt | null, owner: Vec2, ideal: Vec2, reach: number, avoid: readonly Vec2[] = []): Vec2 | null {
  const { cx: ix, cz: iz } = nav.toCell(ideal);
  const ring = Math.ceil(SEARCH / nav.cell);
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  for (let dz = -ring; dz <= ring; dz++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const cx = ix + dx;
      const cz = iz + dz;
      if (!nav.walkable(cx, cz)) continue;
      const c = nav.center(cx, cz);
      const d = Math.hypot(c.x - ideal.x, c.z - ideal.z);
      if (d > SEARCH || Math.hypot(c.x - owner.x, c.z - owner.z) > reach) continue;
      if (passageAt && passageAt(c) >= 0) continue;
      if (avoid.some((a) => Math.hypot(a.x - c.x, a.z - c.z) < KEEP_OFF)) continue;
      let blocked = 0;
      let nearPassage = false;
      for (let ez = -1; ez <= 1; ez++) {
        for (let ex = -1; ex <= 1; ex++) {
          if (!ex && !ez) continue;
          if (!nav.walkable(cx + ex, cz + ez)) blocked++;
          else if (passageAt && passageAt(nav.center(cx + ex, cz + ez)) >= 0) nearPassage = true;
        }
      }
      const score = d + (nearPassage ? NEAR_PASSAGE : 0) - blocked * SHELTER;
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
  }
  return best;
}

/** True if `p` (a body of radius `r`) stands in the way of a walker at `from` following `path` (the next few waypoints). */
export function inLane(p: Vec2, r: number, from: Vec2, path: readonly Vec2[], width: number, steps = 3): boolean {
  let a = from;
  for (const b of path.slice(0, steps)) {
    const vx = b.x - a.x;
    const vz = b.z - a.z;
    const l2 = vx * vx + vz * vz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2)) : 0;
    if (Math.hypot(p.x - (a.x + vx * t), p.z - (a.z + vz * t)) < r + width) return true;
    a = b;
  }
  return false;
}
