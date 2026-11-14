import { describe, expect, it } from 'vitest';
import { Goer, separate } from '../test/goer';
import { NavGrid } from './NavGrid';
import { setSeed } from './rng';
import { Traffic } from './Traffic';

/** Steps two walkers like the game does: traffic (passages), update, then keep the bodies apart and out of the walls. */
function run(nav: NavGrid, [a, b]: [Goer, Goer], seconds: number): void {
  const dt = 1 / 60;
  const traffic = new Traffic(nav);
  a.traffic = b.traffic = traffic;
  for (let t = 0; t < seconds && !(a.arrived && b.arrived); t += dt) {
    traffic.update(dt, [a, b]);
    a.update(dt, nav, [a, b]);
    b.update(dt, nav, [a, b]);
    separate(nav, [a, b]);
  }
}

describe('move.passing', () => {
  it('move.passing: two walkers coming from opposite ends of a corridor to the same side door both get through (#39)', () => {
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

/** A body that just stands there (somebody waiting, chatting, sitting a pet out). */
class Stander extends Goer {
  protected override decide(): void {}
}

describe('move.passing (ORCA)', () => {
  it('move.passing two walking head-on on open floor pass each other without stopping and without touching', () => {
    for (let seed = 1; seed <= 10; seed++) {
      setSeed(seed);
      const nav = new NavGrid(30, 12, 0.5); // 15 × 6 m of open floor
      const a = new Goer('a', { x: 1.25, z: 3.25 + (seed % 3) * 0.05 }, { x: 13.75, z: 3.25 });
      const b = new Goer('b', { x: 13.75, z: 3.25 }, { x: 1.25, z: 3.25 });
      let closest = Infinity;
      let slowest = Infinity;
      const dt = 1 / 60;
      for (let t = 0; t < 20 && !(a.arrived && b.arrived); t += dt) {
        const pa = { ...a.pos };
        a.update(dt, nav, [a, b]);
        b.update(dt, nav, [a, b]);
        closest = Math.min(closest, Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z));
        if (t > 0.5 && !a.arrived) slowest = Math.min(slowest, Math.hypot(a.pos.x - pa.x, a.pos.z - pa.z) / dt);
      }
      expect(a.arrived && b.arrived, `seed ${seed}`).toBe(true);
      expect(closest, `seed ${seed}`).toBeGreaterThan((a.radius + b.radius) * 0.95);
      expect(slowest, `seed ${seed}`).toBeGreaterThan(a.speed * 0.1); // slows down to pass, never stops
    }
  });

  it('move.passing a walker squeezes past somebody standing in a doorway only one fits through', () => {
    setSeed(1);
    // two 4 × 4 m rooms, a wall between them with a doorway one cell (0.5 m) wide, somebody standing in it
    const nav = new NavGrid(17, 8, 0.5);
    nav.block(8, 0, 1, 8);
    nav.unblock(8, 4);
    const walker = new Goer('w', { x: 1.25, z: 2.25 }, { x: 7.25, z: 2.25 });
    const stander = new Stander('s', { x: 4.25, z: 2.25 }, { x: 4.25, z: 2.25 });
    run(nav, [walker, stander], 15);
    expect(walker.arrived, `walker ${walker.pos.x.toFixed(2)},${walker.pos.z.toFixed(2)}`).toBe(true);
  });
});

describe('move.passages', () => {
  it('move.passages two going the same way reach a doorway together: the second waits beside the entrance until the first is through, both get there', () => {
    for (let seed = 1; seed <= 5; seed++) {
      setSeed(seed);
      // two 4 × 4 m rooms, between them a doorway one cell wide and two cells (1 m) deep
      const nav = new NavGrid(18, 8, 0.5);
      nav.block(8, 0, 2, 8);
      nav.unblock(8, 4);
      nav.unblock(9, 4);
      const a = new Goer('a', { x: 2.75, z: 1.25 }, { x: 7.25, z: 1.25 });
      const b = new Goer('b', { x: 2.75, z: 3.25 }, { x: 7.25, z: 3.25 });
      const traffic = new Traffic(nav);
      a.traffic = b.traffic = traffic;
      const door = traffic.passages.at({ x: 4.25, z: 2.25 });
      expect(door).toBeGreaterThanOrEqual(0);
      let both = 0;
      let waited = 0;
      const dt = 1 / 60;
      for (let t = 0; t < 20 && !(a.arrived && b.arrived); t += dt) {
        traffic.update(dt, [a, b]);
        a.update(dt, nav, [a, b]);
        b.update(dt, nav, [a, b]);
        if (traffic.passages.at(a.pos) === door && traffic.passages.at(b.pos) === door) both++;
        if (a.yielding || b.yielding) waited++; // waiting at the passage, out of its lane
      }
      expect(a.arrived && b.arrived, `seed ${seed}`).toBe(true);
      expect(both, `seed ${seed}: steps both were in the doorway`).toBe(0);
      expect(waited, `seed ${seed}: steps the second one waited beside the entrance`).toBeGreaterThan(0);
    }
  });
});
