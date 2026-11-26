/**
 * Whether the origin-story intro plays on load (#322). `#intro` always plays it (replay). Otherwise only once, for a
 * visitor who has not seen it: on a plain load (no query, no hash), or with `?intro=1` (its own e2e spec opts in with
 * `?test&intro=1`). Deep links, `?seed` and `?test` URLs never play it by themselves.
 */
export function shouldPlayIntro(search: string, hash: string, seen: boolean): boolean {
  if (hash === '#intro') return true;
  if (seen || hash) return false;
  return !search || new URLSearchParams(search).get('intro') === '1';
}
