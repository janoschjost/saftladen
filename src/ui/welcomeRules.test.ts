import { describe, expect, it } from 'vitest';
import { seeded } from '../game/rng';
import { team } from '../data/team';
import { greeters, pickGreeter, shouldShowWelcome } from './welcomeRules';

describe('ui.welcome', () => {
  it('ui.welcome: greeters are only Geschäftsleitung with a portrait, both spellings, from the real team', () => {
    const list = greeters(team);
    expect(list.length).toBeGreaterThan(1);
    for (const m of list) {
      expect(m.portrait).toBeTruthy();
      expect(m.role).toMatch(/Gesch(ä|ae)fts?leitung/i);
    }
    expect(greeters([{ role: 'Geschäftleitung, Partner', portrait: 'a.jpg' }, { role: 'Geschäftsleitung', portrait: null }, { role: 'Beratung', portrait: 'b.jpg' }])).toHaveLength(1);
  });

  it('ui.welcome: same seed, same greeter; different seeds reach more than one', () => {
    const a = pickGreeter(team, seeded(7));
    expect(pickGreeter(team, seeded(7))).toBe(a);
    const ids = new Set(Array.from({ length: 40 }, (_, i) => pickGreeter(team, seeded(i))?.id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it('ui.welcome: nobody qualifies → null', () => {
    expect(pickGreeter([{ role: 'Beratung', portrait: 'x.jpg' }], seeded(1))).toBeNull();
  });

  it('ui.welcome: off by default, on the first visit too', () => {
    expect(shouldShowWelcome('', '', false)).toBe(false);
    expect(shouldShowWelcome('', '', true)).toBe(false);
    expect(shouldShowWelcome('?seed=1&time=11', '', false)).toBe(false);
  });
  it('ui.welcome: #welcome always shows, even when seen or in test mode', () => {
    expect(shouldShowWelcome('', '#welcome', true)).toBe(true);
    expect(shouldShowWelcome('?test', '#welcome', true)).toBe(true);
  });
  it('ui.welcome: ?test and ?welcome=0 never show; ?welcome=1 opts in to the first-visit card, with ?test too', () => {
    expect(shouldShowWelcome('?test&seed=1', '', false)).toBe(false);
    expect(shouldShowWelcome('?welcome=0', '', false)).toBe(false);
    expect(shouldShowWelcome('?welcome=1', '', false)).toBe(true);
    expect(shouldShowWelcome('?welcome=1', '', true)).toBe(false);
    expect(shouldShowWelcome('?test&welcome=1', '', false)).toBe(true);
    expect(shouldShowWelcome('?test&welcome=1', '', true)).toBe(false);
  });
});
