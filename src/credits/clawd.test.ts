import { describe, expect, it } from 'vitest';
import type { BuildMark } from './BlueprintOffice';
import { Clawd, latestMark, type Rim } from './clawd';

const RIM: Rim = { x0: -2, x1: 2, z: 2 };
const marks: BuildMark[] = [
  { order: 0.1, x: -1.5, z: 3 },
  { order: 0.5, x: 0, z: 3.5 },
  { order: 0.9, x: 1.8, z: 2.5 },
];
const run = (c: Clawd, seconds: number, phase: Parameters<Clawd['step']>[1], level: number) => {
  for (let i = 0; i < seconds * 30; i++) c.step(1 / 30, phase, level, marks);
};

describe('credits.clawd: Clawd walks the pad with the build and beams at what appears', () => {
  it('credits.clawd: the newest piece is the last one that has appeared at this build level', () => {
    expect(latestMark(marks, 0.05)).toBeUndefined();
    expect(latestMark(marks, 0.1)).toBe(marks[0]);
    expect(latestMark(marks, 0.6)).toBe(marks[1]);
    expect(latestMark(marks, 1.05)).toBe(marks[2]);
  });

  it('credits.clawd: he walks along the back of the pad to the newest piece, slowly, aims at it and looks at it', () => {
    const c = new Clawd(RIM);
    c.step(1, 'build', 0.6, marks);
    expect(c.mode).toBe('walk');
    expect(c.s).toBeCloseTo(1.1); // 1.1 m/s towards x = 0 (2 m along the rim)
    expect(c.place().yaw).toBeCloseTo(Math.PI / 2);
    run(c, 3, 'build', 0.6);
    expect(c.mode).toBe('build');
    expect(c.place().x).toBeCloseTo(0);
    expect(c.aim).toEqual({ x: 0, z: 3.5 });
    expect(c.place().yaw).toBeCloseTo(Math.atan2(0 - 0, 3.5 - 2));
  });

  it('credits.clawd: he keeps aiming while he still walks to a piece, and stays on the rim', () => {
    const c = new Clawd(RIM);
    c.step(1 / 30, 'build', 1.05, marks);
    expect(c.mode).toBe('walk');
    expect(c.aim).toEqual({ x: 1.8, z: 2.5 });
    run(c, 10, 'build', 1.05);
    expect(c.place().x).toBeCloseTo(1.8);
    expect(c.place().z).toBe(2);
  });

  it('credits.clawd: he cheers when the build is done, then waits, and hurries back to his corner while it melts', () => {
    const c = new Clawd(RIM);
    run(c, 10, 'build', 1.05);
    const at = c.s;
    c.step(1 / 30, 'hold', 1.05, marks);
    expect(c.mode).toBe('cheer');
    expect(c.aim).toBeNull();
    expect(c.s).toBeCloseTo(at); // he does not walk off to celebrate
    run(c, 3, 'hold', 1.05);
    expect(c.mode).toBe('wait');
    c.step(1 / 30, 'melt', 0.5, marks);
    expect(c.mode).toBe('walk');
    expect(c.dir).toBe(-1);
    run(c, 4, 'rest', 0);
    expect(c.s).toBeCloseTo(0);
    expect(c.mode).toBe('wait');
  });

  it('credits.clawd: a poke spins him for a moment', () => {
    const c = new Clawd(RIM);
    c.poke();
    expect(c.spin).toBeGreaterThan(0);
    expect(c.pokes).toBe(1);
    run(c, 2, 'pad', 0);
    expect(c.spin).toBe(0);
  });
});
