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
 * Whether the welcome card shows on load. Off by default (#319): a visitor lands straight in the office. `#welcome`
 * always shows it (replay); `?welcome=1` opts in to the first-visit card, which shows until it was dismissed once
 * (the card's own e2e spec uses it with `?test`).
 */
export function shouldShowWelcome(search: string, hash: string, seen: boolean): boolean {
  if (hash === '#welcome') return true;
  return new URLSearchParams(search).get('welcome') === '1' && !seen;
}
