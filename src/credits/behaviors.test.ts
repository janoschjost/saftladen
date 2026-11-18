import { describe, expect, it } from 'vitest';
import { seeded } from '../game/rng';
import { DOG_AREA, planTrip } from './behaviors';

describe('credits.page: who moves around', () => {
  it('credits.page: Ellie rests, strolls to open floor, plays or sniffs, and walks home', () => {
    for (let s = 1; s <= 20; s++) {
      const trip = planTrip([2.6, 0.7], seeded(s));
      expect(trip[0].kind).toBe('rest');
      expect(trip.at(-1)).toEqual({ kind: 'walk', to: [2.6, 0.7] });
      for (const step of trip.slice(1, -1)) {
        if (step.kind !== 'walk') continue;
        expect(step.to[0]).toBeGreaterThanOrEqual(DOG_AREA.x[0]);
        expect(step.to[0]).toBeLessThanOrEqual(DOG_AREA.x[1]);
        expect(step.to[1]).toBeGreaterThanOrEqual(DOG_AREA.z[0]);
      }
      expect(trip.some((st) => st.kind === 'play' || st.kind === 'sniff')).toBe(true);
    }
  });
});
