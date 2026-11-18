import { describe, expect, it } from 'vitest';
import type { BuildMark } from './BlueprintOffice';
import { Clawd, latestMark, perimeterAt, perimeterLength, perimeterNearest, type Rect } from './clawd';

const R: Rect = { x0: -2, z0: 2, x1: 2, z1: 4 };
const marks: BuildMark[] = [
  { order: 0.02, x: 0, z: 3 },
  { order: 0.3, x: 1.9, z: 3 },
  { order: 0.7, x: -1.8, z: 3.9 },
];

describe('credits.clawd: Clawd walks the pad edge to where the blueprint grows', () => {
  it('credits.clawd: the loop runs front left, right, back, left and ends where it began', () => {
    expect(perimeterLength(R)).toBe(12);
    expect(perimeterAt(R, 0)).toMatchObject({ x: -2, z: 4 });
    expect(perimeterAt(R, 4)).toMatchObject({ x: 2, z: 4 });
    expect(perimeterAt(R, 6)).toMatchObject({ x: 2, z: 2 });
    expect(perimeterAt(R, 10)).toMatchObject({ x: -2, z: 2 });
    expect(perimeterAt(R, 12)).toMatchObject({ x: -2, z: 4 });
    expect(perimeterAt(R, -1)).toMatchObject({ x: -2, z: 3 });
  });

  it('credits.clawd: the closest point of the loop to a piece inside the pad', () => {
    expect(perimeterAt(R, perimeterNearest(R, 0, 3.9))).toMatchObject({ x: 0, z: 4 });
    expect(perimeterAt(R, perimeterNearest(R, 1.9, 3))).toMatchObject({ x: 2, z: 3 });
    expect(perimeterAt(R, perimeterNearest(R, 0.5, 2.1))).toMatchObject({ x: 0.5, z: 2 });
    expect(perimeterAt(R, perimeterNearest(R, -1.9, 3))).toMatchObject({ x: -2, z: 3 });
  });

  it('credits.clawd: he heads for the piece that appeared last', () => {
    expect(latestMark(marks, 0)).toBeUndefined();
    expect(latestMark(marks, 0.3)).toBe(marks[1]);
    expect(latestMark(marks, 0.5)).toBe(marks[1]);
    expect(latestMark(marks, 1.05)).toBe(marks[2]);
  });

  it('credits.clawd: he walks to the newest piece, then builds', () => {
    const c = new Clawd(R);
    for (let i = 0; i < 120; i++) c.step(1 / 30, 'build', 0.31, marks);
    expect(c.mode).toBe('build');
    expect(perimeterAt(R, c.s)).toMatchObject({ x: 2, z: 3 });
    for (let i = 0; i < 300; i++) c.step(1 / 30, 'build', 0.9, marks);
    expect(perimeterAt(R, c.s).x).toBeCloseTo(-1.8);
  });

  it('credits.clawd: he walks at 1.5 m/s and takes the short way round the loop', () => {
    const c = new Clawd(R);
    c.s = 11;
    c.step(0.2, 'rest', 0, marks); // his corner is at 0 = 12: forwards across the start, not back round
    expect(c.mode).toBe('walk');
    expect(c.s).toBeCloseTo(11.3);
    c.s = 5;
    c.step(0.2, 'rest', 0, marks);
    expect(c.s).toBeCloseTo(4.7); // 5 is closer to 0 going back
  });

  it('credits.clawd: he cheers when the build is done, then waits, and goes back to his corner while it melts', () => {
    const c = new Clawd(R);
    c.s = 5;
    c.step(1 / 30, 'hold', 1.05, marks);
    expect(c.mode).toBe('cheer');
    expect(c.s).toBeCloseTo(5); // he does not walk off to celebrate
    for (let i = 0; i < 90; i++) c.step(1 / 30, 'hold', 1.05, marks);
    expect(c.mode).toBe('wait');
    for (let i = 0; i < 20; i++) c.step(1 / 30, 'melt', 0.5, marks);
    expect(c.mode).toBe('walk');
    for (let i = 0; i < 300; i++) c.step(1 / 30, 'rest', 0, marks);
    expect(c.s).toBeCloseTo(0);
    expect(c.mode).toBe('wait');
  });

  it('credits.clawd: a poke spins him for a moment', () => {
    const c = new Clawd(R);
    c.poke();
    expect(c.spin).toBeGreaterThan(0);
    expect(c.pokes).toBe(1);
    for (let i = 0; i < 60; i++) c.step(1 / 30, 'pad', 0, marks);
    expect(c.spin).toBe(0);
  });
});
