import { describe, expect, it } from "vitest";
import {
  DESK_FIXTURES,
  PROP_RADIUS,
  planClutter,
  type DeskPlantSpot,
} from "./deskClutter";
import { seeded } from "../game/rng";

const WIDTHS = [1.2, 1.4, 1.6, 1.8];
const plantFor = (i: number): DeskPlantSpot | null =>
  i % 5 === 0 ? null : { x: i % 2 ? 0.5 : -0.5, z: -0.27, r: 0.11 };

describe("office.desk-props", () => {
  it("every desk gets 2-4 props, deterministic per seed", () => {
    for (let i = 0; i < 200; i++) {
      const w = WIDTHS[i % WIDTHS.length];
      const a = planClutter(seeded(7919 * (i + 1)), w, plantFor(i));
      const b = planClutter(seeded(7919 * (i + 1)), w, plantFor(i));
      expect(a.length).toBeGreaterThanOrEqual(2);
      expect(a.length).toBeLessThanOrEqual(4);
      expect(a).toEqual(b);
    }
  });

  it("desks differ from each other", () => {
    const looks = new Set<string>();
    for (let i = 0; i < 30; i++)
      looks.add(JSON.stringify(planClutter(seeded(7919 * (i + 1)), 1.6, null)));
    expect(looks.size).toBeGreaterThan(25);
  });

  it("props stay on the desk and clear of keyboard, mouse, monitor, mug, plant and each other", () => {
    for (let i = 0; i < 300; i++) {
      const w = WIDTHS[i % WIDTHS.length];
      const plant = plantFor(i);
      const props = planClutter(seeded(7919 * (i + 1)), w, plant);
      for (const [k, p] of props.entries()) {
        const r = PROP_RADIUS[p.kind];
        expect(Math.abs(p.x) + r).toBeLessThanOrEqual(w / 2);
        expect(Math.abs(p.z) + r).toBeLessThanOrEqual(0.4);
        for (const f of DESK_FIXTURES) {
          const dx = Math.max(f.x0 - p.x, 0, p.x - f.x1);
          const dz = Math.max(f.z0 - p.z, 0, p.z - f.z1);
          expect(Math.hypot(dx, dz)).toBeGreaterThanOrEqual(r);
        }
        if (plant)
          expect(
            Math.hypot(p.x - plant.x, p.z - plant.z),
          ).toBeGreaterThanOrEqual(r + plant.r);
        for (const q of props.slice(k + 1))
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(
            r + PROP_RADIUS[q.kind],
          );
      }
    }
  });
});
