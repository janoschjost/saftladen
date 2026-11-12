import { describe, expect, it } from 'vitest';
import { forceState, type ForceCtx, type ForcePerson } from './forceState';
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
    expect(calls[0]).toBe('desk a');
    expect(calls[3].startsWith('meeting a,')).toBe(true);
    expect(calls[3].split(' ')[1].split(',')).toHaveLength(4);
    expect(calls[4].split(' ')[1].split(',')).toHaveLength(3);
  });

  it('person who is away or busy: not possible, nothing changes', () => {
    for (const over of [{ inOffice: false }, { held: true }, { controlled: true }]) {
      const { c, calls } = ctx([person('a', over), person('b')]);
      for (const s of ['desk', 'errand', 'home', 'meeting', 'break']) expect(forceState(c, 'a', s)).toBeNull();
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

  it('unknown person or state only reports', () => {
    const { c, calls } = ctx([person('a')]);
    expect(forceState(c, 'zz', 'desk')).toContain('unbekannt');
    expect(forceState(c, 'a', 'sleep')).toContain('unbekannt');
    expect(calls).toEqual([]);
  });
});
