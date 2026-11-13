import { DevPeople } from '../ui/DevPeople';
import type { Game } from './Game';
import { FORCE_STATES, forceState, refusalText, type ForceCtx, type ForcePerson, type ForceState } from './forceState';
import type { Person } from './Person';

/**
 * Dev only (loaded from main.ts on the dev server and in the e2e bundle, never in the production bundle): sends a person into a
 * state by hand. Adds `dev.forceState(personId, state)` to the console / `?test` hook and the "Leute" section to the dev panel.
 */
export function installForceState(game: Game): void {
  const g = game as any;
  const people: (Person & ForcePerson)[] = g.people;
  /** Same as the dev events: pulls the people out of whatever they were doing. */
  const drop = (p: Person) => {
    g.social.leave(p);
    p.interrupt();
  };
  const ctx: ForceCtx<Person & ForcePerson> = {
    people,
    desk: (p) => {
      const d = g.office.claim(p);
      if (!d) return false;
      drop(p);
      p.headForDesk(d, g.nav);
      return true;
    },
    away: (p, kind) => {
      if (p.presence !== 'in' || p.talk || (kind === 'home' && g.presence.homeFull && !p.member.homebody)) return false;
      g.release(p);
      g.presence.send(p, kind, g.nav);
      return p.presence !== 'in';
    },
    wc: (p) => {
      if (p.talk || !g.toilets.cabins.some((c: unknown) => !g.toilets.isOccupied(c))) return false;
      drop(p);
      return g.toilets.go(p, g.nav) === 'cabin';
    },
    meeting: (group) => {
      if (g.meetingRoom.current) return false;
      group.forEach(drop);
      return !!g.meetingRoom.start(group, g.nav, 'slides');
    },
    coffee: (group) => {
      if (g.kitchen.current) return false;
      group.forEach(drop);
      return !!g.kitchen.start(group, g.nav);
    },
  };
  const run = (id: string, state: string): string => {
    const r = forceState(ctx, id, state);
    const who = people.find((p) => p.id === id);
    if (r !== null || !who || !(FORCE_STATES as readonly string[]).includes(state)) return r ?? `${id}: ${state} nicht möglich`;
    return refusalText(who, state as ForceState);
  };
  Object.assign((window as unknown as { dev: object }).dev, {
    forceState: run,
  });
  new DevPeople(
    people.map((p) => ({
      id: p.id,
      name: p.member.name,
      away: () => !p.inOffice,
    })),
    run,
  );
}
