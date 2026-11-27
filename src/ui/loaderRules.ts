/** The start loader stays at least this long, so it does not flicker when everything is there at once. */
export const LOADER_MIN_MS = 2000;

/**
 * How much longer the loader must show once the game is loaded, `elapsedMs` after the page started. 0: it may go now.
 * `test` (the e2e pages, `?test`) skips the minimum, so the tests do not get slower.
 */
export function loaderWaitMs(elapsedMs: number, test: boolean, minMs = LOADER_MIN_MS): number {
  return test ? 0 : Math.max(0, minMs - elapsedMs);
}
