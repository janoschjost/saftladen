import { beforeEach, describe, expect, it } from 'vitest';
import type { OfficeModel } from '../render/officeModel';
import { NavGrid } from './NavGrid';
import { Office } from './Office';
import type { Person } from './Person';
import { setSeed } from './rng';

/** Just what Office reads from a person. */
interface FakePerson {
  id: string;
  homeDesk: Office['desks'][number] | null;
  pos: { x: number; z: number };
  yielded: number;
  yieldDesk(): void;
}
const person = (id: string, x = 0, z = 0): FakePerson => ({
  id,
  homeDesk: null,
  pos: { x, z },
  yielded: 0,
  yieldDesk() {
    this.yielded++;
  },
});
const asPerson = (p: FakePerson) => p as unknown as Person;

/** A row of `n` desks along z = 2, chairs facing -z, free floor behind them. */
function office(n: number): Office {
  const nav = new NavGrid(2 * n + 2, 6);
  const rig = { root: {}, screen: { material: null }, mug: { visible: false }, coffee: { visible: false } };
  const model = {
    printer: { stand: { x: 0.5, z: 0.5, yaw: 0 }, paper: { visible: false } },
    foosball: [],
    desks: Array.from({ length: n }, (_, i) => ({ seat: { x: 2 * i + 1.5, z: 2.5 }, back: { x: 0, z: 1 }, yaw: 0, rig })),
  } as unknown as OfficeModel;
  return new Office(model, nav);
}

describe('desk.ownership', () => {
  beforeEach(() => setSeed(1));

  it('makes every model desk a numbered workplace', () => {
    const o = office(4);
    expect(o.desks.map((d) => d.number)).toEqual([1, 2, 3, 4]);
    expect(o.desk(3)).toBe(o.desks[2]);
  });

  it('gives a desk one owner and a person one desk', () => {
    const o = office(3);
    const a = person('a');
    const b = person('b');
    o.assign(asPerson(a), 1);
    o.assign(asPerson(a), 2); // moving desks frees the old one
    expect(o.desk(1)!.owner).toBeNull();
    expect(o.desk(2)!.owner).toBe(a);
    o.assign(asPerson(b), 2); // taking an owned desk: the previous owner has none
    expect(o.desk(2)!.owner).toBe(b);
    expect(a.homeDesk).toBeNull();
    o.assign(asPerson(b), null);
    expect(o.desk(2)!.owner).toBeNull();
    expect(b.homeDesk).toBeNull();
  });

  it('the owner gets their own desk', () => {
    const o = office(3);
    const a = person('a');
    o.assign(asPerson(a), 3);
    expect(o.claim(asPerson(a))).toBe(o.desk(3));
    expect(o.desk(3)!.occupant).toBe(a);
  });

  it('asks a squatter to leave and hands the desk over once they stand up', () => {
    const o = office(3);
    const owner = person('owner');
    const squatter = person('squatter');
    o.assign(asPerson(owner), 1);
    o.desk(1)!.occupant = asPerson(squatter);
    expect(o.claim(asPerson(owner))).toBe(o.desk(1));
    expect(squatter.yielded).toBe(1);
    expect(o.desk(1)!.pending).toBe(owner);
    o.release(o.desk(1)!, asPerson(squatter));
    expect(o.desk(1)!.occupant).toBe(owner);
    expect(o.desk(1)!.pending).toBeNull();
  });

  it('never evicts anybody at game start', () => {
    const o = office(2);
    const owner = person('owner');
    o.assign(asPerson(owner), 1);
    o.desk(1)!.occupant = asPerson(person('squatter'));
    const got = o.claim(asPerson(owner), false);
    expect(got).toBe(o.desk(2));
    expect(o.desk(1)!.pending).toBeNull();
  });

  it('others take a free desk nearby, preferring desks nobody owns', () => {
    const owner = person('owner');
    for (let i = 0; i < 20; i++) {
      setSeed(i);
      const fresh = office(6);
      fresh.assign(asPerson(owner), 1);
      const d = fresh.claim(asPerson(person('guest', 1.5, 3.5)))!; // standing right behind desk 1
      expect(d.owner).toBeNull();
      expect(d.number).toBeLessThanOrEqual(5); // one of the 4 nearest unowned desks
    }
  });

  it('returns null when every desk is taken', () => {
    const o = office(2);
    o.claim(asPerson(person('a')));
    o.claim(asPerson(person('b')));
    expect(o.claim(asPerson(person('c')))).toBeNull();
  });
});
