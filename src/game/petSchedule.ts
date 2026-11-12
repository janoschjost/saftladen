import type { PetVisits } from '../data/types';
import { random, type Rng } from './rng';

/** Does the pet come to the office today? Only on its weekdays (0 = Monday, as `TimeOfDay.weekday`; all days if none are set), and then with its chance. */
export function petComesToday(visits: PetVisits | undefined, weekday: number, rng: Rng = random): boolean {
  if (visits?.days && !visits.days.includes(weekday)) return false;
  const chance = visits?.chance ?? 1;
  return chance >= 1 || rng() < chance;
}
