import { CORRIDOR_POINT } from "../render/officeModel";
import { random } from "./rng";
import type { Person } from "./Person";
import type { Sim } from "./Sim";

/** What a dev event may have to wait for: a person standing up from a chair, a place letting go (frames of 1/30 s each). */
const SETTLE_STEPS = 15;
const STEP = 1 / 30;

/** Pulls everybody out of this place at once; false when nobody was in it. */
const pullAll = (sim: Sim, people: readonly Person[]): boolean => {
  people.forEach((p) => sim.pull(p));
  return people.length > 0;
};

/** Where somebody brought in by hand appears: at their desk, else in the corridor. */
const inside = (sim: Sim, p: Person) =>
  sim.deskFor(p)?.approach ??
  sim.nav.nearestWalkable(CORRIDOR_POINT, 6) ??
  CORRIDOR_POINT;

/**
 * The things that can stand in the way of a dev event, mildest first: a place somebody uses, then somebody who is
 * not in the office. Each one returns false when there was nothing to do (so nothing changed).
 */
function* obstacles(sim: Sim): Generator<() => boolean> {
  yield () =>
    !!sim.meetingRoom.current && (sim.meetingRoom.abort(sim.nav), true);
  yield () => !sim.kitchen.free && (sim.kitchen.abort(), true);
  yield () => pullAll(sim, sim.pod.current?.members ?? []);
  yield () => pullAll(sim, sim.phoneBooth.current?.members ?? []);
  yield () => pullAll(sim, sim.people.filter((p) => p.benched)); // overflow sitters (no desk free): off the stool or the meeting chair
  yield () =>
    (sim.toilets.queue.length > 0 ||
      sim.toilets.cabins.some((c) => c.session)) &&
    (sim.toilets.abort(), true);
  yield () => !!sim.photoStudio.current && (sim.photoStudio.abort(), true);
  yield () => !sim.serverRack.free && (sim.serverRack.abort(), true);
  yield () => pullAll(sim, sim.office.printer?.occupant ? [sim.office.printer.occupant] : []); // the job stops, the paper goes
  yield () => pullAll(sim, sim.office.foosball?.spots.flatMap((s) => (s.occupant ? [s.occupant] : [])) ?? []); // the game stops, both players are free
  yield () => sim.boombox.active && (sim.boombox.abort(), true);
  yield () => sim.nerf.active && (sim.nerf.abort(), true);
  yield () => sim.bonfire.active && (sim.bonfire.abort(), true);
  yield () => sim.mail.active && (sim.mail.abort((p) => inside(sim, p)), true);
  yield () => sim.tidy.active && (sim.tidy.abort(), true);
  yield () => sim.smoke.active && (sim.smoke.abort((p) => inside(sim, p)), true);
  yield () => {
    const talks = sim.social.active.slice();
    talks.forEach((c) => c.members.slice().forEach((m) => sim.social.leave(m)));
    return talks.length > 0;
  };
  // everybody who is away comes in one after the other, in no particular order; held by a scene they stay where they are
  const away = sim.people
    .filter((p) => p.presence !== "in")
    .sort(() => random() - 0.5);
  for (const p of away) yield () => bringIn(sim, p);
}

/**
 * Somebody away appears in the office at once, at their desk (their pets with them), and stays on duty; somebody on the
 * way out turns back. False when they are in already, or a scene or the dev panel holds them.
 */
export function bringIn(sim: Sim, p: Person): boolean {
  if (p.presence === "in" || !sim.presence.stay(p)) return false;
  if (p.presence === "leaving") p.cancelLeave();
  else sim.scenario.enter(p, inside(sim, p));
  return true;
}

/**
 * A dev event said "nicht möglich": clear what is in the way, one thing at a time, and run it again after each, until
 * it runs. Somebody in the way is pulled out of it, somebody away appears at their desk (their pets with them); who a
 * scene holds is left alone. Returns the event's result, null when nothing helped (and then nothing was changed that
 * the event did not need: the sim only runs on after something was cleared).
 */
export function makePossible(
  sim: Sim,
  run: () => string | void | null,
): string | void | null {
  for (const clear of obstacles(sim)) {
    if (!clear()) continue;
    // people stand up, places let go: give the sim a moment before saying no
    for (let i = 0; i < SETTLE_STEPS; i++) {
      const r = run();
      if (r !== null) return r;
      sim.step(STEP);
    }
  }
  return null;
}
