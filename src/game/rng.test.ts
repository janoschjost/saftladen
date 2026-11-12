import { describe, expect, it } from 'vitest';
import { fxRandom, getSeed, random, seeded, setSeed } from './rng';

const take = (r: () => number, n: number) => Array.from({ length: n }, r);

describe('rng', () => {
  it('same seed, same numbers', () => {
    setSeed(42);
    const a = take(random, 20);
    setSeed(42);
    expect(take(random, 20)).toEqual(a);
    expect(getSeed()).toBe(42);
  });

  it('different seeds, different numbers', () => {
    setSeed(1);
    const a = take(random, 5);
    setSeed(2);
    expect(take(random, 5)).not.toEqual(a);
  });

  it('numbers lie in [0, 1)', () => {
    setSeed(7);
    for (const x of take(random, 10_000)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('presentation draws never shift the simulation stream', () => {
    setSeed(3);
    const plain = take(random, 10);
    setSeed(3);
    const mixed = take(() => (fxRandom(), fxRandom(), random()), 10);
    expect(mixed).toEqual(plain);
  });

  it('private generators are independent of the game seed', () => {
    setSeed(1);
    const a = take(seeded(99), 5);
    setSeed(2);
    random();
    expect(take(seeded(99), 5)).toEqual(a);
  });
});
