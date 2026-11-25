import { describe, expect, it } from 'vitest';
import { PORCH } from './officeModel';
import { PUDDLE_SPOTS } from './puddleFx';

describe('weather.puddles: spots', () => {
  it('weather.puddles: the puddles lie on the porch and spread along its whole width', () => {
    for (const s of PUDDLE_SPOTS) {
      expect(s.x - s.rx).toBeGreaterThan(PORCH.x);
      expect(s.x + s.rx).toBeLessThan(PORCH.x + PORCH.w);
      expect(s.z - s.rz).toBeGreaterThan(PORCH.z);
      expect(s.z + s.rz).toBeLessThan(PORCH.z + PORCH.d);
    }
    // every 8 m stretch of the porch has some, and the first to form are on the original (west) stretch
    for (let from = PORCH.x; from + 8 <= PORCH.x + PORCH.w; from += 8) expect(PUDDLE_SPOTS.filter((s) => s.x >= from && s.x < from + 8).length).toBeGreaterThan(4);
    expect(PUDDLE_SPOTS.find((s) => s.from === 0)!.x).toBeLessThan(PORCH.x + 8);
  });
});
