import { describe, expect, it } from 'vitest';
import { dialAngle, dialHour, dialSlice, stepHour } from './clockDial';

describe('clock dial', () => {
  it('time.clock: midnight at the top, 06:00 right, noon at the bottom, 18:00 left', () => {
    expect(dialHour(0, -10)).toBe(0);
    expect(dialHour(10, 0)).toBe(6);
    expect(dialHour(0, 10)).toBe(12);
    expect(dialHour(-10, 0)).toBe(18);
    expect(dialHour(-0.01, -10)).toBe(0); // just left of the top snaps back to midnight, not 24
    for (const h of [0, 3.25, 11, 17.5, 22.75]) {
      const a = (dialAngle(h) * Math.PI) / 180;
      expect(dialHour(Math.sin(a) * 20, -Math.cos(a) * 20)).toBeCloseTo(h, 9);
    }
  });

  it('time.jump: dragging snaps to 5 minutes', () => {
    const a = ((10 + 7 / 60) / 24) * 2 * Math.PI; // 10:07
    expect(dialHour(Math.sin(a), -Math.cos(a)) * 60).toBeCloseTo(10 * 60 + 5, 6);
  });

  it('time.jump: arrow keys step 15 minutes and wrap around midnight', () => {
    expect(stepHour(10, 15)).toBe(10.25);
    expect(stepHour(10 + 7 / 60, 15)).toBe(10.25);
    expect(stepHour(23.75, 15)).toBe(0);
    expect(stepHour(0, -15)).toBe(23.75);
    expect(stepHour(0.5, -60)).toBe(23.5);
  });

  it('time.clock: the night slice spans 21:00 to 05:00 clockwise over the top', () => {
    expect(dialSlice(21, 5, 48)).toMatch(/A48 48 0 0 1 /);
    expect(dialSlice(5, 21, 48)).toMatch(/A48 48 0 1 1 /);
  });
});
