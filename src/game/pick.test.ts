import { describe, expect, it } from 'vitest';
import { distToSegment, hitColumn, nearestHit, nearestOnScreen, type Column, type Ray3 } from './pick';

const norm = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
const ray = (o: [number, number, number], d: [number, number, number]): Ray3 => ({ origin: { x: o[0], y: o[1], z: o[2] }, direction: norm(...d) });
const person = (x: number, z: number): Column => ({ x, z, r: 0.4, y0: 0, y1: 1.9 });

describe('select.click', () => {
  it('hits a body column from the side, from above and at a slant', () => {
    // level, through the middle: enters at the near side
    expect(hitColumn(ray([-5, 1, 0], [1, 0, 0]), person(0, 0))).toBeCloseTo(4.6, 6);
    // straight down (plan view): enters at the top
    expect(hitColumn(ray([0.3, 10, 0], [0, -1, 0]), person(0, 0))).toBeCloseTo(8.1, 6);
    // orbit-like slant onto the shoulder
    expect(hitColumn(ray([0, 6, 6], [0, -0.75, -1]), person(0, 0.2))).not.toBeNull();
  });

  it('misses beside the column, above the head and behind the ray', () => {
    expect(hitColumn(ray([-5, 1, 0.45], [1, 0, 0]), person(0, 0))).toBeNull();
    expect(hitColumn(ray([0.5, 10, 0], [0, -1, 0]), person(0, 0))).toBeNull();
    expect(hitColumn(ray([-5, 2.5, 0], [1, 0, 0]), person(0, 0))).toBeNull();
    expect(hitColumn(ray([5, 1, 0], [1, 0, 0]), person(0, 0))).toBeNull();
  });

  it('takes the one nearest to the camera when several overlap', () => {
    const r = ray([-10, 1, 0], [1, 0, 0]);
    expect(nearestHit(r, [person(2, 0), person(-3, 0.1), person(0, 0)])).toBe(1);
    expect(nearestHit(r, [person(2, 3)])).toBe(-1);
  });

  it('falls back to the nearest body on screen, measured from its outline', () => {
    const bodies = [
      { feet: { x: 100, y: 200 }, head: { x: 100, y: 100 }, r: 10 },
      { feet: { x: 150, y: 200 }, head: { x: 150, y: 100 }, r: 10 },
    ];
    expect(nearestOnScreen({ x: 124, y: 150 }, bodies, 20)).toBe(0); // 14 px off its edge, 16 px off the other's
    expect(nearestOnScreen({ x: 128, y: 150 }, bodies, 20)).toBe(1);
    expect(nearestOnScreen({ x: 68, y: 150 }, bodies, 20)).toBe(-1); // 22 px off its edge
    expect(nearestOnScreen({ x: 75, y: 150 }, bodies, 20)).toBe(0);
    // above the head counts by the distance to the head
    expect(distToSegment({ x: 100, y: 85 }, bodies[0].feet, bodies[0].head)).toBeCloseTo(15, 6);
  });
});
