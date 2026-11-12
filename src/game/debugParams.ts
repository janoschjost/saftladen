import type { Game } from './Game';
import { getSeed, setSeed } from './rng';

/**
 * Dev only, URL params for testing:
 *   ?snack            Jan Hasler (first snacker) fetches chips right away; ?snack=<person-id> for somebody else
 *   &time=14          freezes the clock at 14:00
 *   &follow           camera follows the person (orbit view)
 *   ?day              starts "Ein Tag im Leben" as Jan Hasler; ?day=<person-id> for somebody else
 *   ?seed=<n>         seeds the random numbers (see rng.ts): same seed, same start. The console logs every page's seed.
 *   ?test             only exposes `window.__game` (read-only test hook for the Playwright tests in e2e/)
 * Example: http://localhost:5173/?snack&time=14&follow
 */

/** Dev only: `?seed=<n>` must be applied before the game is built (its constructor already rolls dice). */
export function applySeedParam(): void {
  const raw = new URLSearchParams(location.search).get('seed');
  const n = Number(raw);
  if (raw && Number.isFinite(n)) setSeed(n);
  console.info(`[debug] seed ${getSeed()}, replay with ?seed=${getSeed()}`);
}

export function applyDebugParams(game: Game): void {
  const q = new URLSearchParams(location.search);
  if (!['snack', 'time', 'day', 'seed', 'test'].some((k) => q.has(k))) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = game as any;
  (window as unknown as { __game: Game }).__game = game;

  const time = Number(q.get('time'));
  if (q.has('time') && Number.isFinite(time)) {
    const tod = g.tod;
    tod.auto = false;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      tod.setCycle(mid);
      if (tod.hour < time) lo = mid;
      else hi = mid;
    }
  }
  if (q.has('day')) game.startDay(q.get('day') || 'jan-hasler');
  if (!q.has('snack')) return;

  const id = q.get('snack') || 'jan-hasler';
  const person = g.people.find((p: { id: string }) => p.id === id);
  if (!person) return console.warn(`[debug] no person "${id}"`);
  person.member.snacker = true;
  const follow = q.has('follow');

  // retry until the person is free and the machine spot is not taken, then stop
  let started = false;
  window.setInterval(() => {
    g.presence.overridden.add(person); // no more errands / lunch for this person
    if (person.presence === 'out' && person.awayKind !== 'off') person.awayLeft = 0; // back to the office right away
    if (!started && person.presence === 'in' && !person.meetJob && !person.talk) {
      if (person.task?.phase === 'work' && !person.task.errand) {
        person.startRun(person.task, g.nav, true);
        started = !!person.task?.errand;
      } else if (!person.task && !person.run && person.sit < 0.05) {
        started = person.startWanderRun(g.nav, true);
      }
      if (started) console.log(`[debug] ${id} goes for chips`);
    }
    if (follow) {
      const p = person.root.position;
      g.views.orbit.target.set(p.x, 1.0, p.z);
      g.views.persp.position.set(p.x + Math.sin(person.yaw + 0.7) * 1.8, 3.0, p.z + Math.cos(person.yaw + 0.7) * 1.8);
      g.views.orbit.update?.();
    }
  }, 100);
}
