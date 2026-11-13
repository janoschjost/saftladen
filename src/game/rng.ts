/**
 * The game's one source of randomness. Never call `Math.random()` elsewhere.
 *
 * - `random()` drives the simulation (who goes where, plans, talks, ...). `setSeed(n)` restarts it, so tests are
 *   deterministic and a run can be replayed in dev with `?seed=<n>` (see `debugParams.ts`).
 * - `fxRandom()` is for presentation that runs once per rendered frame (particles, webcam feeds, menu idles). Its call
 *   count depends on the frame rate, so it gets its own stream and never shifts the simulation's numbers.
 * - `seeded(n)` makes a private generator for things that must look the same every time (screens, tattoos, rooms).
 * - `stream(salt)` is a side stream of the game's seed for a rare roll that must not shift `random()` (Kurt's spells):
 *   same seed, same rolls, and the simulation plays out as if it did not exist.
 * - `apart(fn)` runs `fn` on a stream of its own: whatever it rolls, `random()` goes on afterwards as if nothing
 *   happened (setting a scene, see `Scenario.ts`).
 */
export type Rng = () => number;

/** mulberry32: small, fast, good enough for a game. Returns numbers in [0, 1). */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sim: Rng;
let fx: Rng;
let current = 0;
const side = new Map<number, Rng>();

/** Restarts both streams from `n`. Call before the game (or a test) creates anything that rolls dice. */
export function setSeed(n: number): void {
  current = n >>> 0;
  sim = seeded(current);
  fx = seeded(current ^ 0x9e3779b9);
  side.clear();
}

/** Side stream `salt` of the game's seed (restarts with `setSeed`). */
export function stream(salt: number): Rng {
  return () => {
    let r = side.get(salt);
    if (!r) side.set(salt, (r = seeded(current ^ salt)));
    return r();
  };
}

/** The seed of the running game (log it to replay a run). */
export function getSeed(): number {
  return current;
}

export const random: Rng = () => sim();

const APART = 0x5ce9e;

/** Runs `fn` with `random()` on a side stream of the seed: it may roll dice without shifting the simulation's numbers. */
export function apart<T>(fn: () => T): T {
  const keep = sim;
  sim = stream(APART);
  try {
    return fn();
  } finally {
    sim = keep;
  }
}
export const fxRandom: Rng = () => fx();

setSeed(Math.random() * 2 ** 32); // the only Math.random in the game: a fresh seed per page load
