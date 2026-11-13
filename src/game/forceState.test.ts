import { describe, expect, it } from 'vitest';
import { forceState, refusalText, type ForceCtx, type ForcePerson } from './forceState';
import { setSeed } from './rng';

const person = (id: string, over: Partial<ForcePerson> = {}): ForcePerson => ({ id, member: { name: `${id} Muster` }, inOffice: true, held: false, controlled: false, working: false, ...over });

function ctx(people: ForcePerson[], over: Partial<ForceCtx<ForcePerson>> = {}) {
  const calls: string[] = [];
  const c: ForceCtx<ForcePerson> = {
    people,
    desk: (p) => (calls.push(`desk ${p.id}`), true),
    away: (p, k) => (calls.push(`${k} ${p.id}`), true),
    meeting: (g) => (calls.push(`meeting ${g.map((p) => p.id).join(',')}`), true),
    coffee: (g) => (calls.push(`coffee ${g.map((p) => p.id).join(',')}`), true),
    wc: (p) => (calls.push(`wc ${p.id}`), true),
    ...over,
  };
  return { c, calls };
}

describe('dev.forceState (dev.force)', () => {
  setSeed(1);

  it('sends the person into each state once', () => {
    const people = [person('a'), person('b'), person('c'), person('d'), person('e')];
    const { c, calls } = ctx(people);
    expect(forceState(c, 'a', 'desk')).toBe('a: Am Platz');
    expect(forceState(c, 'a', 'errand')).toContain('Besorgung');
    expect(forceState(c, 'a', 'home')).toContain('Homeoffice');
    expect(forceState(c, 'a', 'meeting')).toContain('Meeting');
    expect(forceState(c, 'a', 'break')).toContain('Pause');
    expect(forceState(c, 'a', 'wc')).toBe('a: WC');
    expect(calls[5]).toBe('wc a');
    expect(calls[0]).toBe('desk a');
    expect(calls[3].startsWith('meeting a,')).toBe(true);
    expect(calls[3].split(' ')[1].split(',')).toHaveLength(4);
    expect(calls[4].split(' ')[1].split(',')).toHaveLength(3);
  });

  it('person who is away or busy: not possible, nothing changes', () => {
    for (const over of [{ inOffice: false }, { held: true }, { controlled: true }]) {
      const { c, calls } = ctx([person('a', over), person('b')]);
      for (const s of ['desk', 'errand', 'home', 'meeting', 'break', 'wc']) expect(forceState(c, 'a', s)).toBeNull();
      expect(calls).toEqual([]);
    }
  });

  it('somebody already at the desk stays: not possible', () => {
    const { c, calls } = ctx([person('a', { working: true })]);
    expect(forceState(c, 'a', 'desk')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('group state without company is not possible', () => {
    const { c, calls } = ctx([person('a'), person('b', { inOffice: false }), person('c', { held: true })]);
    expect(forceState(c, 'a', 'meeting')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('refusal by the game (meeting room full, no desk, home full) is passed on', () => {
    const { c } = ctx([person('a'), person('b')], { meeting: () => false, desk: () => false, away: () => false });
    expect(forceState(c, 'a', 'meeting')).toBeNull();
    expect(forceState(c, 'a', 'desk')).toBeNull();
    expect(forceState(c, 'a', 'home')).toBeNull();
  });

  it('wc: both cabins taken is not possible', () => {
    const { c } = ctx([person('a')], { wc: () => false });
    expect(forceState(c, 'a', 'wc')).toBeNull();
  });

  it('unknown person or state only reports', () => {
    const { c, calls } = ctx([person('a')]);
    expect(forceState(c, 'zz', 'desk')).toContain('unbekannt');
    expect(forceState(c, 'a', 'sleep')).toContain('unbekannt');
    expect(calls).toEqual([]);
  });
});

describe('dev.force refusal texts (dev.force)', () => {
  const p = (over: Partial<ForcePerson> = {}) => person('Marco', over);

  it('names the reason for each refusal', () => {
    expect(refusalText(p({ inOffice: false }), 'meeting')).toBe('Marco: Meeting nicht möglich (nicht im Büro)');
    expect(refusalText(p({ held: true }), 'wc')).toContain('beschäftigt');
    expect(refusalText(p({ controlled: true }), 'desk')).toContain('beschäftigt');
    expect(refusalText(p({ working: true }), 'desk')).toContain('sitzt schon am Platz');
    expect(refusalText(p(), 'desk')).toContain('kein freier Platz');
    expect(refusalText(p(), 'home')).toContain('Homeoffice voll');
    expect(refusalText(p(), 'wc')).toContain('beide WC-Kabinen belegt');
    expect(refusalText(p(), 'meeting')).toContain('Meetingraum belegt');
    expect(refusalText(p(), 'break')).toContain('Küche belegt');
  });
});
