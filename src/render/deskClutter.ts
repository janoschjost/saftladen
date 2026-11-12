import type { Rng } from "../game/rng";

/** Small things lying on a desk. Planned as plain data (seeded per desk), built and merged in `officeModel.ts`. */
export type PropKind =
  | "paper"
  | "notebook"
  | "sticky"
  | "pen"
  | "frame"
  | "figurine"
  | "headphones"
  | "bottle"
  | "phone"
  | "charger"
  | "snack"
  | "wrapper"
  | "cup";

export interface DeskProp {
  kind: PropKind;
  /** desk-local position (x along the desk, z towards the chair) and turn around y */
  x: number;
  z: number;
  rot: number;
}

/** Four sets, every desk draws from different ones. */
export const PROP_SETS: PropKind[][] = [
  ["paper", "notebook", "sticky", "pen"],
  ["frame", "figurine", "headphones", "bottle"],
  ["phone", "charger"],
  ["snack", "wrapper", "cup"],
];

/** Footprint radius (m) of each prop, rotation included. */
export const PROP_RADIUS: Record<PropKind, number> = {
  paper: 0.11,
  notebook: 0.1,
  sticky: 0.045,
  pen: 0.08,
  frame: 0.07,
  figurine: 0.04,
  headphones: 0.09,
  bottle: 0.04,
  phone: 0.07,
  charger: 0.045,
  snack: 0.06,
  wrapper: 0.04,
  cup: 0.04,
};

export const DESK_DEPTH = 0.8;
const MARGIN = 0.04; // to the desk edge
const GAP = 0.015; // between things

export interface DeskRect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
/** What already stands on a desk (desk-local): monitor with its foot, keyboard, mouse, the sitter's mug. */
export const DESK_FIXTURES: DeskRect[] = [
  { x0: -0.31, x1: 0.31, z0: -0.4, z1: -0.04 },
  { x0: -0.16, x1: 0.16, z0: 0.05, z1: 0.19 },
  { x0: 0.23, x1: 0.31, z0: 0.05, z1: 0.19 },
  { x0: 0.39, x1: 0.55, z0: 0.15, z1: 0.29 },
];

/** The seeded cactus: a circle on the desk (desk-local). */
export interface DeskPlantSpot {
  x: number;
  z: number;
  r: number;
}

const circleHitsRect = (
  x: number,
  z: number,
  r: number,
  b: DeskRect,
): boolean => {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dz = Math.max(b.z0 - z, 0, z - b.z1);
  return dx * dx + dz * dz < r * r;
};

/** 2-4 props for a desk of width `w`: one from each of 2-4 different sets, placed where nothing else is. */
export function planClutter(
  rnd: Rng,
  w: number,
  plant: DeskPlantSpot | null,
): DeskProp[] {
  const count = 2 + Math.floor(rnd() * 3);
  const sets = PROP_SETS.map((s) => s).sort(() => rnd() - 0.5);
  const out: DeskProp[] = [];
  for (const set of sets) {
    if (out.length >= count) break;
    const kind = set[Math.floor(rnd() * set.length)];
    const r = PROP_RADIUS[kind];
    for (let t = 0; t < 40; t++) {
      const x = -w / 2 + MARGIN + r + rnd() * (w - 2 * (MARGIN + r));
      const z =
        -DESK_DEPTH / 2 + MARGIN + r + rnd() * (DESK_DEPTH - 2 * (MARGIN + r));
      const rot = (rnd() - 0.5) * 1.6;
      if (DESK_FIXTURES.some((b) => circleHitsRect(x, z, r + GAP, b))) continue;
      if (plant && Math.hypot(x - plant.x, z - plant.z) < r + plant.r + GAP)
        continue;
      if (
        out.some(
          (p) => Math.hypot(x - p.x, z - p.z) < r + PROP_RADIUS[p.kind] + GAP,
        )
      )
        continue;
      out.push({ kind, x, z, rot });
      break;
    }
  }
  return out;
}
