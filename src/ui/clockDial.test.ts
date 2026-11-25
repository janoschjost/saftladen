import { describe, expect, it } from 'vitest';
import { stepHour, trackHour } from './clockDial';

describe('clock bar', () => {
  it('time.clock: midnight at the left end, noon in the middle, the right end wraps to midnight', () => {
    expect(trackHour(0)).toBe(0);
    expect(trackHour(0.25)).toBe(6);
    expect(trackHour(0.5)).toBe(12);
    expect(trackHour(0.75)).toBe(18);
    expect(trackHour(1)).toBe(0);
    expect(trackHour(-3)).toBe(0); // dragging past the ends stays on the ends
    expect(trackHour(4)).toBe(0);
  });

  it('time.jump: dragging snaps to 5 minutes', () => {
    expect(trackHour((10 + 7 / 60) / 24) * 60).toBeCloseTo(10 * 60 + 5, 6);
  });

  it('time.jump: arrow keys step 15 minutes and wrap around midnight', () => {
    expect(stepHour(10, 15)).toBe(10.25);
    expect(stepHour(10 + 7 / 60, 15)).toBe(10.25);
    expect(stepHour(23.75, 15)).toBe(0);
    expect(stepHour(0, -15)).toBe(23.75);
    expect(stepHour(0.5, -60)).toBe(23.5);
  });
});
