import { describe, expect, it } from 'vitest';
import { blendShot, easeInOut, lerpAngle, shotFrom, shotPosition, wrapAngle, type Shot } from './cameraFly';

const deg = (d: number) => (d * Math.PI) / 180;

describe('actions.camera', () => {
  it('blends angles the shorter way round', () => {
    // 170° -> -170°: through 180°, 20° in total
    expect(wrapAngle(lerpAngle(deg(170), deg(-170), 0.5))).toBeCloseTo(-Math.PI, 6);
    expect(lerpAngle(deg(170), deg(-170), 1) - deg(170)).toBeCloseTo(deg(20), 6);
    // -170° -> 170°: the other way, also 20°
    expect(lerpAngle(deg(-170), deg(170), 1) - deg(-170)).toBeCloseTo(deg(-20), 6);
    // short arcs are untouched
    expect(lerpAngle(deg(10), deg(50), 0.5)).toBeCloseTo(deg(30), 6);
    // more than a full turn apart: still the short way
    expect(lerpAngle(0, deg(370), 1)).toBeCloseTo(deg(10), 6);
  });

  it('wraps into [-PI, PI)', () => {
    for (const a of [0, 1, -1, 3.5, -3.5, 10, -10, Math.PI]) {
      const w = wrapAngle(a);
      expect(w).toBeGreaterThanOrEqual(-Math.PI);
      expect(w).toBeLessThan(Math.PI);
      expect(Math.cos(w)).toBeCloseTo(Math.cos(a), 9);
      expect(Math.sin(w)).toBeCloseTo(Math.sin(a), 9);
    }
  });

  it('eases in and out, clamped to 0..1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(-1)).toBe(0);
    expect(easeInOut(2)).toBe(1);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });

  it('blends shots: ends match, azimuth takes the short way, distance in log space', () => {
    const a: Shot = { x: 0, y: 0, z: 0, azimuth: deg(170), polar: 0.5, dist: 32 };
    const b: Shot = { x: 10, y: 1, z: 4, azimuth: deg(-170), polar: 0.7, dist: 8 };
    expect(blendShot(a, b, 0)).toEqual(a);
    const end = blendShot(a, b, 1);
    expect(end.x).toBeCloseTo(10);
    expect(wrapAngle(end.azimuth)).toBeCloseTo(deg(-170), 6);
    expect(end.dist).toBeCloseTo(8, 6);
    const mid = blendShot(a, b, 0.5);
    expect(Math.abs(wrapAngle(mid.azimuth))).toBeCloseTo(Math.PI, 6);
    expect(mid.dist).toBeCloseTo(16, 6); // geometric mean of 32 and 8
  });

  it('turns a shot into a camera position and back', () => {
    const s: Shot = { x: 21, y: 0, z: 9, azimuth: deg(-10), polar: 0.79, dist: 32 };
    const p = shotPosition(s);
    expect(Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z)).toBeCloseTo(32, 6);
    const back = shotFrom(p, { x: s.x, y: s.y, z: s.z });
    expect(back.azimuth).toBeCloseTo(s.azimuth, 6);
    expect(back.polar).toBeCloseTo(s.polar, 6);
    expect(back.dist).toBeCloseTo(s.dist, 6);
    // azimuth 0 stands on the +z side
    const front = shotPosition({ ...s, azimuth: 0 });
    expect(front.z).toBeGreaterThan(s.z);
    expect(front.x).toBeCloseTo(s.x, 6);
  });
});
