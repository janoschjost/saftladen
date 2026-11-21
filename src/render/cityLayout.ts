import { seeded, type Rng } from '../game/rng';

/** An axis-aligned rectangle on the ground (game metres, x / z). */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** A kind of building: a facade style and a number of floors (the drawing is `cityBuildings.ts`). */
export interface Kind {
  style: 'ribbon' | 'slit' | 'saw';
  floors: number;
}

export interface Building {
  /** the footprint: centre and size (the buildings of the city touch, there are no streets) */
  x: number;
  z: number;
  w: number;
  d: number;
  /** index into `KINDS` */
  kind: number;
  /** a wall tone (index into the palette of the drawing) */
  tone: number;
}

export const CITY = {
  /** how far the city reaches beyond the footprint: sideways, to the north, and to the south past the entrance */
  reach: { side: 240, north: 200, south: 240 },
  /** open ground kept at the office's two window ends (west and east), so the windows have light and a view (m) */
  windowGap: 4,
  /** a cell of the city: no smaller, and larger ones are split */
  min: 12,
  max: 30,
  /** the same city on every load */
  seed: 0x0c17,
  /** one floor (m); the office's roof is 3.8 to 5.5 m */
  floor: 3.2,
  /** the floors by distance from the office: one floor up to this far, then another floor per `step` metres */
  near: 20,
  step: 24,
  /** the camera's sector (radians, each side) in which tall buildings are hidden */
  sector: (62 * Math.PI) / 180,
};

/** The kinds of building. Index = what `Building.kind` says. */
/** The numbers of floors a building comes with: up to the skyscrapers far out. */
export const FLOORS = [1, 2, 3, 4, 6, 8, 12, 18, 26] as const;

export const KINDS: readonly Kind[] = [
  ...FLOORS.map((floors): Kind => ({ style: 'ribbon', floors })),
  ...FLOORS.map((floors): Kind => ({ style: 'slit', floors })),
  { style: 'saw', floors: 1 },
];

/** How high a building of this kind stands (walls, roof slab and plant room). */
export const heightOf = (k: Kind): number => k.floors * CITY.floor + 2;

/** The distance of a point from a rectangle (0 inside it). */
function distance(r: Rect, x: number, z: number): number {
  return Math.hypot(Math.max(r.x0 - x, x - r.x1, 0), Math.max(r.z0 - z, z - r.z1, 0));
}

/** Splits a region into cells that touch (no streets): halves along the longer side until every cell is small enough. */
function subdivide(r: Rect, rnd: Rng, out: Rect[]): void {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  if (w <= 0 || d <= 0) return;
  const tooBig = w > CITY.max || d > CITY.max;
  if (!tooBig && (w < 2 * CITY.min || d < 2 * CITY.min || rnd() < 0.55)) return void out.push(r);
  const alongX = w >= d;
  const len = alongX ? w : d;
  if (len < 2 * CITY.min) return void out.push(r);
  const at = (alongX ? r.x0 : r.z0) + CITY.min + rnd() * (len - 2 * CITY.min);
  if (alongX) {
    subdivide({ ...r, x1: at }, rnd, out);
    subdivide({ ...r, x0: at }, rnd, out);
  } else {
    subdivide({ ...r, z1: at }, rnd, out);
    subdivide({ ...r, z0: at }, rnd, out);
  }
}

/** The floors of a building by its distance from the office: low against its walls, higher further out, now and then a skyscraper. */
function floorsAt(dist: number, rnd: Rng): number {
  if (dist < CITY.near) return rnd() < 0.3 ? 2 : 1;
  if (dist > 60 && rnd() < 0.14 + dist / 1500) return FLOORS[6 + Math.floor(rnd() * 3)]; // 12, 18 or 26
  const want = 2 + (dist - CITY.near) / CITY.step + (rnd() - 0.5) * 4;
  let best: number = FLOORS[0];
  for (const f of FLOORS) if (f <= Math.max(2, Math.min(8, want))) best = f;
  return best;
}

/**
 * The city around `foot`: one continuous mass of buildings that touch each other and the office's walls, low next to
 * the office and rising outwards. Only the entrance lane in front of the porch (`lane`: its x range) stays open.
 * Deterministic.
 */
export function cityLayout(foot: Rect, lane: { x0: number; x1: number }): Building[] {
  const rnd = seeded(CITY.seed);
  const R: Rect = { x0: foot.x0 - CITY.reach.side, x1: foot.x1 + CITY.reach.side, z0: foot.z0 - CITY.reach.north, z1: foot.z1 + CITY.reach.south };
  // the ground around the footprint in regions that meet it flush: north, west, east, and the south on both sides of the lane
  const regions: Rect[] = [
    { x0: R.x0, z0: R.z0, x1: R.x1, z1: foot.z0 },
    { x0: R.x0, z0: foot.z0, x1: foot.x0 - CITY.windowGap, z1: foot.z1 },
    { x0: foot.x1 + CITY.windowGap, z0: foot.z0, x1: R.x1, z1: foot.z1 },
    { x0: R.x0, z0: foot.z1, x1: lane.x0, z1: R.z1 },
    { x0: lane.x1, z0: foot.z1, x1: R.x1, z1: R.z1 },
  ];
  const cells: Rect[] = [];
  for (const r of regions) subdivide(r, rnd, cells);
  const out: Building[] = [];
  for (const c of cells) {
    const x = (c.x0 + c.x1) / 2;
    const z = (c.z0 + c.z1) / 2;
    const dist = distance(foot, x, z);
    // a low saw-tooth hall now and then close to the office, the way the office has one
    const hall = dist < 70 && rnd() < 0.18;
    const floors = hall ? 1 : floorsAt(dist, rnd);
    const style: Kind['style'] = hall ? 'saw' : rnd() < 0.65 ? 'ribbon' : 'slit';
    const kind = KINDS.findIndex((k) => k.style === style && k.floors === floors);
    out.push({ x, z, w: c.x1 - c.x0, d: c.z1 - c.z0, kind, tone: Math.floor(rnd() * 6) });
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
 * of the camera's side of the office, nearer than the camera, and taller than the line of sight over it. Low buildings
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
  const sight = Math.max(CITY.floor, (along - reach) * Math.max(0, view.rise) * 0.85);
  return b.h > sight;
}
