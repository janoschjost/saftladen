import type { AwayEntry } from '../ui/Roster';
import type { Person } from './Person';

/** The name a row shows (Marco walking out as Kurt is "Kurt"). */
export const shownName = (name: string) => name.split(' ')[0];

/** One row of the "not in the office" list per person, alphabetical by the name shown, whatever the reason they are out. */
export function rosterEntries(people: readonly Person[], portraitOf: (p: Person) => string | null): AwayEntry[] {
  return people
    .map((p) => ({
      id: p.id,
      name: p.displayName,
      portrait: portraitOf(p),
      kind: p.awayKind === 'home' || p.awayKind === 'smoke' || p.awayKind === 'off' ? p.awayKind : ('errand' as const),
      phase: p.presence === 'leaving' ? ('leave' as const) : p.presence === 'returning' ? ('return' as const) : ('out' as const),
      left: p.awayLeft,
    }))
    .sort((a, b) => shownName(a.name).localeCompare(shownName(b.name), 'de') || a.name.localeCompare(b.name, 'de'));
}
