import { describe, expect, it } from 'vitest';
import { cityColours, outerSpot, streetAt, WEATHER_HALF } from './cityWeather';
import { WORLD } from './World';

describe('weather.city', () => {
  it('weather.city: rain darkens the city and snow whitens it, dry is untouched', () => {
    const dry = cityColours(0, 0);
    const wet = cityColours(1, 0);
    const snow = cityColours(0, 1);
    for (const k of ['ground', 'road', 'fill'] as const) {
      expect(wet[k].r).toBeLessThan(dry[k].r);
      expect(snow[k].r).toBeGreaterThanOrEqual(dry[k].r);
    }
    expect(snow.ground.b).toBeGreaterThan(dry.ground.b);
    expect(cityColours(0, 0).ground.getHexString()).toBe('dcdcda');
    // snow wins over rain: a snowed-over city is white even while the ground is still wet
    expect(cityColours(1, 1).ground.getHexString()).toBe(snow.ground.getHexString());
    // out-of-range inputs are clamped
    expect(cityColours(5, -3).ground.getHexString()).toBe(wet.ground.getHexString());
  });

  it('weather.city: drops and flakes of the outer zone fall over the city, never over the office, and land on the street', () => {
    let n = 0;
    const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 500; i++) {
      const o = outerSpot(7, random);
      const inOffice = o.x > -7 && o.x < WORLD.width + 7 && o.z > -7 && o.z < WORLD.depth + 7;
      expect(inOffice).toBe(false);
      expect(Math.abs(o.x - WORLD.width / 2)).toBeLessThanOrEqual(WEATHER_HALF);
      expect(o.floor).toBe(streetAt(o.x, o.z));
    }
  });
});
