import { DevPeople } from '../ui/DevPeople';
import type { Game } from './Game';
import { forceRunner, simForceCtx } from './forceCtx';

/**
 * Dev only (loaded from main.ts on the dev server and in the e2e bundle, never in the production bundle): sends a person into a
 * state by hand. Adds `dev.forceState(personId, state)` to the console / `?test` hook and the "Leute" section to the dev panel.
 */
export function installForceState(game: Game): void {
  const g = game as any;
  const run = forceRunner(simForceCtx(game.sim, (p) => g.release(p)));
  window.dev.forceState = run;
  new DevPeople(
    game.sim.people.map((p) => ({
      id: p.id,
      name: p.member.name,
      away: () => !p.inOffice,
    })),
    run,
  );
}
