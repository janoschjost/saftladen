import type { DayCtx } from '../Day';
import type { Vec2 } from '../NavGrid';

/** `count` free floor spots spread over the whole office: each next one is (one of) the free cells farthest from the player and all earlier spots. */
export function spreadSpots(ctx: DayCtx, count: number): Vec2[] {
  const nav = ctx.nav;
  const cells: Vec2[] = [];
  for (let cz = 1; cz < nav.rows - 1; cz++) {
    for (let cx = 1; cx < nav.cols - 1; cx++) {
      let free = true;
      for (let dz = -1; dz <= 1 && free; dz++) for (let dx = -1; dx <= 1; dx++) if (!nav.walkable(cx + dx, cz + dz)) free = false;
      if (free) cells.push(nav.center(cx, cz));
    }
  }
  const chosen: Vec2[] = [];
  const anchors: Vec2[] = [{ ...ctx.person.pos }];
  for (let n = 0; n < count && cells.length; n++) {
    const scored = cells
      .map((c) => ({ c, d: Math.min(...anchors.map((a) => Math.hypot(a.x - c.x, a.z - c.z))) }))
      .sort((a, b) => b.d - a.d);
    const pick = scored[Math.floor(Math.random() * Math.min(6, scored.length))].c;
    chosen.push(pick);
    anchors.push(pick);
  }
  return chosen;
}
