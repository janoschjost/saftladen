import type { PetVisits } from '../data/types';
import { stream, type Rng } from './rng';

/** The pets' chance rolls come from a side stream of the seed: the schedule must not shift the simulation's numbers. */
const PETS = 0x9e75;
const roll = stream(PETS);

/** Does the pet come to the office today? Only on its weekdays (0 = Monday, as `TimeOfDay.weekday`; all days if none are set), and then with its chance. */
export function petComesToday(visits: PetVisits | undefined, weekday: number, rng: Rng = roll): boolean {
  if (visits?.days && !visits.days.includes(weekday)) return false;
  const chance = visits?.chance ?? 1;
  return chance >= 1 || rng() < chance;
}
