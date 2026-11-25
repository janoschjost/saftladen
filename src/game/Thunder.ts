import { random } from './rng';
import { WORLD } from '../render/World';
import type { Person } from './Person';

/** How long (s) somebody is startled by a clap of thunder (a hop and a shake, then the bubble goes). */
export const STARTLE_TIME = 1.8;
/** How close (m) to an outside wall (and its windows) somebody hears it so loud they flinch. */
const WINDOW_RANGE = 3.5;

const LINES = ['Huch!', 'Uff, das war nah!', 'Puh, was für ein Knall!', 'Hat es eingeschlagen?', 'Wow!', 'Ui!'];

/** Whether a spot is within `WINDOW_RANGE` of one of the outside walls. */
export function byOutsideWall(x: number, z: number): boolean {
  return x < WINDOW_RANGE || z < WINDOW_RANGE || x > WORLD.width - WINDOW_RANGE || z > WORLD.depth - WINDOW_RANGE;
}

/**
 * A clap of thunder (#298): everybody outdoors or by an outside wall flinches and says something (`Person.startle`). It only
 * sets the timer and the line: what the person is doing (desk, meeting, walking) is not touched. Returns who flinched.
 */
export function thunderClap(people: readonly Person[]): Person[] {
  const hit: Person[] = [];
  for (const p of people) {
    if (p.away || !(p.outdoors || byOutsideWall(p.pos.x, p.pos.z))) continue;
    p.startle = STARTLE_TIME;
    p.startleText = LINES[Math.floor(random() * LINES.length)];
    hit.push(p);
  }
  return hit;
}
