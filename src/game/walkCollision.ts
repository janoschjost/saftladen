import type { NavGrid, Vec2 } from './NavGrid';

/** Floor rectangle of a wall or a piece of furniture (a THREE.Box3 fits). */
export interface FloorBox {
  min: Vec2;
  max: Vec2;
}

/** Doorway centre and half width, game metres. */
export interface Doorway {
  x: number;
  z: number;
  r: number;
}

/** What the walk-mode player bumps into: the real wall and furniture rectangles, and the nav grid as the floor they may stand on. */
export interface WalkColliders {
  nav: NavGrid;
  boxes: FloorBox[];
  doorways: Doorway[];
}

/** How far around a doorway the nav-grid floor check is skipped: the door half width plus about a wall thickness. */
const DOOR_MARGIN = 0.3;

/**
 * Can the player's body (a circle of `radius`) stand at (x, z)?
 * Walls and furniture are tested exactly, so a 0.9 m doorway fits a 0.6 m body even where the 0.5 m nav grid
 * leaves only one free cell. The grid cell under the centre keeps the player in the building and out of sealed
 * pockets; in doorways that check is skipped, the wall rectangles are enough there.
 */
export function walkFree(x: number, z: number, radius: number, c: WalkColliders): boolean {
  for (const b of c.boxes) {
    const nx = Math.max(b.min.x, Math.min(x, b.max.x));
    const nz = Math.max(b.min.z, Math.min(z, b.max.z));
    if ((nx - x) ** 2 + (nz - z) ** 2 < radius * radius) return false;
  }
  if (c.doorways.some((d) => Math.hypot(x - d.x, z - d.z) < d.r + DOOR_MARGIN)) return true;
  const cell = c.nav.toCell({ x, z });
  return c.nav.walkable(cell.cx, cell.cz);
}
