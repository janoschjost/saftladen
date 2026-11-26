/** Picking people and pets under the pointer: a generous upright cylinder per body, then the nearest on screen. */

export interface Ray3 {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

/** Upright hit volume: centre on the floor, radius, bottom and top height (world metres). */
export interface Column {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
}

/** The hit volume of Christian's ghost (#328): a person's column, as tall as he is (`heightM`), floating a few cm above the floor. */
export function ghostColumn(at: { x: number; z: number }, heightM: number): Column {
  return { x: at.x, z: at.z, r: 0.4, y0: 0, y1: heightM + 0.15 };
}

/** Ray distance at which `ray` enters `c` (0 when it starts inside), or null when it misses. */
export function hitColumn(ray: Ray3, c: Column): number | null {
  const { origin: o, direction: d } = ray;
  const ox = o.x - c.x;
  const oz = o.z - c.z;
  let t0 = -Infinity;
  let t1 = Infinity;
  // the round side, seen from above
  const a = d.x * d.x + d.z * d.z;
  const k = ox * ox + oz * oz - c.r * c.r;
  if (a < 1e-12) {
    if (k > 0) return null; // straight down outside the circle
  } else {
    const b = ox * d.x + oz * d.z;
    const disc = b * b - a * k;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    t0 = (-b - s) / a;
    t1 = (-b + s) / a;
  }
  // between floor and top
  if (Math.abs(d.y) < 1e-12) {
    if (o.y < c.y0 || o.y > c.y1) return null;
  } else {
    const ta = (c.y0 - o.y) / d.y;
    const tb = (c.y1 - o.y) / d.y;
    t0 = Math.max(t0, Math.min(ta, tb));
    t1 = Math.min(t1, Math.max(ta, tb));
  }
  if (t0 > t1 || t1 < 0) return null;
  return Math.max(t0, 0);
}

type Px = { x: number; y: number };

/** Screen distance (px) from point `p` to the segment `a`–`b`. */
export function distToSegment(p: Px, a: Px, b: Px): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const l = vx * vx + vy * vy;
  const t = l > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l)) : 0;
  return Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t));
}

/** Of the columns `ray` passes through, the index of the one nearest to the camera, or -1. */
export function nearestHit(ray: Ray3, columns: readonly Column[]): number {
  let best = -1;
  let bestT = Infinity;
  columns.forEach((c, i) => {
    const t = hitColumn(ray, c);
    if (t !== null && t < bestT) {
      bestT = t;
      best = i;
    }
  });
  return best;
}

/** Index of the on-screen body (axis `feet`–`head` and half width `r`, px) whose outline is closest to `pointer`, if within `maxPx`; else -1. */
export function nearestOnScreen(pointer: Px, bodies: readonly { feet: Px; head: Px; r: number }[], maxPx: number): number {
  let best = -1;
  let bestD = maxPx;
  bodies.forEach((b, i) => {
    const dist = Math.max(0, distToSegment(pointer, b.feet, b.head) - b.r);
    if (dist <= bestD) {
      bestD = dist;
      best = i;
    }
  });
  return best;
}
