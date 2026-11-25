import type * as THREE from 'three';
import { BUILDINGS, TERRAIN } from './cityData';

/** An axis-aligned rectangle on the ground (game metres, x / z). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A building of the neighbourhood: its footprint (game metres, x / z pairs), where it stands and how high it is. */
export interface Building {
  /** the footprint corners, x then z */
  p: number[];
  /** the centre of the footprint */
  x: number;
  z: number;
  /** the ground at its lowest corner (m, relative to the office's floor) */
  base: number;
  /** the roof's height above the office's floor (m) */
  h: number;
  /** a ready-made drawing instead of the plain block (the ground floor under the office) */
  geometry?: THREE.BufferGeometry;
}

export const CITY = {
  /** the office is on the first floor: its floor lies this far above the street (m), with a ground-floor building below it */
  storey: 3.5,
  /** one floor (m); the office's roof is 3.8 to 5.5 m */
  floor: 3.2,
  /** the camera's sector (radians, each side) in which tall buildings are hidden */
  sector: (62 * Math.PI) / 180,
  /** the hill is levelled to the office's floor at the footprint and rises to its real height this far out (m) */
  levelled: 45,
};

/** The distance of a point from a rectangle (0 inside it). */
function distance(r: Rect, x: number, z: number): number {
  return Math.hypot(Math.max(r.x0 - x, x - r.x1, 0), Math.max(r.z0 - z, z - r.z1, 0));
}

/**
 * The ground at a point, relative to the office's floor (the street lies `CITY.storey` below it): the real terrain of St. Gallen (bilinear between the grid
 * points), levelled around the office so nothing pokes through its floor. `origin` is where the data's centre
 * stands in the game (the middle of the office's main body).
 */
export function groundAt(foot: Rect, origin: { x: number; z: number }, x: number, z: number): number {
  const { half, step, n, heights } = TERRAIN;
  const gx = Math.min(n - 1.001, Math.max(0, (x - origin.x + half) / step));
  const gz = Math.min(n - 1.001, Math.max(0, (z - origin.z + half) / step));
  const i = Math.floor(gx);
  const j = Math.floor(gz);
  const fx = gx - i;
  const fz = gz - j;
  const at = (a: number, b: number) => heights[b * n + a];
  const raw = (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fz) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fz;
  const k = Math.min(1, distance(foot, x, z) / CITY.levelled);
  return raw * k * k * (3 - 2 * k) - CITY.storey;
}

/** Whether a footprint (x, z pairs) and a rectangle share ground: a corner of one inside the other, or their outlines crossing. */
export function overlaps(p: number[], rect: Rect): boolean {
  const e = 1e-6; // only touching along the side is no overlap
  const r = { x0: rect.x0 + e, z0: rect.z0 + e, x1: rect.x1 - e, z1: rect.z1 - e };
  const n = p.length / 2;
  const inside = (x: number, z: number) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const inPoly = (x: number, z: number) => {
    let c = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const zi = p[i * 2 + 1];
      const zj = p[j * 2 + 1];
      if (zi > z !== zj > z && x < ((p[j * 2] - p[i * 2]) * (z - zi)) / (zj - zi) + p[i * 2]) c = !c;
    }
    return c;
  };
  for (let i = 0; i < n; i++) if (inside(p[i * 2], p[i * 2 + 1])) return true;
  if ([[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1]].some(([x, z]) => inPoly(x, z))) return true;
  // a side of the footprint crossing the rectangle (clip the segment to it)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let t0 = 0;
    let t1 = 1;
    const dx = p[j * 2] - p[i * 2];
    const dz = p[j * 2 + 1] - p[i * 2 + 1];
    const edges: Array<[number, number]> = [[-dx, p[i * 2] - r.x0], [dx, r.x1 - p[i * 2]], [-dz, p[i * 2 + 1] - r.z0], [dz, r.z1 - p[i * 2 + 1]]];
    let cut = false;
    for (const [d, q] of edges) {
      if (d === 0) {
        if (q <= 0) cut = true; // parallel and outside, or just along the side: only touching
      } else {
        const t = q / d;
        if (d < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
      }
    }
    if (!cut && t0 < t1) return true;
  }
  return false;
}

