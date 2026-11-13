import { DevPeople } from '../ui/DevPeople';
import type { Game } from './Game';
import { forceRunner, simForceCtx } from './forceCtx';
import type { Person } from './Person';

/**
 * Dev only (loaded from main.ts on the dev server and in the e2e bundle, never in the production bundle): sends a person into a
 * state by hand. Adds `dev.forceState(personId, state)` to the console / `?test` hook and the "Leute" section to the dev panel.
 */
export function installForceState(game: Game): void {
  const g = game as any;
  const people: Person[] = g.people;
  const run = forceRunner(simForceCtx(g.sim, (p) => g.release(p)));
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
