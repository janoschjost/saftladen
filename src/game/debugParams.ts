import { OVERLAY_KINDS, type OverlayKind } from './DebugOverlays';
import type { Game } from './Game';
import { getSeed, setSeed } from './rng';
import { cycleOf } from './TimeOfDay';

/**
 * Dev only, URL params for testing:
 *   ?snack            Jan Hasler (first snacker) fetches chips right away; ?snack=<person-id> for somebody else
 *   &time=14          freezes the clock at 14:00
 *   &follow           camera follows the person (orbit view)
 *   ?day              starts "Ein Tag im Leben" as Jan Hasler; ?day=<person-id> for somebody else
 *   ?seed=<n>         seeds the random numbers (see rng.ts): same seed, same start. The console logs every page's seed.
 *   ?event=<id>       runs a dev-panel event right at start (`dev.list()` shows the ids), e.g. ?event=meeting-room;
 *                     repeat it for several (?event=rain&event=coffee). FEATURES.md links each feature to such a URL.
 *   ?action=<id>      starts an Aktionen card (`src/data/actions.ts`, e.g. ?action=printer) or any dev event like the
 *                     sheet does: the camera flies in Orbit to the person it moves; retried until it can run
 *   ?overlay=<kind>   switches a debug overlay on at start: grid | states | paths (repeat for several)
 *   ?test             for the Playwright tests in e2e/: exposes `window.__game` (read the state), time stands still
 *                     (only `__game.advance(seconds)` moves the game, so nothing changes between two steps of a
 *                     test) and the office is not drawn (the tests render WebGL in software). ?test&draw draws it.
 *                     It also keeps the welcome card away; ?test&welcome=1 shows it as on a first visit.
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
  if (!['snack', 'time', 'day', 'seed', 'test', 'event', 'action', 'overlay'].some((k) => q.has(k))) return;
  const g = game as any;
  (window as unknown as { __game: Game }).__game = game;

  const time = Number(q.get('time'));
  if (q.has('time') && Number.isFinite(time)) {
    g.tod.pinned = true;
    g.tod.setCycle(cycleOf(time));
  }
  if (q.has('day')) game.startDay(q.get('day') || 'jan-hasler');
  for (const id of q.getAll('event')) runEvent(game, id);
  for (const id of q.getAll('action')) runAction(game, id);
  for (const kind of q.getAll('overlay')) {
    if (OVERLAY_KINDS.includes(kind as OverlayKind)) g.debug?.set(kind as OverlayKind, true);
    else console.warn(`[debug] no overlay "${kind}", use ${OVERLAY_KINDS.join(' | ')}`);
  }
  if (!q.has('snack')) return;

  const id = q.get('snack') || 'jan-hasler';
  const person = g.people.find((p: { id: string }) => p.id === id);
  if (!person) return console.warn(`[debug] no person "${id}"`);
  person.member.snacker = true;
  const follow = q.has('follow');

  // retry until the person is free and the machine spot is not taken, then stop
  let started = false;
  game.tickers.add(() => {
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
  });
}

/** Calls `attempt` every half second of game time until it returns true; after a minute `giveUp` instead. */
function retry(game: Game, attempt: () => boolean, giveUp: () => void): void {
  let t = 0;
  let next = 0;
  const tick = (dt: number): void => {
    t += dt;
    if (t < next) return;
    next = t + 0.5;
    const done = attempt();
    if (!done && t > 60) giveUp();
    if (done || t > 60) game.tickers.delete(tick);
  };
  game.tickers.add(tick);
}

/**
 * Dev events are registered by id; an unknown id only warns, the game starts normally. An event that can't run yet
 * (nobody free, table busy, the person still on the way in) is retried for up to a minute.
 */
function runEvent(game: Game, id: string): void {
  const ev = game.events.get(id);
  if (!ev) return console.warn(`[debug] no event "${id}", see dev.list()`);
  retry(
    game,
    () => {
      const r = ev.run();
      if (r !== null) console.info(`[debug] event ${id}: ${r || ev.label}`);
      return r !== null;
    },
    () => console.warn(`[debug] event ${id}: not possible`),
  );
}

/** Like `runEvent`, but through the Aktionen sheet's path: chip, Orbit, camera follows. */
function runAction(game: Game, id: string): void {
  retry(
    game,
    () => {
      const r = game.startAction(id, true);
      if (r === 'unknown') console.warn(`[debug] no action "${id}"`);
      else if (r === 'started') console.info(`[debug] action ${id} started`);
      return r === 'unknown' || r === 'started';
    },
    () => console.warn(`[debug] action ${id}: not possible`),
  );
}
