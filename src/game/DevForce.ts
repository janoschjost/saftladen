import { DevPeople } from '../ui/DevPeople';
import type { Game } from './Game';
import { forceState, type ForceCtx, type ForcePerson } from './forceState';
import type { Person } from './Person';

/**
 * Dev only (loaded from main.ts under `import.meta.env.DEV`, so not in the production bundle): sends a person into a
 * state by hand. Adds `dev.forceState(personId, state)` to the console / `?test` hook and the "Leute" section to the dev panel.
 */
export function installForceState(game: Game): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = game as any;
  const people: (Person & ForcePerson)[] = g.people;
  const first = (p: Person) => p.member.name.split(' ')[0];
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
    return r ?? `${who ? first(who) : id}: ${state} nicht möglich`;
  };
  Object.assign((window as unknown as { dev: object }).dev, { forceState: run });
  new DevPeople(
    people.map((p) => ({ id: p.id, name: p.member.name })),
    run,
  );
}
