import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import type { Person } from './Person';
import { random, setSeed } from './rng';
import { Sim } from './Sim';
import { Walker } from './Walker';

installHeadlessDom();

const STEP = 1 / 60;
const MINUTES = 60 * 60; // steps per game minute

function office(seed = 1, seconds = 2): Sim {
  setSeed(seed);
  const sim = new Sim();
  Walker.animate = true;
  advance(sim, seconds * 60);
  return sim;
}

function advance(sim: Sim, steps: number, stop: () => boolean = () => false): void {
  for (let i = 0; i < steps && !stop(); i++) sim.step(STEP);
}

const at = (v: { x: number; z: number }): string => `${v.x.toFixed(3)},${v.z.toFixed(3)}`;
const places = (people: readonly Person[]) => new Map(people.map((p) => [p.id, `${p.presence}@${at(p.pos)}`]));

describe('dev.scene', () => {
  it('dev.scene: somebody put at a desk and pinned still sits and works there after 5 minutes, released they move on', () => {
    const sim = office();
    const a = sim.people.find((p) => p.inOffice && !p.working)!;
    sim.scenario.put(a.id, 'desk');
    const desk = a.task!.desk;
    expect(a.working).toBe(true);
    advance(sim, 5 * MINUTES);
    expect(a.presence).toBe('in');
    expect(a.working).toBe(true);
    expect(a.task!.desk).toBe(desk);
    expect(at(a.pos)).toBe(at(desk.seat));
    expect(a.sit).toBeGreaterThan(0.99);

    sim.scenario.release(a.id);
    advance(sim, 10 * MINUTES, () => !a.working);
    expect(a.working).toBe(false);
  });

  it('dev.scene: somebody who is out is in the office at once, pet included, and stays in for 5 minutes', () => {
    const sim = office();
    const b = sim.people.find((p) => p.presence === 'out' && p.pets.length > 0)!;
    expect(b, 'seed 1 has a pet owner who starts out').toBeDefined();
    const { cx, cz } = sim.nav.randomWalkable();
    const spot = sim.nav.center(cx, cz);
    sim.scenario.put(b.id, spot, 'stay');
    expect(b.presence).toBe('in');
    expect(b.pets.every((d) => !d.away)).toBe(true);
    expect(b.root.scale.y).toBeGreaterThan(0.5); // there in full, no arrival show pending
    for (let m = 0; m < 5; m++) {
      advance(sim, MINUTES);
      expect(b.presence).toBe('in');
    }
    // `stay` keeps them in, not put: they went about their day
    expect(at(b.pos)).not.toBe(at(spot));
  });

  it('dev.scene: somebody pinned at a point stands exactly there after 5 minutes', () => {
    const sim = office();
    const p = sim.people.find((o) => o.inOffice)!;
    const spot = sim.nav.nearestWalkable({ x: p.pos.x + 2, z: p.pos.z }, 8)!;
    sim.scenario.put(p.id, spot);
    advance(sim, 5 * MINUTES);
    expect(at(p.pos)).toBe(at(spot));
    expect(p.talk).toBeNull();
  });

  it('dev.scene: somebody sent out is gone at once and stays out for 5 minutes, released they come back', () => {
    const sim = office();
    const c = sim.people.find((p) => p.inOffice && !p.member.homebody)!;
    sim.scenario.put(c.id, 'errand');
    expect(c.presence).toBe('out');
    expect(c.awayKind).toBe('errand');
    sim.presence.callAllBack(); // not even "everybody back" moves a held person
    advance(sim, 5 * MINUTES);
    expect(c.presence).toBe('out');

    sim.scenario.release(c.id);
    advance(sim, 2 * MINUTES, () => c.presence === 'in');
    expect(c.presence).toBe('in');
  });

  it('dev.scene: the printer and the kitchen are free at once', () => {
    const sim = office();
    const free = sim.people.filter((p) => sim.presence.free(p));
    const [printing, ...rest] = free;
    sim.drop(printing);
    expect(printing.startPrint(sim.nav)).toBe(true);
    const group = rest.slice(0, 3);
    group.forEach((p) => sim.drop(p));
    expect(sim.kitchen.start(group, sim.nav)).not.toBeNull();
    advance(sim, 20 * 60);
    expect(printing.printJob ?? sim.office.printer!.occupant).not.toBeNull();
    expect(sim.kitchen.current).not.toBeNull();

    sim.scenario.clear('printer', 'kitchen');
    expect(sim.office.printer!.occupant).toBeNull();
    expect(sim.people.some((p) => p.printJob)).toBe(false);
    expect(sim.kitchen.current).toBeNull();
    expect(group.every((p) => !p.coffeeJob)).toBe(true);
  });

  it('dev.scene: setting a scene rolls no dice of the simulation and moves nobody else', () => {
    const plain = office(1, 10);
    const before = places(plain.people);
    const next = random();

    const sim = office(1, 10);
    const inside = sim.people.filter((p) => p.inOffice && !p.member.homebody);
    const [a, b, c] = [inside[0], sim.people.find((p) => p.presence === 'out')!, inside[1]];
    sim.scenario.put(a.id, 'desk');
    sim.scenario.put(b.id, 'desk', 'stay');
    sim.scenario.put(c.id, 'errand');
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    expect(random()).toBe(next);
    // everybody the scene did not name is where they were
    const now = places(sim.people);
    for (const p of sim.people) if (![a, b, c].includes(p)) expect(now.get(p.id), p.id).toBe(before.get(p.id));
  });

  it('dev.scene: somebody put out of a running meeting leaves no ghost on the chair, the meeting goes on without them', () => {
    const sim = office();
    const group = sim.people.filter((p) => sim.presence.free(p)).slice(0, 3);
    group.forEach((p) => sim.drop(p));
    const meeting = sim.meetingRoom.start(group, sim.nav, 'slides')!;
    expect(meeting).not.toBeNull();
    advance(sim, 3 * MINUTES, () => group.every((p) => p.meetSeated));
    expect(group.every((p) => p.meetSeated)).toBe(true);

    const [gone, ...rest] = group;
    sim.scenario.put(gone.id, 'errand');
    expect(gone.inMeeting).toBe(false);
    expect(sim.meetingRoom.seats.some((s) => s.occupant === gone)).toBe(false);
    advance(sim, 60);
    expect(meeting.members).toEqual(rest);
    advance(sim, 10 * MINUTES, () => !sim.meetingRoom.current);
    expect(sim.meetingRoom.current).toBeNull();
  });

  it('dev.scene: two people put at the same desk do not end up on one chair', () => {
    const sim = office();
    const guest = sim.people.find((p) => p.inOffice && !p.working)!;
    const owner = sim.people.find((p) => p.presence === 'out')!;
    sim.scenario.put(guest.id, 'desk');
    owner.homeDesk = guest.task!.desk; // the guest sits pinned on what is the owner's own desk
    sim.scenario.put(owner.id, 'desk');
    advance(sim, 120);
    expect(at(owner.pos)).toBe(at(owner.homeDesk!.seat));
    expect(at(guest.pos)).not.toBe(at(owner.pos));
    expect(guest.scripted).toBeNull();
  });

  it('dev.scene: somebody already working stays on their chair', () => {
    const sim = office();
    const p = sim.people.find((o) => o.inOffice && o.working && !o.homeDesk)!;
    const desk = p.task!.desk;
    sim.scenario.put(p.id, 'desk');
    expect(p.task!.desk).toBe(desk);
  });

  it('dev.scene: what a scene cannot do throws, before anything changed', () => {
    const sim = office();
    const p = sim.people.find((o) => o.inOffice)!;
    const before = at(p.pos);
    expect(() => sim.scenario.put('nobody', 'desk')).toThrow(/nobody/);
    expect(() => sim.scenario.put(p.id, 'wc' as never)).toThrow(/cannot put/);
    expect(() => sim.scenario.put(p.id, 'desk', 'forever' as never)).toThrow(/hold/);
    expect(() => sim.scenario.clear('toilet' as never)).toThrow(/no place/);
    expect(at(p.pos)).toBe(before);
    expect(sim.toilets.cabins.length).toBeGreaterThan(0);
  });
});
