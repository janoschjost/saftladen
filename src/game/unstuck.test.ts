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

});
