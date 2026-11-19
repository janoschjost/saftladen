import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** Oscar and Andrew at their desks; everybody else out and held there, so nothing else comes in the way. */
function two(): { sim: Sim; a: Person; b: Person } {
  const sim = office();
  const [A, B] = GROUP;
  for (const p of sim.people) if (p.id !== A && p.id !== B) sim.scenario.put(p.id, 'errand');
  sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
  sim.scenario.put(A, 'desk', 'free');
  sim.scenario.put(B, 'desk', 'free');
  return { sim, a: sim.person(A), b: sim.person(B) };
}

/** Nothing of what they were doing is left: no job, no seat, no place held. */
function idle(sim: Sim, p: Person): void {
  expect([p.talk, p.meetJob, p.printJob, p.foosJob, p.coffeeJob, p.phoneJob, p.run, p.task]).toEqual([null, null, null, null, null, null, null, null]);
  expect(sim.office.printer?.occupant).not.toBe(p);
  expect(sim.office.foosball?.spots.some((s) => s.occupant === p)).toBe(false);
  expect(sim.meetingRoom.seats.some((s) => s.occupant === p)).toBe(false);
  expect(sim.toilets.cabins.some((c) => c.seat.occupant === p || c.session?.person === p)).toBe(false);
  expect(sim.office.desks.some((d) => d.occupant === p)).toBe(false);
}

describe('select.actions: Homeoffice / Rausschicken on the card while the person is busy', () => {
  const cases: Array<[string, (s: Sim, a: Person, b: Person) => unknown, (s: Sim, a: Person, b: Person) => unknown]> = [
    ['at the desk', () => true, () => true],
    ['printing', (s, _a, b) => (s.scenario.put(b.id, 'errand'), s.events.trigger('printer')), (_s, a) => a.printJob], // b is away: the event can only pick a
    ['playing foosball', (s, a, b) => s.office.foosball!.start(a, b, s.nav), (_s, a) => a.foosJob],
    ['on a coffee break', (s, a, b) => s.kitchen.start([a, b], s.nav), (_s, a) => a.coffeeJob],
    ['in a meeting', (s, a, b) => s.meetingRoom.start([a, b], s.nav), (_s, a) => a.meetSeated],
    ['on a call in the phone booth', (s, a) => s.phoneBooth.start(a, s.nav), (_s, a) => a.boothCall],
    ['on the toilet', (s, a) => s.toilets.go(a, s.nav), (_s, a) => a.meetSeated],
    ['in a talk', (s, a, b) => s.social.start([a, b], { x: a.pos.x, z: a.pos.z }, s.nav), (_s, a) => a.talk],
  ];
  for (const [what, setUp, ready] of cases) {
    for (const kind of ['errand', 'home'] as const) {
      it(`select.actions: ${what}: ${kind} drops what they do and sends them out`, () => {
        const { sim, a, b } = two();
        setUp(sim, a, b);
        expect(run(sim, 60, () => ready(sim, a, b)), `${what}: set up`).toBe(true);
        expect(sim.sendNow(a, kind)).toBe(true);
        expect(['leaving', 'out']).toContain(a.presence);
        expect(a.awayKind).toBe(kind);
        run(sim, 2);
        idle(sim, a);
        expect(run(sim, 120, () => a.presence === 'out')).toBe(true);
      });
    }
  }

  it('select.actions: a scene holds the person: the click is refused and nothing is dropped', () => {
    const { sim, a, b } = two();
    sim.social.start([a, b], { x: a.pos.x, z: a.pos.z }, sim.nav);
    sim.presence.keep(a);
    expect(sim.sendNow(a, 'errand')).toBe(false);
    expect(a.talk).toBeTruthy(); // still in their talk
    expect(a.presence).toBe('in');
  });

  it('select.actions: somebody carried by the player is not sent and keeps what they do', () => {
    const { sim, a } = two();
    sim.events.trigger('printer');
    const who = [a, ...sim.people].find((p) => p.printJob)!;
    who.held = true;
    expect(sim.sendNow(who, 'errand')).toBe(false);
    expect(who.printJob).toBeTruthy();
  });

  it('select.actions: the refusal says why: a scene holds them (busy), or no home office is free (homeFull), busy first', () => {
    const { sim, a } = two();
    expect(sim.presence.refusal(a, 'home')).toBeNull();
    // every home office taken (by people who are away anyway)
    for (const p of sim.people.filter((o) => o !== a).slice(0, 8)) sim.scenario.put(p.id, 'home', 'free');
    expect(sim.presence.homeFull).toBe(true);
    expect(sim.presence.refusal(a, 'errand')).toBeNull();
    expect(sim.presence.refusal(a, 'home')).toBe('homeFull');
    expect(sim.sendNow(a, 'home')).toBe(false);
    expect(a.task).not.toBeNull(); // nothing dropped by a refused click
    sim.presence.keep(a);
    expect(sim.presence.refusal(a, 'home')).toBe('busy');
  });

  it('select.actions: somebody in a running meeting of six gets out through the door, from every seat, and the meeting breaks up', () => {
    const ids = [...GROUP, 'celine-buhler'];
    for (let k = 0; k < ids.length; k++) {
      const sim = office();
      for (const p of sim.people) if (!ids.includes(p.id)) sim.scenario.put(p.id, 'errand');
      sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
      for (const id of ids) sim.scenario.put(id, 'desk', 'free');
      const group = ids.map((id) => sim.person(id));
      const meeting = sim.meetingRoom.start(group, sim.nav)!;
      expect(run(sim, 90, () => meeting.phase === 'session'), `seat ${k}: meeting runs`).toBe(true);
      expect(meeting.closed).toBe(true); // the door is shut
      expect(sim.sendNow(group[k], 'errand')).toBe(true);
      expect(run(sim, 90, () => group[k].presence === 'out'), `seat ${k}: gets out`).toBe(true);
      expect(meeting.closed).toBe(false);
      expect(run(sim, 60, () => !sim.meetingRoom.current), `seat ${k}: meeting over`).toBe(true);
    }
  });
});
