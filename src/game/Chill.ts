import type { Vec2 } from './NavGrid';
import type { Person } from './Person';

/** How close (m) a ghost has to come to somebody to give them the shivers. */
export const CHILL_RANGE = 0.6;
/** How long (s) somebody shivers after the ghost went through them. */
export const CHILL_TIME = 2;

/**
 * The one crossing check of Christian's ghost (#256), for the day wander and the night visit alike: everybody in the
 * office within `CHILL_RANGE` of `at` gets the shivers (a 🥶 bubble and a shake, `Person.chill`). It only sets the timer: what
 * the person is doing (desk, meeting, walking) is not touched.
 */
export function chillCrossed(people: readonly Person[], at: Vec2): void {
  for (const p of people) {
    if (p.away || Math.hypot(p.pos.x - at.x, p.pos.z - at.z) > CHILL_RANGE) continue;
    p.chill = CHILL_TIME; // standing in him keeps the shiver going
  }
}
