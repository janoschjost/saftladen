import { test as base, expect, type Page } from '@playwright/test';
import type { TestHook } from '../src/game/Game';
import type { Scenario } from '../src/game/Scenario';

export { expect };

/**
 * `test` for every spec: the calendar is pinned to a day in June. The game looks at the date (Christmas mode switches
 * itself on in December), and a test must not change with the season.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.clock.setFixedTime(new Date('2026-06-15T11:00:00'));
    await use(page);
  },
});

/** Every test starts from the same office: fixed seed, clock frozen at this hour. */
export const SEED = 1;
export const HOUR = 11;

/**
 * Opens `url` (path, query and hash of the game) and waits until the game is up: hook there, loader faded. Returns
 * the console errors and uncaught exceptions seen so far (and later).
 */
export async function boot(page: Page, url: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
  // generous: a CI runner takes seconds to build the scene
  await page.waitForFunction(() => !!window.__game, undefined, { timeout: 60_000 });
  // faded or gone: a fading loader lets clicks through, no need to wait for the fade
  await expect(page.locator('#loader:not(.is-done)')).toHaveCount(0, { timeout: 60_000 });
  return errors;
}

/**
 * Opens the game for a test: `?test` (exposes `window.__game`, time stands still, the office is not drawn unless
 * `query` has `draw`; not in the production bundle), seed and hour pinned, one second in, so everybody has made a
 * first move. `query` adds dev params, e.g. `event=coffee`. Returns the errors, see `boot`.
 */
export async function openGame(page: Page, hash = '', hour = HOUR, query = '', seed = SEED): Promise<string[]> {
  const errors = await boot(page, `/?test&seed=${seed}&time=${hour}${query ? `&${query}` : ''}${hash ? `#${hash}` : ''}`);
  await read(page, (g) => g.advance(1));
  return errors;
}

/** In the page: turns the source of a spec's callback back into a function of the game and its argument. */
const inPage = (src: string) => new Function('g', 'a', `return (${src})(g, a)`);

/** Reads from the game. The callback runs in the page: it sees `g`, the typed test hook (`Game.hook()`), and `arg`, nothing else of the spec. */
export function read<T, A = undefined>(page: Page, fn: (g: TestHook, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(([make, src, a]) => new Function(`return ${make}`)()(src)(window.__game, a), [inPage.toString(), fn.toString(), arg] as const) as Promise<T>;
}

/**
 * Waits until `fn` (run in the page against the game) returns something truthy, and returns that. Time stands still
 * under `?test`: this is what moves the game. It fast-forwards half a second at a time (`advance`) with one frame in
 * between, as poses and overlays are set per frame. `timeout` is game time (ms), so a wait takes the same number of
 * simulation steps on a slow machine as on a fast one.
 */
export async function until<T, A = undefined>(page: Page, fn: (g: TestHook, arg: A) => T, arg?: A, timeout = 20_000): Promise<NonNullable<T>> {
  const reached = await page.evaluate(
    async ([make, src, a, seconds]) => {
      const g = window.__game!;
      const test = new Function(`return ${make}`)()(src);
      for (let t = 0; ; t += 0.5) {
        await new Promise((r) => requestAnimationFrame(r));
        const value = test(g, a);
        if (value) return { value };
        if (t >= seconds) return null;
        g.advance(0.5);
      }
    },
    [inPage.toString(), fn.toString(), arg, timeout / 1000] as const,
  );
  expect(reached, `not reached within ${timeout / 1000} game seconds: ${fn.toString()}`).not.toBeNull();
  return reached!.value as NonNullable<T>;
}

/**
 * Sets the scene (`Scenario` in `src/game/Scenario.ts`): `fn` gets `g.sim.scenario` and `arg`, and runs in the page.
 * `put(id, where, hold)` places somebody now and holds them, `release(id)` lets go, `clear(...places)` empties the
 * printer, the coffee machine, the kitchen, the meeting room or the WC. Time stands still, so the scene is still
 * there at the next line; after an `until` only what is held is.
 */
export function scene<A = undefined>(page: Page, fn: (s: Scenario, arg: A) => void, arg?: A): Promise<void> {
  return page.evaluate(([make, src, a]) => void new Function(`return ${make}`)()(src)(window.__game!.sim.scenario, a), [inPage.toString(), fn.toString(), arg] as const);
}
