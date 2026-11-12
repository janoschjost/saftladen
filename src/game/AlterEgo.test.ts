import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { KURT, kurtOnScreen, rollHomeAlter, transformsOnLeave } from './AlterEgo';
import { random, seeded, setSeed } from './rng';

const marco = team.find((m) => m.id === 'marco-rieser')!;
const other = team.find((m) => !m.alterEgo)!;

describe('kurt', () => {
  it('kurt.behavior: only going home transforms, and only Marco', () => {
    expect(marco.alterEgo).toBe('kurt');
    expect(transformsOnLeave(marco, 'end')).toBe(true);
    expect(transformsOnLeave(marco, 'home')).toBe(true);
    for (const r of ['errand', 'lunch', 'manual'] as const) expect(transformsOnLeave(marco, r)).toBe(false);
    expect(transformsOnLeave(other, 'end')).toBe(false);
  });

  it('kurt.home: about one home office spell in five shows Kurt; nobody else ever', () => {
    const rnd = seeded(7);
    let n = 0;
    for (let i = 0; i < 5000; i++) if (rollHomeAlter(marco, rnd)) n++;
    expect(n / 5000).toBeGreaterThan(KURT.homeChance - 0.03);
    expect(n / 5000).toBeLessThan(KURT.homeChance + 0.03);
    // the roll never draws from the simulation's stream (a seeded day plays out as without Kurt), and repeats per seed
    setSeed(3);
    const first = random();
    setSeed(3);
    const a = Array.from({ length: 20 }, () => rollHomeAlter(marco));
    expect(random()).toBe(first);
    setSeed(3);
    expect(Array.from({ length: 20 }, () => rollHomeAlter(marco))).toEqual(a);
    expect(rollHomeAlter(other)).toBe(false);
  });

  it('kurt.screen: his empty desk shows Kurt while he is out (not home office) between 08:30 and 17:00', () => {
    const at = (hour: number, o: Partial<Parameters<typeof kurtOnScreen>[0]> = {}) =>
      kurtOnScreen({ hour, presence: 'out', awayKind: 'errand', deskUsed: false, ...o });
    expect(at(8.5)).toBe(true);
    expect(at(12)).toBe(true);
    expect(at(16.99)).toBe(true);
    expect(at(12, { awayKind: 'off' })).toBe(true);
    expect(at(8.49)).toBe(false);
    expect(at(17)).toBe(false);
    expect(at(23)).toBe(false);
    expect(at(12, { awayKind: 'home' })).toBe(false);
    expect(at(12, { deskUsed: true })).toBe(false);
    for (const presence of ['in', 'leaving', 'returning'] as const) expect(at(12, { presence, awayKind: null })).toBe(false);
  });
});
