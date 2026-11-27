/**
 * Whether the origin-story intro plays on load (#322). `#intro` always plays it (replay). Otherwise only once, for a
 * visitor who has not seen it: on a plain load (no query, no hash), or with `?intro=1` (its own e2e spec opts in with
 * `?test&intro=1`). Deep links, `?seed` and `?test` URLs never play it by themselves. René's mail link (`?rene`, #333)
 * plays it once more with his greeting, also for somebody who has seen it (`greeted`: that link was used before).
 */
export function shouldPlayIntro(search: string, hash: string, seen: boolean, greeted = true): boolean {
  if (hash === '#intro') return true;
  const query = new URLSearchParams(search);
  if (shouldGreet(search, greeted)) return !query.has('test') || query.get('intro') === '1';
  if (seen || hash) return false;
  return !search || query.get('intro') === '1';
}

/** René greets in front of the story: the address carries `rene` and this browser has not been greeted yet. */
export function shouldGreet(search: string, greeted: boolean): boolean {
  return !greeted && new URLSearchParams(search).has('rene');
}

/** The query without the `rene` marker (the rest as it was written), for the address once the greeting has started. */
export function withoutGreeting(search: string): string {
  const rest = search
    .replace(/^\?/, '')
    .split('&')
    .filter((part) => part && part.split('=')[0] !== 'rene');
  return rest.length ? `?${rest.join('&')}` : '';
}
