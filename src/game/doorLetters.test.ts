import { describe, expect, it } from 'vitest';
import { letterOffset, stepLetterSpring, type LetterSpring } from './doorLetters';

/** Runs the spring for `secs` towards `target`, recording the letter offsets of the first few letters. */
const run = (s: LetterSpring, target: number, secs: number) => {
  const seen: number[] = [];
  for (let t = 0; t < secs; t += 1 / 60) {
    stepLetterSpring(s, target, 1 / 60);
    seen.push(s.x);
  }
  return seen;
};

describe('door lettering', () => {
  it('office.door-lettering: letters move in sync with the door opening', () => {
    const s: LetterSpring = { x: 0, v: 0 };
    const xs = run(s, 1, 0.3);
    expect(xs[0]).toBeGreaterThan(0); // starts moving with the door right away
    for (let i = 0; i < 6; i++) {
      const o = letterOffset(i, s);
      expect(Math.abs(o.y) + Math.abs(o.x) + Math.abs(o.rot)).toBeGreaterThan(0.01);
    }
    // each letter moves its own way, not all alike
    const ys = new Set([0, 1, 2, 3].map((i) => letterOffset(i, s).y.toFixed(4)));
    expect(ys.size).toBeGreaterThan(1);
    // the spring overshoots a little (playful), then settles on the open door
    expect(Math.max(...run({ x: 0, v: 0 }, 1, 2))).toBeGreaterThan(1);
    run(s, 1, 3);
    expect(s.x).toBeCloseTo(1, 3);
  });

  it('office.door-lettering: letters return to the original layout when closed', () => {
    const s: LetterSpring = { x: 0, v: 0 };
    run(s, 1, 1);
    run(s, 0, 4);
    expect(s).toEqual({ x: 0, v: 0 });
    for (let i = 0; i < 25; i++) {
      const o = letterOffset(i, s);
      expect(Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.rot)).toBe(0);
    }
  });

  it('office.door-lettering: offsets stay small enough to keep the letters on the leaf', () => {
    const s: LetterSpring = { x: 0, v: 0 };
    for (const x of run(s, 1, 2)) {
      for (let i = 0; i < 25; i++) {
        const o = letterOffset(i, { x, v: s.v });
        expect(Math.abs(o.x)).toBeLessThan(0.05);
        expect(o.y).toBeLessThanOrEqual(0.001);
        expect(o.y).toBeGreaterThan(-0.1);
      }
    }
  });
});
