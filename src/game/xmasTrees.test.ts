import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { TREES } from './xmasTrees';

installHeadlessDom();

const walkable = (sim: ReturnType<typeof office>, x: number, z: number) => {
  const c = sim.nav.toCell({ x, z });
  return sim.nav.walkable(c.cx, c.cz);
};

describe('xmas.decor', () => {
  it('xmas.decor: every tree blocks the walk grid while Christmas mode is on, and the cells are free again when it is off (#288)', () => {
    const sim = office();
    for (const t of TREES) expect(walkable(sim, t.x, t.z)).toBe(true);
    sim.setXmas(true);
    for (const t of TREES) expect(walkable(sim, t.x, t.z)).toBe(false);
    sim.setXmas(false);
    for (const t of TREES) expect(walkable(sim, t.x, t.z)).toBe(true);
  });

  it('xmas.decor: paths go around a tree, the doors and the places stay reachable (#288)', () => {
    const sim = office();
    // nothing but the cells under the trees changes: no pocket of floor is cut off by them
    const grid = () => {
      const open: string[] = [];
      for (let cz = 0; cz < sim.nav.rows; cz++) for (let cx = 0; cx < sim.nav.cols; cx++) if (sim.nav.walkable(cx, cz)) open.push(`${cx},${cz}`);
      return open;
    };
    const before = grid();
    sim.setXmas(true);
    const after = grid();
    const lost = before.filter((c) => !after.includes(c));
    expect(after.every((c) => before.includes(c))).toBe(true);
    expect(lost.length).toBeGreaterThan(0);
    for (const c of lost) {
      const [cx, cz] = c.split(',').map(Number) as [number, number];
      const m = sim.nav.center(cx, cz);
      expect(TREES.some((t) => Math.abs(m.x - t.x) < t.s && Math.abs(m.z - t.z) < t.s)).toBe(true);
    }
    // along each tree: by the wall, and across the lane the second one stands in
    for (const [from, to] of [
      [{ x: 6.25, z: 11.75 }, { x: 6.25, z: 13.75 }],
      [{ x: 36.4, z: 11.6 }, { x: 38.8, z: 11.6 }],
    ] as const) {
      const path = sim.nav.findPath(from, to);
      expect(path.length).toBeGreaterThan(0);
      for (const p of path) expect(walkable(sim, p.x, p.z)).toBe(true);
      expect(path.some((p) => TREES.some((t) => Math.abs(p.x - t.x) < 0.45 * t.s && Math.abs(p.z - t.z) < 0.45 * t.s))).toBe(false);
    }
  });

  it('xmas.mode: somebody standing where a tree appears is moved to free floor and keeps walking (#288)', () => {
    const sim = office();
    const t = TREES[0]!;
    sim.scenario.put('donata-manser', { x: t.x, z: t.z }, 'free');
    sim.setXmas(true);
    const p = sim.person('donata-manser');
    expect(walkable(sim, p.pos.x, p.pos.z)).toBe(true);
    const inTree = () => TREES.some((t) => Math.abs(p.pos.x - t.x) < 0.45 * t.s && Math.abs(p.pos.z - t.z) < 0.45 * t.s);
    expect(inTree()).toBe(false);
    run(sim, 30, () => false, () => expect(inTree()).toBe(false));
  });
});
