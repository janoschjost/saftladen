import { describe, expect, it } from 'vitest';
import { setSeed } from './rng';
import type { Season } from './Season';
import { Weather, flashAt, lightsOutAt } from './Weather';

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

describe('weather.snow: snow falls on its own and whitens the porch', () => {
  it('weather.snow: the snow chip snows without rain or puddles, the porch turns white and melts after it stops', () => {
    const w = new Weather();
    w.mode = 'snow';
    run(w, 20);
    expect(w.snowing).toBe(true);
    expect(w.raining).toBe(false);
    expect(w.foul).toBe(true);
    expect(w.snow).toBeGreaterThan(0.9);
    expect(w.rain).toBe(0);
    expect(w.wet).toBe(0);
    const part = w.cover;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    run(w, 60);
    expect(w.cover).toBe(1);
    w.mode = 'sun';
    run(w, 20);
    expect(w.snow).toBe(0);
    expect(w.cover).toBeLessThan(1);
    expect(w.cover).toBeGreaterThan(0.5); // melts slower than it whitens
    run(w, 80);
    expect(w.cover).toBe(0);
  });
});

describe('weather.storm: a thunderstorm is heavy rain with lightning and thunder', () => {
  it('weather.storm: it rains (puddles, umbrellas follow) and every flash is followed by one clap of thunder', () => {
    const w = new Weather();
    w.mode = 'storm';
    let claps = 0;
    for (let t = 0; t < 120; t += 0.05) {
      w.update(0.05);
      if (w.takeThunder()) claps++;
    }
    const flashes = w.strikes;
    expect(w.raining).toBe(true);
    expect(w.stormy).toBe(true);
    expect(w.storm).toBeGreaterThan(0.9);
    expect(w.wet).toBeGreaterThan(0);
    expect(flashes).toBeGreaterThanOrEqual(3); // a flash every 8-25 s after the first one within 8 s
    expect(flashes).toBeLessThanOrEqual(14);
    expect(Math.abs(claps - flashes)).toBeLessThanOrEqual(1); // the last clap may still be on its way
  });

  it('weather.storm: plain rain and snow never flash', () => {
    for (const mode of ['rain', 'snow'] as const) {
      const w = new Weather();
      w.mode = mode;
      let max = 0;
      for (let t = 0; t < 120; t += 0.05) {
        w.update(0.05);
        max = Math.max(max, w.flash);
        expect(w.takeThunder()).toBe(false);
      }
      expect(max).toBe(0);
      expect(w.strikes).toBe(0);
    }
  });

  it('weather.storm: a flash is sharp with a weaker echo; only a strong strike blinks the lights', () => {
    expect(flashAt(0)).toBe(1);
    expect(flashAt(0.2)).toBeLessThan(0.3);
    expect(flashAt(0.3)).toBeGreaterThan(flashAt(0.2)); // the echo
    expect(flashAt(1.5)).toBeLessThan(0.01);
    expect(lightsOutAt(0.2)).toBe(false);
    expect([0.46, 0.52, 0.6, 0.66, 0.8, 0.9].some(lightsOutAt)).toBe(true);
    expect(lightsOutAt(1.5)).toBe(false);
  });

  it('weather.storm: some strong strikes blink the lights, and not all of them', () => {
    const w = new Weather();
    w.mode = 'storm';
    let blinked = 0;
    let seenAt = 0;
    for (let t = 0; t < 3000; t += 0.05) {
      w.update(0.05);
      if (w.lightsOut && seenAt !== w.strikes) {
        blinked++;
        seenAt = w.strikes;
      }
    }
    const strikes = w.strikes;
    expect(blinked).toBeGreaterThan(0);
    expect(blinked).toBeLessThan(strikes);
  });
});

describe('weather.season: the season shapes what Auto weather does', () => {
  /** what falls during `hours` of Auto weather: seconds of rain, snow and storm */
  const spells = (season: Season | null, hours = 200) => {
    setSeed(7);
    const w = new Weather();
    w.season = season;
    const t = { rain: 0, snow: 0, storm: 0, dry: 0 };
    for (let s = 0; s < hours * 3600; s += 1) {
      w.update(1);
      if (w.snowing) t.snow++;
      else if (w.raining && w.stormy) t.storm++;
      else if (w.raining) t.rain++;
      else t.dry++;
    }
    return t;
  };

  it('weather.season: summer is mostly dry with some storms, never snow', () => {
    const summer = spells('summer');
    const autumn = spells('autumn');
    expect(summer.snow).toBe(0);
    expect(summer.storm).toBeGreaterThan(0);
    expect(summer.dry).toBeGreaterThan(autumn.dry);
  });

  it('weather.season: winter snows instead of raining, with no storms; autumn rains the most', () => {
    const winter = spells('winter');
    const autumn = spells('autumn');
    expect(winter.snow).toBeGreaterThan(winter.rain * 3);
    expect(winter.storm).toBe(0);
    expect(autumn.snow).toBe(0);
    expect(autumn.rain).toBeGreaterThan(spells('spring').rain);
  });

  it('weather.season: without a season, and with a forced chip, the season changes nothing', () => {
    const plain = spells(null);
    expect(plain.snow + plain.storm).toBe(0);
    const w = new Weather();
    w.season = 'winter';
    w.mode = 'rain';
    run(w, 5);
    expect(w.raining).toBe(true);
    expect(w.snowing).toBe(false);
  });
});
