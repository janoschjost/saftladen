import { describe, expect, it } from 'vitest';
import { LOADER_MIN_MS, loaderWaitMs } from './loaderRules';

describe('ui.loader', () => {
  it('ui.loader: loaded early, it stays until the 2 s are over; loaded late, it goes at once', () => {
    expect(LOADER_MIN_MS).toBe(2000);
    expect(loaderWaitMs(0, false)).toBe(2000);
    expect(loaderWaitMs(600, false)).toBe(1400);
    expect(loaderWaitMs(2000, false)).toBe(0);
    expect(loaderWaitMs(5300, false)).toBe(0);
  });

  it('ui.loader: ?test pages skip the minimum time', () => {
    expect(loaderWaitMs(0, true)).toBe(0);
    expect(loaderWaitMs(600, true)).toBe(0);
  });
});
