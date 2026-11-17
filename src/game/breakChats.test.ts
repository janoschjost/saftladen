import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import type { Person } from './Person';
import type { Conversation } from './Social';
import type { Sim } from './Sim';

installHeadlessDom();

/** at the desk working, in a meeting (or on the toilet), on a call, held or steered: nobody may walk over to them */
const busy = (p: Person): boolean => p.task?.phase === 'work' || !!p.meetJob || !!p.phoneJob || p.held || p.controlled;

/** Every walk-over that starts in this step: who goes to whom. */
function walkOvers(sim: Sim, going: Map<Person, Person>): Array<[Person, Person]> {
  const started: Array<[Person, Person]> = [];
  for (const p of sim.people) {
    const to = sim.social.walkingOverTo(p);
    if (to && going.get(p) !== to) started.push([p, to]);
    if (to) going.set(p, to);
    else going.delete(p);
  }
  return started;
}

describe('social.start', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const talks: number[] = [];
  const atDesk: number[] = [];
  const talking: number[] = [];

  for (const seed of SEEDS) {
    it(`social.start: on a weekday at 11:00 talks start by themselves, never with somebody busy (seed ${seed}, 20 game minutes)`, () => {
      const sim = office({}, seed);
      const seen = new Set<Conversation>();
      const going = new Map<Person, Person>();
      let frame = 0;
      let inOffice = 0;
      let desk = 0;
      let chat = 0;
      run(
        sim,
        20 * 60,
        () => false,
        () => {
          for (const c of sim.social.active) seen.add(c);
          for (const [p, to] of walkOvers(sim, going)) expect(busy(to), `${p.id} walks over to busy ${to.id}`).toBe(false);
          if (++frame % 60) return;
          const inside = sim.people.filter((p) => p.inOffice);
          inOffice += inside.length;
          desk += inside.filter((p) => p.task).length;
          chat += sim.social.chattingCount;
        },
      );
      talks.push(seen.size);
      atDesk.push(desk / inOffice);
      talking.push(chat / inOffice);
      expect(seen.size).toBeGreaterThan(0);
    });
  }

  it('social.start: about 2–3 talks per 10 game minutes over seeds 1–10, and work still dominates', () => {
    expect(talks).toHaveLength(SEEDS.length);
    const mean = (xs: number[]): number => xs.reduce((t, x) => t + x, 0) / xs.length;
    expect(mean(talks)).toBeGreaterThanOrEqual(4);
    expect(mean(talks)).toBeLessThanOrEqual(6);
    // not a chatroom: nearly half the office is at (or on the way to) a desk, hardly anybody in a corridor talk
    expect(mean(atDesk)).toBeGreaterThan(0.4);
    expect(mean(talking)).toBeLessThan(0.05);
  });

  /** a and b stand about on a break, c works at the desk next to a, d (a stranger to a) is free too; everybody else is out */
  function scene(seed: number): { sim: Sim; a: Person; b: Person; c: Person; d: Person } {
    const sim = office({}, seed);
    const [a, b, c, d] = GROUP.slice(0, 4).map((id) => sim.person(id));
    for (const p of sim.people) if (![a, b, c, d].includes(p)) sim.scenario.put(p.id, 'errand');
    sim.scenario.put(c.id, 'desk', 'stay');
    sim.scenario.put(a.id, sim.deskFor(c)!.approach, 'stay');
    sim.scenario.put(b.id, sim.deskFor(b)!.approach, 'stay');
    sim.scenario.put(d.id, sim.deskFor(d)!.approach, 'stay');
    sim.social.affinity.bond(a, b, 0.9);
    return { sim, a, b, c, d };
  }

  it('social.start + social.friendship: somebody on a break walks over to a free friend, never to the colleague working next to them', () => {
    const { sim, a, b, c } = scene(1);
    expect(Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z)).toBeLessThan(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
    expect(busy(c)).toBe(true);
    const to = sim.social.walkOver(a, sim.people, sim.nav, sim.traffic);
    expect(to).not.toBe(c);
    expect(to).not.toBeNull();
    expect(sim.social.walkingOverTo(a)).toBe(to);

    // once there, the two talk; c keeps working
    expect(run(sim, 30, () => a.talk && a.talk === to!.talk)).toBe(true);
    expect(c.talk).toBeNull();
    expect(c.task?.phase).toBe('work');

    // with nobody else free, nobody to go to: c at the desk does not count
    const alone = scene(1);
    for (const p of [alone.b, alone.d]) alone.sim.scenario.put(p.id, 'errand');
    expect(alone.sim.social.walkOver(alone.a, alone.sim.people, alone.sim.nav, alone.sim.traffic)).toBeNull();
  });
});
