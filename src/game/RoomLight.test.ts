import { describe, expect, it } from 'vitest';
import { fadeLevel, roomLampTarget } from './RoomLight';
import { TimeOfDay } from './TimeOfDay';

/** TimeOfDay set to a clock hour (the slider / `?time=` do the same search). */
function at(hour: number): TimeOfDay {
  const t = new TimeOfDay();
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    t.setCycle(mid);
    if (t.hour < hour) lo = mid;
    else hi = mid;
  }
  return t;
}

/** Runs the lamp for `seconds` at 60 fps. */
function run(level: number, occupants: number, tod: TimeOfDay, seconds: number): number {
  for (let i = 0; i < seconds * 60; i++) level = fadeLevel(level, roomLampTarget(occupants, tod.day), 1 / 60);
  return level;
}

describe('place.meeting-lamp', () => {
  it('is on when the room is occupied at night', () => {
    expect(roomLampTarget(3, at(22).day)).toBeCloseTo(1);
    expect(roomLampTarget(1, at(2).day)).toBeCloseTo(1);
  });

  it('is off when the room is empty, at night too', () => {
    expect(roomLampTarget(0, at(22).day)).toBe(0);
    expect(roomLampTarget(0, at(11).day)).toBe(0);
  });

  it('is off in daylight even with people in the room', () => {
    expect(roomLampTarget(5, at(11).day)).toBe(0);
  });

  it('is dimmer at dusk than at full night', () => {
    const dusk = roomLampTarget(2, at(19).day);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(roomLampTarget(2, at(22).day));
  });

  it('fades instead of popping', () => {
    const night = at(22);
    const step = run(0, 4, night, 1 / 60);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(0.1);
    expect(run(0, 4, night, 2)).toBeCloseTo(1);
  });

  it('follows time jumps of the clock', () => {
    const tod = at(11);
    let level = run(0, 4, tod, 2);
    expect(level).toBe(0);
    // slider jumps to the night: the lamp fades on
    const night = at(23);
    tod.setCycle(night.cycle);
    level = run(level, 4, tod, 2);
    expect(level).toBeCloseTo(1);
    // and back to the morning: it fades off
    tod.setCycle(at(10).cycle);
    expect(run(level, 4, tod, 2)).toBe(0);
  });

  it('goes off when the last person leaves at night', () => {
    const night = at(22);
    const level = run(0, 2, night, 2);
    expect(level).toBeCloseTo(1);
    expect(run(level, 0, night, 2)).toBe(0);
  });
});
