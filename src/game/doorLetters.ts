import { seeded } from './rng';

/**
 * Door lettering that plays along when the door swings: the letter pieces on a lettered leaf follow the door's open
 * amount through a soft, underdamped spring (they lag, overshoot a little and wobble), each with its own drop, shift
 * and tilt. Closed and settled, every offset is exactly zero: the lettering lines up with the wall again.
 */

/** Spring that follows the door's open amount (0 closed .. 1 open). */
export interface LetterSpring {
  x: number;
  v: number;
}

const STIFF = 70; // 1/s²
const DAMP = 7; // 1/s: underdamped, a couple of visible wobbles
const STEP = 1 / 120;

/** Advances the spring towards `target` by `dt` seconds (fixed sub-steps, so it is stable at any frame rate). */
export function stepLetterSpring(s: LetterSpring, target: number, dt: number): void {
  let left = Math.min(dt, 0.25);
  while (left > 1e-9) {
    const h = Math.min(STEP, left);
    s.v += (STIFF * (target - s.x) - DAMP * s.v) * h;
    s.x += s.v * h;
    left -= h;
  }
  // close enough to rest: snap, so the closed door shows the lettering exactly as laid out
  if (Math.abs(target - s.x) < 1e-4 && Math.abs(s.v) < 1e-3) {
    s.x = target;
    s.v = 0;
  }
}

export interface LetterOffset {
  /** along the leaf (m) */
  x: number;
  /** up (m), negative = drops */
  y: number;
  /** tilt around the leaf normal (rad) */
  rot: number;
}

const DROP = 0.07; // m at full swing
const SHIFT = 0.025; // m
const TILT = 0.28; // rad
const SWAY = 0.035; // rad per (1/s) of spring speed

/** Fixed per-letter character (same every run): how much it drops, which way it leans and slides. */
const traits = (i: number) => {
  const r = seeded(0x5af7 + i * 7919);
  return { drop: 0.45 + 0.55 * r(), shift: r() * 2 - 1, tilt: r() * 2 - 1 };
};

/** Offset of letter `i` for the spring state: zero when the spring rests at 0 (door closed). */
export function letterOffset(i: number, s: LetterSpring): LetterOffset {
  const t = traits(i);
  const side = i % 2 ? 1 : -1; // neighbours lean opposite ways: playful, not a uniform slide
  return {
    x: s.x * SHIFT * t.shift,
    y: -s.x * DROP * t.drop,
    rot: s.x * TILT * t.tilt * side + s.v * SWAY * side,
  };
}
