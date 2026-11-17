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
