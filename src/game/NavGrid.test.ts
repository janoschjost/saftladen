import { describe, expect, it } from 'vitest';
import { NavGrid, type Vec2 } from './NavGrid';
import { setSeed } from './rng';

const at = (cx: number, cz: number): Vec2 => ({ x: cx + 0.5, z: cz + 0.5 });
const cells = (g: NavGrid, path: Vec2[]) => path.map((p) => g.toCell(p));

describe('move.astar', () => {
  it('finds a straight path on an open grid, start excluded, goal included', () => {
    const g = new NavGrid(10, 10);
    const path = g.findPath(at(0, 0), at(4, 0));
    expect(cells(g, path)).toEqual([1, 2, 3, 4].map((cx) => ({ cx, cz: 0 })));
  });

  it('walks around a wall and never through blocked cells', () => {
    const g = new NavGrid(10, 10);
    g.block(5, 0, 1, 9); // wall from z 0 to 8, gap at z 9
    const path = g.findPath(at(0, 0), at(9, 0));
    expect(path.length).toBeGreaterThan(0);
    for (const c of cells(g, path)) expect(g.walkable(c.cx, c.cz)).toBe(true);
    expect(cells(g, path)).toContainEqual({ cx: 5, cz: 9 });
  });

  it('never cuts a corner diagonally', () => {
    const g = new NavGrid(5, 5);
    g.block(1, 0); // the diagonal step (0,0) -> (1,1) would brush this cell
    const path = cells(g, g.findPath(at(0, 0), at(2, 2)));
    let prev = { cx: 0, cz: 0 };
    for (const c of path) {
      const dx = c.cx - prev.cx;
      const dz = c.cz - prev.cz;
      if (dx && dz) {
        expect(g.walkable(prev.cx + dx, prev.cz)).toBe(true);
        expect(g.walkable(prev.cx, prev.cz + dz)).toBe(true);
      }
      prev = c;
    }
    expect(path[0]).not.toEqual({ cx: 1, cz: 1 });
  });

  it('returns no path to a blocked or sealed-off goal', () => {
    const g = new NavGrid(6, 6);
    g.block(3, 3);
    expect(g.findPath(at(0, 0), at(3, 3))).toEqual([]);
    g.block(0, 5, 6, 1);
    g.clear();
    g.block(2, 0, 1, 6); // full wall: right side unreachable
    expect(g.findPath(at(0, 0), at(5, 5))).toEqual([]);
  });

  it('seals pockets that cannot be reached, so nobody spawns there', () => {
    const g = new NavGrid(6, 6);
    g.block(2, 0, 1, 6);
    const sealed = g.sealUnreachable(at(0, 0));
    expect(sealed).toBe(3 * 6);
    expect(g.walkable(4, 4)).toBe(false);
    expect(g.walkable(1, 1)).toBe(true);
  });

  it('picks the same random walkable cell for the same seed', () => {
    const g = new NavGrid(20, 20);
    g.block(0, 0, 20, 10);
    setSeed(5);
    const a = [g.randomWalkable(), g.randomWalkable(), g.randomWalkable()];
    setSeed(5);
    expect([g.randomWalkable(), g.randomWalkable(), g.randomWalkable()]).toEqual(a);
    for (const c of a) expect(g.walkable(c.cx, c.cz)).toBe(true);
  });

  it('soft cost (a lying pet) bends the route around it but keeps the cells walkable (#26)', () => {
    const g = new NavGrid(10, 3);
    g.markSoft(at(5, 0), 0.6, 25);
    expect(cells(g, g.findPath(at(0, 0), at(9, 0)))).not.toContainEqual({ cx: 5, cz: 0 });
    g.block(0, 1, 10, 2); // only row 0 left
    expect(cells(g, g.findPath(at(0, 0), at(9, 0)))).toContainEqual({ cx: 5, cz: 0 });
    g.clearSoft();
    expect(g.walkable(5, 0)).toBe(true);
  });
});
