import { expect, type Page } from '@playwright/test';

/** Every test starts from the same office: fixed seed, clock frozen at this hour. */
export const SEED = 1;
export const HOUR = 11;

/**
 * Opens the game with the read-only test hook (`?test` exposes `window.__game`, dev server only) and waits until it
 * is up: hook there, loader gone. Returns the console errors and uncaught exceptions seen so far (and later).
 */
export async function openGame(page: Page, hash = '', hour = HOUR): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?test&seed=${SEED}&time=${hour}${hash ? `#${hash}` : ''}`);
  await page.waitForFunction(() => !!window.__game);
  await expect(page.locator('#loader')).toHaveCount(0);
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

/** Waits until `fn` (run in the page against the game) returns something truthy. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function until<A = undefined>(page: Page, fn: (g: any, arg: A) => unknown, arg?: A, timeout = 20_000): Promise<void> {
  await expect.poll(() => read(page, fn, arg), { timeout }).toBeTruthy();
}

declare global {
  interface Window {
    __game?: unknown;
  }
}
