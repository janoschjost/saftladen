import { describe, expect, it } from 'vitest';
import { blocksTheView, builtOn, CITY, cityLayout, groundAt, inFootprint, overlaps, roadsAt, viewOf, without } from './cityLayout';
import { roadStrip } from './cityBuildings';

const foot = { x0: 0, z0: 0, x1: 60, z1: 20 };
const centre = { x: 30, z: 10 };
const city = cityLayout(foot, centre);
const heightOf = (floors: number) => floors * CITY.floor + 2;

describe('view.city layout', () => {
  it('view.city: is the real neighbourhood, the same on every call', () => {
    expect(cityLayout(foot, centre)).toEqual(city);
    expect(city.length).toBeGreaterThan(100);
  });

  it('view.city: keeps the office footprint clear, and only that', () => {
    for (const b of city) expect(overlaps(b.p, foot)).toBe(false);
    // a wide L-shaped neighbour wrapping a corner of the footprint is cut, one standing beside it is kept
    expect(overlaps([-10, -10, 70, -10, 70, 30, 40, 30, 40, 10, -10, 10], foot)).toBe(true);
    expect(overlaps([0, 21, 60, 21, 60, 40, 0, 40], foot)).toBe(false);
    expect(overlaps([-30, 5, 90, 5, 90, 15, -30, 15], foot)).toBe(true);
  });

  it('view.city: a neighbour reaching into the office keeps what lies outside it', () => {
    // a bar across the footprint: a piece on each side, none inside
    const pieces = without([-30, 5, 90, 5, 90, 15, -30, 15], foot);
    expect(pieces).toHaveLength(2);
    for (const q of pieces) expect(overlaps(q, foot)).toBe(false);
    // a block against the south side loses nothing, a block fully inside is gone
    expect(without([10, 21, 50, 21, 50, 40, 10, 40], foot).length).toBeGreaterThan(0);
    expect(without([10, 5, 50, 5, 50, 15, 10, 15], foot)).toEqual([]);
  });

  it('view.city: the street is one storey below the office floor, level at the office and the hills rise further out', () => {
    expect(groundAt(foot, centre, 30, 10)).toBe(-CITY.storey);
    expect(groundAt(foot, centre, 0, 0)).toBe(-CITY.storey);
    const far = [-250, 250].flatMap((dx) => [-250, 250].map((dz) => groundAt(foot, centre, centre.x + dx, centre.z + dz)));
    expect(Math.max(...far) - Math.min(...far)).toBeGreaterThan(10);
  });
});

describe('view.city roads', () => {
  it('view.city: a point inside a footprint is built on, one beside it is not', () => {
    const l = [0, 0, 10, 0, 10, 4, 4, 4, 4, 10, 0, 10];
    expect(inFootprint(l, 2, 8)).toBe(true);
    expect(inFootprint(l, 8, 8)).toBe(false);
    expect(builtOn([l])(8, 2)).toBe(true);
    expect(builtOn([l])(20, 2)).toBe(false);
  });

  it('view.city: roads sit where the buildings are (same frame), and none runs through a footprint', () => {
    const built = builtOn(city.map((b) => b.p));
    for (const r of roadsAt(centre)) {
      const g = roadStrip(r.p, r.w, () => 0, built);
      const pos = g.getAttribute('position');
      const index = g.getIndex()!;
      for (let k = 0; k < index.count; k++) expect(built(pos.getX(index.getX(k)), pos.getZ(index.getX(k)))).toBe(false);
    }
  });

  it('view.city: a road stops at a building beside it and leaves out what lies under one', () => {
    const wall = builtOn([[-100, 1, 100, 1, 100, 50, -100, 50]]);
    const g = roadStrip([0, 0, 20, 0], 8, () => 0, wall);
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) expect(pos.getZ(i)).toBeLessThanOrEqual(1);
    expect(roadStrip([0, 10, 20, 10], 8, () => 0, wall).getIndex()!.count).toBe(0);
  });
});

describe('view.city view rule', () => {
  // a camera 80 m south of the office, looking north and down
  const cam = { x: 30, z: 90 };
  const view = viewOf(cam, { x: 0, y: -0.7, z: -0.7 }, centre)!;
  const tall = (x: number, z: number) => ({ x, z, h: heightOf(8) });

  it('view.city: a tall building between the camera and the office fades', () => {
    expect(blocksTheView(tall(30, 50), centre, view)).toBe(true);
  });

  it('view.city: low buildings against the office, buildings behind it, beside it and behind the camera stay', () => {
    expect(blocksTheView({ x: 30, z: 24, h: heightOf(1) }, centre, view)).toBe(false);
    expect(blocksTheView(tall(30, -40), centre, view)).toBe(false);
    expect(blocksTheView(tall(200, 50), centre, view)).toBe(false);
    expect(blocksTheView(tall(30, 150), centre, view)).toBe(false);
  });

  it('view.city: follows the camera when it turns', () => {
    const east = viewOf({ x: 110, z: 10 }, { x: -0.7, y: -0.7, z: 0 }, centre)!;
    expect(blocksTheView(tall(70, 10), centre, east)).toBe(true);
    expect(blocksTheView(tall(30, 50), centre, east)).toBe(false);
  });

  it('view.city: nothing blocks a view straight down', () => {
    expect(viewOf({ x: 30, z: 10 }, { x: 0, y: -1, z: 0 }, centre)).toBeNull();
  });
});
