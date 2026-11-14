import * as THREE from 'three';
import type { NavGrid, Vec2 } from '../game/NavGrid';
import { Walker } from '../game/Walker';

/** A walker that keeps heading for its goal: whenever it stands idle it sets off again (like a person on the way to a job). */
export class Goer extends Walker {
  speed = 1.2;
  radius = 0.4;
  root = new THREE.Object3D();
  headHeight = 1.7;
  /** `reach`: metres from the goal that count as there (bodies pushing each other about can keep it off the exact spot) */
  constructor(
    readonly id: string,
    start: Vec2,
    readonly goal: Vec2,
    readonly reach = 0.3,
  ) {
    super(start);
    this.timer = 0;
  }
  protected decide(nav: NavGrid): void {
    this.walkTo(nav, this.goal);
  }
  get arrived(): boolean {
    return Math.hypot(this.pos.x - this.goal.x, this.pos.z - this.goal.z) < this.reach;
  }
}

/** Keeps the bodies apart and out of the walls, like `Sim.separate` after each step (without its held / steady / fixed cases). */
export function separate(nav: NavGrid, ws: readonly Walker[]): void {
  for (let i = 0; i < ws.length; i++) {
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i];
      const b = ws[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (a.radius + b.radius) * 1.1;
      if (d >= min || d < 1e-6) continue;
      const push = ((min - d) / d) * 0.5;
      a.pos.x -= dx * push;
      a.pos.z -= dz * push;
      b.pos.x += dx * push;
      b.pos.z += dz * push;
    }
  }
  for (const w of ws) nav.resolve(w.pos, 0.2);
}
