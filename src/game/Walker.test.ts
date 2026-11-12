import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { NavGrid, type Vec2 } from './NavGrid';
import { setSeed } from './rng';
import { Walker } from './Walker';

/** A walker that keeps heading for its goal: whenever it stands idle it sets off again (like a person on the way to a job). */
class Goer extends Walker {
  speed = 1.2;
  radius = 0.4;
  root = new THREE.Object3D();
  headHeight = 1.7;
  constructor(
    readonly id: string,
    start: Vec2,
    readonly goal: Vec2,
  ) {
    super(start);
    this.timer = 0;
  }
  protected decide(nav: NavGrid): void {
    this.walkTo(nav, this.goal);
  }
  get arrived(): boolean {
    return Math.hypot(this.pos.x - this.goal.x, this.pos.z - this.goal.z) < 0.3;
  }
}

/** Steps two walkers like the game does: update, then keep the bodies apart and out of the walls. */
function run(nav: NavGrid, [a, b]: [Goer, Goer], seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds && !(a.arrived && b.arrived); t += dt) {
    a.update(dt, nav, [a, b]);
    b.update(dt, nav, [a, b]);
    const dx = b.pos.x - a.pos.x;
    const dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    const min = (a.radius + b.radius) * 1.1;
    if (d < min && d > 1e-6) {
      const push = ((min - d) / d) * 0.5;
      a.pos.x -= dx * push;
      a.pos.z -= dz * push;
      b.pos.x += dx * push;
      b.pos.z += dz * push;
    }
    nav.resolve(a.pos, 0.2);
    nav.resolve(b.pos, 0.2);
  }
}

describe('move.passing', () => {
  it('two walkers coming from opposite ends of a corridor to the same side door both get through (#39)', () => {
    // 2 m wide corridor running north-south (0.5 m cells, like the office), a doorway halfway down its east wall.
    // They meet nose to nose at the doorway; before #39 both backed off and stood there for good in about a third of the starts
    const stuck: string[] = [];
    for (let seed = 1; seed <= 10; seed++) {
      for (const off of [0, 0.25, 0.5, 1]) {
        setSeed(seed);
        const nav = new NavGrid(24, 24, 0.5);
        nav.block(0, 0, 24, 24);
        for (let cz = 1; cz < 23; cz++) for (let cx = 4; cx < 8; cx++) nav.unblock(cx, cz);
        for (let cx = 8; cx < 23; cx++) nav.unblock(cx, 12);
        const a = new Goer('a', { x: 3.25 + off / 2, z: 1.25 + off }, { x: 10.75, z: 6.25 });
        const b = new Goer('b', { x: 3.75, z: 11.25 }, { x: 9.75, z: 6.25 });
        run(nav, [a, b], 40);
        if (!a.arrived || !b.arrived) stuck.push(`seed ${seed}, offset ${off}`);
      }
    }
    expect(stuck).toEqual([]);
  });
});
