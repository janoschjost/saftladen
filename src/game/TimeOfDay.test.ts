import { describe, expect, it } from 'vitest';
import { cycleOf, hourOf, TimeOfDay } from './TimeOfDay';

/** Real seconds for one day at 1x (as in TimeOfDay). */
const CYCLE_SECONDS = 600;

describe('time of day', () => {
  it('time.cycle: cycleOf is the inverse of hourOf', () => {
    for (let h = 0; h < 24; h += 0.25) expect(hourOf(cycleOf(h))).toBeCloseTo(h, 9);
    expect(cycleOf(8)).toBeCloseTo(0.2);
    expect(cycleOf(18)).toBeCloseTo(0.74);
    expect(cycleOf(-3)).toBe(0); // clamps outside 0..24
    expect(cycleOf(30)).toBe(1);
  });

  it('time.speed: the clock runs on the game time it is given, pause stops it', () => {
    const t = new TimeOfDay();
    t.setCycle(0.3);
    t.update(30);
    expect(t.cycle - 0.3).toBeCloseTo(30 / CYCLE_SECONDS, 9);
    const p = new TimeOfDay();
    p.auto = false;
    const c = p.cycle;
    p.update(100);
    expect(p.cycle).toBe(c);
  });

  it('time.cycle: a pinned clock (?time=) stands still until it is let go', () => {
    const t = new TimeOfDay();
    t.pinned = true;
    const c = t.cycle;
    t.update(100);
    expect(t.cycle).toBe(c);
    t.pinned = false;
    t.update(100);
    expect(t.cycle).toBeGreaterThan(c);
  });

  it('time.weekday: the weekday moves on at midnight, Sunday is followed by Monday', () => {
    const t = new TimeOfDay();
    expect(t.weekdayName).toBe('Mo');
    t.setCycle(0.99);
    t.update(CYCLE_SECONDS * 0.1); // 0.99 + 0.1
    expect(t.weekday).toBe(1);
    expect(t.cycle).toBeCloseTo(0.09, 9);
    t.weekday = 6;
    t.setCycle(0.999);
    t.update(CYCLE_SECONDS * 0.1);
    expect(t.weekdayName).toBe('Mo');
    // moving the clock by hand never changes the day
    t.jumpToHour(23.5);
    t.jumpToHour(0.5);
    t.jumpToHour(24); // 24:00 is midnight
    expect(t.weekday).toBe(0);
  });

  it('time.jump: a jump moves the clock, sets day / night at once and is counted', () => {
    const t = new TimeOfDay();
    expect(t.night).toBe(false);
    t.jumpToHour(23);
    expect(t.hour).toBeCloseTo(23, 9);
    expect(t.clock).toBe('23:00');
    expect(t.night).toBe(true); // no hysteresis lag after a jump
    expect([t.jumps, t.picks]).toEqual([1, 0]);
    t.pickWeekday(4);
    expect([t.weekday, t.weekdayName, t.jumps, t.picks]).toEqual([4, 'Fr', 2, 1]);
    t.pickWeekday(9);
    expect(t.weekday).toBe(2);
  });
});
