import * as THREE from 'three';
import type { NavGrid } from './NavGrid';
import { WALL_CLEARANCE } from './Avoidance';
import { Dog } from './Dog';
import type { Walker } from './Walker';

/** `a` is a pet that `b` strokes right now (the two of one stroke still keep apart). */
function strokes(a: Walker, b: Walker): boolean {
  return a instanceof Dog && a.petted?.by === b;
}

/** how firmly a walker holds its ground when two overlap (`separate`): the higher one is not pushed */
const STEADY = 2;
const rank = (w: Walker): number => (w.held ? 3 : w.steady ? STEADY : w.rightOfWay ? 1 : 0);

/** Soft collision: push overlapping walkers apart and keep them on the floor (`width` x `depth` metres, by default the grid's). */
export function separate(ws: readonly Walker[], nav: NavGrid, width = nav.cols * nav.cell, depth = nav.rows * nav.cell): void {
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i];
      const b = ws[j];
      if (a.away || b.away || a.ignores(b) || a.fixed || b.fixed) continue;
      let dx = b.pos.x - a.pos.x;
      let dz = b.pos.z - a.pos.z;
      const min = (a.radius + b.radius) * 1.1;
      let d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      if (d2 < 1e-8) {
        // exactly on top of each other (same destination spot): part them in a fixed direction per pair
        dx = Math.cos(i * 2.4 + j) * 1e-3;
        dz = Math.sin(i * 2.4 + j) * 1e-3;
        d2 = dx * dx + dz * dz;
      }
      const d = Math.sqrt(d2);
      const push = ((min - d) / d) * 0.5;
      // who gives way: the walker the player drags never, then whoever holds their ground (a stroke), then whoever has
      // right of way (on the phone, `Walker.rightOfWay`); equals part evenly
      const ra = rank(a);
      const rb = rank(b);
      if (ra === STEADY && rb === STEADY && !strokes(a, b) && !strokes(b, a)) continue; // two strokes side by side: neither leaves the spot
      const wa = ra > rb ? 0 : ra < rb ? 2 : 1;
      const wb = rb > ra ? 0 : rb < ra ? 2 : 1;
      a.pos.x -= dx * push * wa;
      a.pos.z -= dz * push * wa;
      b.pos.x += dx * push * wb;
      b.pos.z += dz * push * wb;
    }
  }
  for (const w of ws) {
    if (w.away || w.fixed) continue; // scripted walkers (door, desk) move through walls on purpose
    w.pos.x = THREE.MathUtils.clamp(w.pos.x, 0.4, width - 0.4);
    w.pos.z = THREE.MathUtils.clamp(w.pos.z, 0.4, depth - 0.4);
    // walls, windows and furniture are solid (seated people are scripted into their chair and skip this)
    if (!w.held) nav.resolve(w.pos, Math.min(w.radius, WALL_CLEARANCE));
  }
}
