import { FORCE_STATES, forceState, refusalText, type ForceCtx, type ForcePerson, type ForceState } from './forceState';
import type { Person } from './Person';
import type { Sim } from './Sim';

/**
 * `forceState` on a real office: how each state is set off on the `Sim`, the same way the dev events do (pulled out of
 * whatever they were doing first). `release` hands a person back from the player's steering (the view's job).
 */
export function simForceCtx(sim: Sim, release: (p: Person) => void): ForceCtx<Person & ForcePerson> {
  const drop = (p: Person) => sim.drop(p);
  return {
    people: sim.people,
    desk: (p) => {
      const d = sim.office.claim(p);
      if (!d) return false;
      drop(p);
      p.headForDesk(d, sim.nav);
      return true;
    },
    away: (p, kind) => {
      if (p.presence !== 'in' || p.talk || (kind === 'home' && sim.presence.homeFull)) return false;
      release(p);
      sim.presence.send(p, kind, sim.nav);
      return p.presence !== 'in';
    },
    wc: (p) => {
      if (p.talk || !sim.toilets.cabins.some((c) => !sim.toilets.isOccupied(c))) return false;
      drop(p);
      return sim.toilets.go(p, sim.nav) === 'cabin';
    },
    meeting: (group) => {
      if (sim.meetingRoom.current) return false;
      group.forEach(drop);
      return !!sim.meetingRoom.start(group, sim.nav, 'slides');
    },
    coffee: (group) => {
      if (sim.kitchen.current) return false;
      group.forEach(drop);
      return !!sim.kitchen.start(group, sim.nav);
    },
  };
}

/** `dev.forceState(personId, state)`: what was done, or why not ("nicht möglich" with the reason). */
export function forceRunner<P extends ForcePerson>(ctx: ForceCtx<P>): (id: string, state: string) => string {
  return (id, state) => {
    const r = forceState(ctx, id, state);
    const who = ctx.people.find((p) => p.id === id);
    if (r !== null || !who || !(FORCE_STATES as readonly string[]).includes(state)) return r ?? `${id}: ${state} nicht möglich`;
    return refusalText(who, state as ForceState);
  };
}
