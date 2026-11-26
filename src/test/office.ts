import { setSeed } from '../game/rng';
import { Sim, type SimOptions } from '../game/Sim';
import { cycleOf } from '../game/TimeOfDay';
import { Walker } from '../game/Walker';

/** one simulation step, as the game takes them */
export const STEP = 1 / 60;

/** five people who sit in the office at 11:00 with seed 1 and have no pet, phone or other habit of their own */
export const GROUP = ['oscar-grob', 'andrew-jelley', 'linda-peter', 'milica-rakic', 'alyosha-krajnc'];

/** The whole office without a view, at 11:00 with seed 1 (or `seed`). Call `installHeadlessDom()` first. */
export function office(options: SimOptions = {}, seed = 1): Sim {
  setSeed(seed);
  const sim = new Sim({ cycle: cycleOf(11), ...options });
  Walker.animate = true;
  return sim;
}

/** The office holds only these people: everybody else is put out (on an errand). */
export function only(sim: Sim, ids: readonly string[]): void {
  for (const p of sim.people) if (!ids.includes(p.id)) sim.scenario.put(p.id, 'errand');
}

/** Gives `id` a desk of their own if the seed left them without, so a scene can rely on `deskFor`. */
export function ownDesk(sim: Sim, id: string): void {
  const p = sim.person(id);
  if (!p.homeDesk) sim.office.assign(p, sim.office.desks.find((d) => !d.owner)!.number);
}

/** Steps until `done` (true) or `seconds` of game time have passed (false); `each` runs after every step. */
export function run(sim: Sim, seconds: number, done: () => unknown = () => false, each: () => void = () => {}): boolean {
  for (let i = 0; i < seconds / STEP; i++) {
    if (done()) return true;
    sim.step(STEP);
    each();
  }
  return !!done();
}