/** The part of a footprint (x, z pairs) on one side of a line: `inside(x, z)` is positive on the kept side, `cross(a, b)` the crossing of a side with the line. */
function clip(p: number[], inside: (x: number, z: number) => number, cross: (x0: number, z0: number, x1: number, z1: number) => [number, number]): number[] {
  const out: number[] = [];
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n;
    const a = [p[j * 2], p[j * 2 + 1]] as const;
    const b = [p[i * 2], p[i * 2 + 1]] as const;
    const ain = inside(...a) >= 0;
    const bin = inside(...b) >= 0;
    if (bin !== ain) out.push(...cross(...a, ...b));
    if (bin) out.push(...b);
  }
  return out;
}

/** What is left of a footprint when the rectangle is taken out of it: up to four pieces (west, east, north and south of it). */
export function without(p: number[], r: Rect): number[][] {
  const atX = (x: number) => (x0: number, z0: number, x1: number, z1: number): [number, number] => [x, z0 + ((z1 - z0) * (x - x0)) / (x1 - x0)];
  const atZ = (z: number) => (x0: number, z0: number, x1: number, z1: number): [number, number] => [x0 + ((x1 - x0) * (z - z0)) / (z1 - z0), z];
  const middle = clip(clip(p, (x) => x - r.x0, atX(r.x0)), (x) => r.x1 - x, atX(r.x1));
  return [
    clip(p, (x) => r.x0 - x, atX(r.x0)),
    clip(p, (x) => x - r.x1, atX(r.x1)),
    clip(middle, (_, z) => r.z0 - z, atZ(r.z0)),
    clip(middle, (_, z) => z - r.z1, atZ(r.z1)),
  ].filter((q) => q.length >= 6);
}

/**
 * The buildings of the real neighbourhood (`cityData.ts`) placed around the office (`origin`: where the data's centre, the centre of the real building, stands: the middle of the office's main body), with what lies inside the
 * office's footprint cut away (the real building itself is not in the data). Deterministic: the data is fixed.
 */
export function cityLayout(foot: Rect, origin: { x: number; z: number }): Building[] {
  const out: Building[] = [];
  for (const b of BUILDINGS) {
    const whole: number[] = [];
    for (let k = 0; k < b.p.length; k += 2) whole.push(b.p[k] + origin.x, b.p[k + 1] + origin.z);
    // a neighbour that reaches into the office keeps what lies outside its footprint
    for (const p of overlaps(whole, foot) ? without(whole, foot) : [whole]) {
      let x = 0;
      let z = 0;
      let base = Infinity;
      for (let k = 0; k < p.length; k += 2) {
        x += p[k];
        z += p[k + 1];
        base = Math.min(base, groundAt(foot, origin, p[k], p[k + 1]));
      }
      out.push({ p, x: (x * 2) / p.length, z: (z * 2) / p.length, base, h: base + b.h });
    }
  }
  return out;
}

/** How the camera looks at the office: a unit vector on the ground from the office towards the camera, the tangent of the elevation, and how far the camera is along it. */
export interface View {
  x: number;
  z: number;
  rise: number;
  along: number;
}

/** The view of a camera at `cam` looking along `dir` (a unit vector), onto an office centred at `centre`. */
export function viewOf(cam: { x: number; z: number }, dir: { x: number; y: number; z: number }, centre: { x: number; z: number }): View | null {
  const flat = Math.hypot(dir.x, dir.z);
  if (flat < 1e-3) return null; // straight down: nothing stands in the way
  const x = -dir.x / flat;
  const z = -dir.z / flat;
  return { x, z, rise: -dir.y / flat, along: (cam.x - centre.x) * x + (cam.z - centre.z) * z };
}

/**
 * Whether a building stands in the way of the camera's view of the office, so it should fade: it is within `CITY.sector`
 * of the camera's side of the office, nearer than the camera, and taller than the line of sight over it. Low buildings (up to two floors)
 * against the office's walls stay; only the ones that would hide it go. `reach` is how far the office extends from its
 * centre towards the camera (m). It follows the camera's view direction, so it holds when the view is panned.
 */
export function blocksTheView(b: { x: number; z: number; h: number }, centre: { x: number; z: number }, view: View, reach = 14): boolean {
  const bdx = b.x - centre.x;
  const bdz = b.z - centre.z;
  const bl = Math.hypot(bdx, bdz);
  const along = bdx * view.x + bdz * view.z;
  if (bl < 1e-6 || along <= 0 || along > view.along) return false; // beside or behind the office, or behind the camera
  if (Math.acos(Math.min(1, along / bl)) >= CITY.sector) return false;
  const sight = Math.max(2 * CITY.floor + 2, (along - reach) * Math.max(0, view.rise) * 0.85);
  return b.h > sight;
}
