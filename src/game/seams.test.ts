import { describe, expect, it } from 'vitest';
import { MAX_FRAME, stillTime, wallTime } from './seams';

describe('dev.params', () => {
  it('dev.params: the wall clock gives a frame the time since the last one, at most a quarter second; still time gives none', () => {
    const time = wallTime();
    const t0 = performance.now() + 1000;
    time.since(t0);
    expect(time.since(t0 + 16)).toBeCloseTo(0.016, 5);
    expect(time.since(t0 + 16 + 5000)).toBe(MAX_FRAME); // the tab slept: no leap
    expect(time.since(t0)).toBe(0); // a timestamp from before the last frame never runs time backwards
    expect(time.since(t0 + 16 + 5000 + 16)).toBeCloseTo(0.016, 5); // nor does it make the next frame longer
    expect(stillTime.since(t0 + 60_000)).toBe(0);
  });
});
