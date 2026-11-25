import { describe, expect, it } from 'vitest';
import { CYCLE_SECONDS, cycleOf, daylight, followedDaylight, hourOf, laptopGlow, lookOf, NIGHT_SECONDS, oppositeDaylight, roomLight, TimeOfDay } from './TimeOfDay';

describe('time of day', () => {
  it('time.cycle: cycleOf is the inverse of hourOf', () => {
    for (let h = 0; h < 24; h += 0.25) expect(hourOf(cycleOf(h))).toBeCloseTo(h, 9);
    expect(cycleOf(8) * CYCLE_SECONDS).toBeCloseTo(144, 6); // 66 s of night, 78 s of morning
    expect((cycleOf(18) - cycleOf(8)) * CYCLE_SECONDS).toBeCloseTo(324, 6); // the working day takes what it always took
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

  it('time.cycle: the night (21:00 to 05:00) takes NIGHT_SECONDS of the cycle at 1x, and the game starts at 10:00', () => {
    expect((cycleOf(24) - cycleOf(21) + cycleOf(5)) * CYCLE_SECONDS).toBeCloseTo(NIGHT_SECONDS, 6);
    expect(NIGHT_SECONDS).toBe(132);
    expect(CYCLE_SECONDS).toBe(132 + 78 + 324 + 114); // the day parts are the old ones: only the night grew
    expect(hourOf(new TimeOfDay().cycle)).toBeCloseTo(10, 6);
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

  it('home.beach: the beach room has the light of the clock 12 hours on, dark at 12:00, bright at 00:00, smooth in between', () => {
    expect(oppositeDaylight(12)).toBe(0);
    expect(oppositeDaylight(0)).toBe(1);
    expect(oppositeDaylight(23)).toBe(1);
    for (let h = 0; h < 24; h += 0.5) expect(oppositeDaylight(h)).toBeCloseTo(daylight((h + 12) % 24), 12);
    for (let h = 0; h < 24; h += 0.05) expect(Math.abs(oppositeDaylight(h + 0.05) - oppositeDaylight(h))).toBeLessThan(0.1); // no jumps
    expect(oppositeDaylight(17)).toBeLessThan(0.5); // dusk there while it is dawn here
    expect(oppositeDaylight(7)).toBeGreaterThan(0.5);
    const t = new TimeOfDay();
    t.jumpToHour(3);
    expect(t.day).toBe(daylight(3));
  });

  it('home.rooms: a room follows the office light, the flipped light or none, and has three looks over the day', () => {
    for (let h = 0; h < 24; h += 0.5) {
      expect(followedDaylight('office', h)).toBe(daylight(h));
      expect(followedDaylight('opposite', h)).toBe(oppositeDaylight(h));
    }
    const noon = roomLight('office', 12);
    const night = roomLight('office', 0);
    const sunset = roomLight('office', 19.6);
    expect(noon).toMatchObject({ night: 0, dusk: 0, bright: 1 });
    expect(night).toMatchObject({ night: 1, dusk: 0, bright: 0 });
    expect(sunset.dusk).toBeGreaterThan(0.9); // the orange look at the low sun
    expect(roomLight('office', 6.4).dusk).toBeGreaterThan(0.6);
    expect(roomLight('opposite', 0).bright).toBe(1);
    for (let h = 0; h < 24; h += 0.05) {
      const l = roomLight('office', h);
      expect(l.night + l.dusk + l.bright).toBeCloseTo(1, 12);
      expect(Math.min(l.night, l.dusk, l.bright)).toBeGreaterThanOrEqual(0);
      const next = roomLight('office', h + 0.05);
      expect(Math.abs(next.night - l.night) + Math.abs(next.dusk - l.dusk) + Math.abs(next.bright - l.bright)).toBeLessThan(0.25); // no jumps
    }
    expect(lookOf(0.5).dusk).toBeLessThan(1);
  });

  it('home.beach: the laptop glow is full in the dark, fades through dusk and dawn and is out in daylight', () => {
    const at = (hour: number) => laptopGlow(roomLight('opposite', hour).day);
    expect(at(12)).toBe(1); // Swiss noon: dark at the beach
    expect(at(0)).toBe(0); // Swiss midnight: bright at the beach
    expect(at(18.5)).toBeGreaterThan(0); // the beach's dusk
    expect(at(18.5)).toBeLessThan(1);
    expect(at(7)).toBeGreaterThan(0); // its dawn
    expect(at(7)).toBeLessThan(1);
    let last = at(0);
    for (let h = 0.05; h <= 24; h += 0.05) {
      expect(Math.abs(at(h) - last)).toBeLessThan(0.1); // smooth
      last = at(h);
    }
  });
});
