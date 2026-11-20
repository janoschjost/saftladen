import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { forceRunner, simForceCtx } from './forceCtx';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

const ANDREA = 'andrea-eichmann';
const DESK = 32; // hers in `src/data/seats.json`: in the corner between the desk island, a plant and the wall

/** Andrea at her desk, both WC cabins free; `force` sends people the way the dev panel does. */
function atDesk(): { sim: Sim; a: Person; force: (id: string, state: string) => string } {
  const sim = office();
  const a = sim.person(ANDREA);
  sim.office.assign(a, DESK);
  sim.scenario.clear('wc');
  sim.scenario.put(ANDREA, 'desk', 'stay');
  expect(a.task?.desk.number).toBe(DESK);
  return { sim, a, force: forceRunner(simForceCtx(sim, () => {})) };
}

const away = (a: Person, from: { x: number; z: number }) => Math.hypot(a.pos.x - from.x, a.pos.z - from.z);
const inCabin = (sim: Sim, a: Person) => a.meetSeated && sim.toilets.cabins.some((c) => c.session?.person === a);

describe('move.unstuck', () => {
  it('move.unstuck: standing up from a desk whose approach cell got walled in, she steps out next to the chair and walks to the WC', () => {
    const { sim, a, force } = atDesk();
    const { cx, cz } = sim.nav.toCell(a.task!.desk.approach);
    // the only two ways out of the cell behind her chair (the desk is in front of it, the plant beside it)
    sim.scenario.block(cx - 1, cz);
    sim.scenario.block(cx, cz + 1);
    expect(force(ANDREA, 'wc')).toBe('Andrea: WC');
    const stood = { ...a.pos };
    expect(sim.nav.findPath(stood, sim.toilets.cabins[0].seat.approach).length).toBeGreaterThan(0); // she stood up where there is a way on
    expect(run(sim, 5, () => away(a, stood) > 1.5)).toBe(true);
    expect(run(sim, 60, () => inCabin(sim, a))).toBe(true);
  });

  it('move.unstuck: somebody who stood up and is walled in where they stand steps to the nearest free cell and walks on', () => {
    const { sim, a, force } = atDesk();
    expect(force(ANDREA, 'wc')).toBe('Andrea: WC');
    // after standing up, everything around her fills up: no route from her cell any more
    const { cx, cz } = sim.nav.toCell(a.pos);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dz) sim.scenario.block(cx + dx, cz + dz);
    const stood = { ...a.pos };
    expect(sim.nav.findPath(stood, sim.toilets.cabins[0].seat.approach)).toEqual([]);
    expect(run(sim, 5, () => away(a, stood) > 1.5)).toBe(true);
    expect(run(sim, 60, () => inCabin(sim, a))).toBe(true);
  });
});

describe('move.unstuck: exit cells', () => {
  it('move.unstuck: for every desk the cell somebody walks to to sit down and the one they stand up to lie on the chair side of every wall', () => {
    const sim = office();
    const bad: string[] = [];
    for (const d of sim.office.desks) {
      const out = sim.office.exit(d);
      if (sim.office.wallBetween(d.seat, d.approach)) bad.push(`desk ${d.number}: seat -> approach ${d.approach.x},${d.approach.z} through a wall`);
      if (sim.office.wallBetween(d.seat, out)) bad.push(`desk ${d.number}: seat ${d.seat.x},${d.seat.z} -> ${out.x},${out.z} through a wall`);
    }
    expect(bad).toEqual([]);
  });
});
