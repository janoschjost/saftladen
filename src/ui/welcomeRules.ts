import type { Rng } from '../game/rng';

/** "Geschäftsleitung" and the spelling "Geschäftleitung" both occur in the team data. */
const GL_ROLE = /gesch(ä|ae)fts?leitung/i;

/** Team members who can greet the visitor: Geschäftsleitung with a portrait (data-driven, no names in code). */
export function greeters<T extends { role: string; portrait: string | null }>(team: readonly T[]): T[] {
  return team.filter((m) => m.portrait && GL_ROLE.test(m.role));
}

/** One random greeter per visit, or null when nobody qualifies. */
export function pickGreeter<T extends { role: string; portrait: string | null }>(team: readonly T[], rng: Rng): T | null {
  const list = greeters(team);
  return list.length ? list[Math.floor(rng() * list.length)] : null;
}

/**
 * Whether the welcome card shows on load. `#welcome` always shows it (replay); `?test` and `?welcome=0` never do
 * (so the e2e specs are not blocked), except `?test&welcome=1`, which the card's own spec opts in with; otherwise only a
 * visitor who has not dismissed it before sees it.
 */
export function shouldShowWelcome(search: string, hash: string, seen: boolean): boolean {
  if (hash === '#welcome') return true;
  const q = new URLSearchParams(search);
  if ((q.has('test') && q.get('welcome') !== '1') || q.get('welcome') === '0') return false;
  return !seen;
}
