import { devEvents } from './DevEvents';
import type { Game } from './Game';
import { getSeed, setSeed } from './rng';

/**
 * Dev only, URL params for testing:
 *   ?snack            Jan Hasler (first snacker) fetches chips right away; ?snack=<person-id> for somebody else
 *   &time=14          freezes the clock at 14:00
 *   &follow           camera follows the person (orbit view)
 *   ?day              starts "Ein Tag im Leben" as Jan Hasler; ?day=<person-id> for somebody else
 *   ?seed=<n>         seeds the random numbers (see rng.ts): same seed, same start. The console logs every page's seed.
 *   ?event=<id>       runs a dev-panel event right at start (`dev.list()` shows the ids), e.g. ?event=meeting-room;
 *                     repeat it for several (?event=rain&event=coffee). FEATURES.md links each feature to such a URL.
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
  if (!['snack', 'time', 'day', 'seed', 'test', 'event'].some((k) => q.has(k))) return;
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
  for (const id of q.getAll('event')) runEvent(id);
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

/**
 * Dev events are registered by id; an unknown id only warns, the game starts normally. An event that can't run yet
 * (nobody free, table busy, the person still on the way in) is retried for up to a minute.
 */
function runEvent(id: string): void {
  const ev = devEvents.list().find((e) => e.id === id);
  if (!ev) return console.warn(`[debug] no event "${id}", see dev.list()`);
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    const r = ev.run();
    if (r !== null) console.info(`[debug] event ${id}: ${r || ev.label}`);
    else if (performance.now() - t0 > 60_000) console.warn(`[debug] event ${id}: not possible`);
    else return;
    window.clearInterval(timer);
  }, 500);
}
