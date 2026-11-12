import { describe, expect, it } from 'vitest';
import { NavGrid } from './NavGrid';
import { walkFree, type WalkColliders } from './walkCollision';

const R = 0.3;

/**
 * 6 × 6 m floor on the 0.5 m nav grid, a wall along z = 3 (0.1 m thick) with a 0.9 m doorway at x = 2.0..2.9.
 * Like in the office, the doorway leaves just one free grid cell (x 2.0..2.5); the jamb cell x 2.5..3.0 is blocked.
 */
function room(): WalkColliders {
  const nav = new NavGrid(12, 12, 0.5);
  const boxes = [
    { min: { x: 0, z: 3 }, max: { x: 2.0, z: 3.1 } },
    { min: { x: 2.9, z: 3 }, max: { x: 6, z: 3.1 } },
  ];
  for (const b of boxes) nav.blockWorld(b.min.x, b.min.z, b.max.x, b.max.z);
  nav.block(0, 11, 12, 1); // a sealed strip at the far end, standing in for outside the building
  return { nav, boxes, doorways: [{ x: 2.45, z: 3.05, r: 0.45 }] };
}

/** Walks the body from (x, z0) to z1 in small steps, like the game does. */
function walkThrough(c: WalkColliders, x: number, z0: number, z1: number): boolean {
  for (let z = z0; z <= z1; z += 0.05) if (!walkFree(x, z, R, c)) return false;
  return true;
}

describe('view.walk', () => {
  it('lets the body through a doorway that is a single nav cell wide', () => {
    const c = room();
    expect(walkThrough(c, 2.45, 1, 5)).toBe(true);
  });

  it('keeps walls solid beside the doorway and keeps the body off the jambs', () => {
    const c = room();
    expect(walkThrough(c, 1, 1, 5)).toBe(false);
    expect(walkThrough(c, 4, 1, 5)).toBe(false);
    expect(walkFree(2.1, 3.05, R, c)).toBe(false); // 0.1 m from the left jamb
  });

  it('keeps the body off blocked floor (outside, sealed pockets)', () => {
    const c = room();
    expect(walkFree(3, 5.7, R, c)).toBe(false);
    expect(walkFree(3, 5.2, R, c)).toBe(true);
  });

  it('collides with moved furniture once the boxes are swapped', () => {
    const c = room();
    expect(walkFree(1, 1, R, c)).toBe(true);
    c.boxes = [...c.boxes, { min: { x: 0.8, z: 0.8 }, max: { x: 1.2, z: 1.2 } }];
    expect(walkFree(1, 1, R, c)).toBe(false);
    expect(walkFree(1.55, 1, R, c)).toBe(true);
  });
});
