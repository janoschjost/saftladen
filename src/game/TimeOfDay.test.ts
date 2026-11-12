import { describe, expect, it } from 'vitest';
import { cycleOf, hourOf } from './TimeOfDay';

describe('cycleOf', () => {
  it('is the inverse of hourOf', () => {
    for (const hour of [0, 3, 5, 6, 8, 12, 17.5, 18, 21, 23.5, 24]) expect(hourOf(cycleOf(hour))).toBeCloseTo(hour, 6);
  });

  it('puts the working day on most of the slider', () => {
    expect(cycleOf(8)).toBeCloseTo(0.2);
    expect(cycleOf(18)).toBeCloseTo(0.74);
  });

  it('clamps outside 0..24', () => {
    expect(cycleOf(-3)).toBe(0);
    expect(cycleOf(30)).toBe(1);
  });
});
