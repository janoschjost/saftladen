import type { ScreenKind } from '../render/screens';
import type { TeamMember } from './types';

/** What kind of work a role does on the computer. */
export function screenKindOf(role: string): ScreenKind {
  const r = role.toLowerCase();
  if (/social|content/.test(r)) return 'media';
  if (/develop|engineer|support/.test(r)) return 'code';
  if (/grafik|design|kreativ|media/.test(r)) return 'design';
  if (/buchhaltung|administration/.test(r)) return 'sheet';
  if (/beratung|marketing|leitung|partner/.test(r)) return 'data';
  return 'docs';
}

/** Stable per-person number (so the same dev keeps their favourite editor theme). */
export function screenSeed(m: Pick<TeamMember, 'id'>): number {
  let h = 2166136261;
  for (const ch of m.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
