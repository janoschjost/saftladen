import { describe, expect, it } from 'vitest';
import { Weather } from './Weather';

const run = (w: Weather, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) w.update(0.1);
};

describe('weather.puddles: the ground gets wet in the rain and dries afterwards', () => {
  it('weather.puddles: wet rises while it rains, is soaked after a long shower, and falls again when it stops', () => {
    const w = new Weather();
    w.mode = 'rain';
    expect(w.wet).toBe(0);
    run(w, 20);
    const part = w.wet;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    run(w, 60);
    expect(w.wet).toBe(1);
    w.mode = 'sun';
    run(w, 20);
    expect(w.wet).toBeLessThan(1);
    expect(w.wet).toBeGreaterThan(0.5); // dries slower than it soaks
    run(w, 60);
    expect(w.wet).toBe(0);
  });
});
