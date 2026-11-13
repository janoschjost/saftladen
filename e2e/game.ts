import { expect, type Page } from '@playwright/test';

/** Every test starts from the same office: fixed seed, clock frozen at this hour. */
export const SEED = 1;
export const HOUR = 11;

/**
 * Opens the game with the test hook (`?test` exposes `window.__game`, dev server only; the office is not drawn unless
 * `query` has `draw`) and waits until it
 * is up: hook there, loader gone. `query` adds dev params, e.g. `event=coffee`. Returns the console errors and uncaught exceptions seen so far (and later).
 */
export async function openGame(page: Page, hash = '', hour = HOUR, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test&seed=${SEED}&time=${hour}${query ? `&${query}` : ''}${hash ? `#${hash}` : ''}`);
  // generous: CI renders WebGL in software, building the scene and the first frames take seconds there
  await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
  // faded or gone: a fading loader lets clicks through, no need to wait for the fade
  await expect(page.locator('#loader:not(.is-done)')).toHaveCount(0, { timeout: 30_000 });
  // under ?test time stands still: only `advance` (and so `until`) moves the game. One second in, everybody has made a first move.
  await page.evaluate(() => (window.__game as { advance(s: number): void }).advance(1));
  return errors;
}

/** Reads from the game. The callback runs in the page; `g` is the game with its private fields (read, don't write). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function read<T, A = undefined>(page: Page, fn: (g: any, arg: A) => T, arg?: A): Promise<T> {
  return page.evaluate(
    ([src, a]) => new Function('g', 'a', `return (${src})(g, a)`)(window.__game, a),
    [fn.toString(), arg] as const,
  ) as Promise<T>;
}

/**
 * Waits until `fn` (run in the page against the game) returns something truthy. Under `?test` the game stands still
 * between the steps of a test, so nothing changes behind its back. `timeout` is game time (ms): the game
 * is fast-forwarded half a second at a time (`advance`, no drawing) with one drawn frame in between, as poses and
 * overlays are set while drawing. So a wait takes the same number of simulation steps on a slow machine as on a fast one.
 * Returns what `fn` returned: use that instead of reading again, the game runs on in between.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function until<T, A = undefined>(page: Page, fn: (g: any, arg: A) => T, arg?: A, timeout = 20_000): Promise<NonNullable<T>> {
  const reached = await page.evaluate(
    async ([src, a, seconds]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = window.__game as any;
      const test = new Function('g', 'a', `return (${src})(g, a)`);
      for (let t = 0; ; t += 0.5) {
        await new Promise((r) => requestAnimationFrame(r));
        const value = test(g, a);
        if (value) return { value };
        if (t >= seconds) return null;
        g.advance(0.5);
      }
    },
    [fn.toString(), arg, timeout / 1000] as const,
  );
  expect(reached, `not reached within ${timeout / 1000} game seconds: ${fn.toString()}`).not.toBeNull();
  return reached!.value as NonNullable<T>;
}

/**
 * Empties the printer, the coffee machine and the kitchen: at the start somebody may already be on a coffee or print
 * errand (who depends on the seed's random draws), and an action that needs the station would say "nicht möglich".
 */
export async function freeStations(page: Page): Promise<void> {
  await read(page, (g) => {
    for (const p of g.people) {
      p.cancelPrint();
      p.cancelRun();
      p.cancelCoffee();
    }
  });
}

declare global {
  interface Window {
    __game?: unknown;
  }
}
