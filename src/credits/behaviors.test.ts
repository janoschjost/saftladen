import { describe, expect, it } from 'vitest';
import { seeded } from '../game/rng';
import { DOG_AREA, KURT_TO_EDGE, Path, planTrip } from './behaviors';

describe('credits.page: who moves around', () => {
  it('credits.page: a path gives the position and heading along its waypoints', () => {
    const p = new Path([[0, 0], [0, 2], [2, 2]]);
    expect(p.length).toBe(4);
    expect(p.at(1)).toMatchObject({ x: 0, z: 1, yaw: 0 });
    const turned = p.at(3);
    expect(turned.x).toBeCloseTo(1);
    expect(turned.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('credits.page: Kurt walks from his chair to the right end of the desk, clear of his own desk legs', () => {
    expect(KURT_TO_EDGE.at(0)).toMatchObject({ x: 0, z: 0 });
    expect(KURT_TO_EDGE.at(KURT_TO_EDGE.length)).toMatchObject({ x: 6.5, z: 2.5 });
    expect(KURT_TO_EDGE.points.every(([x]) => x < 0.7 || x > 0.9)).toBe(true);
  });

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
