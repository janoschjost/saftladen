import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DogRig } from '../render/dogBuilder';
import { Dog } from './Dog';
import { NavGrid, type Vec2 } from './NavGrid';
import { Passages } from './Passages';
import type { Person } from './Person';
import { Traffic } from './Traffic';
import { Walker } from './Walker';
import { inLane, lieSpot } from './petSpot';
import { setSeed } from './rng';

const CELL = 0.5;
const at = (cx: number, cz: number): Vec2 => ({ x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL });

/**
 * An open room (0.5 m cells, like the office) with two desks side by side and a 1 m gap between them: the gap is a passage.
 * The owner sits at the left desk, right beside the gap.
 */
function office(): { nav: NavGrid; passages: Passages; seat: Vec2 } {
  const nav = new NavGrid(20, 16, CELL);
  nav.block(4, 4, 4, 2); // desk A: cells x 4..7, z 4..5
  nav.block(10, 4, 4, 2); // desk B: cells x 10..13, z 4..5 -> gap x 8..9
  const passages = new Passages(nav);
  return { nav, passages, seat: at(7, 6) };
}

function seatedOwner(pos: Vec2, yaw: number): Person {
  return { id: 'owner', pos: { ...pos }, yaw, sit: 1, presence: 'in', pets: [] } as unknown as Person;
}

function pet(owner: Person, start: Vec2, side: 1 | -1, traffic: Traffic, cat = false): Dog {
  const rig = { root: new THREE.Object3D(), headHeight: 0.5 } as unknown as DogRig;
  const dog = cat ? new Dog('Binx', rig, owner, start, { side, label: 'Bürokatze', speed: 1.9, radius: 0.22 }) : new Dog('Tala', rig, owner, start, { side });
  dog.traffic = traffic;
  return dog;
}

/** Steps the bodies like the game does (traffic, update, keep them out of walls). */
function run(nav: NavGrid, traffic: Traffic, walkers: Walker[], seconds: number, until?: () => boolean): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds && !until?.(); t += dt) {
    traffic.update(dt, walkers);
    for (const w of walkers) w.update(dt, nav, walkers);
    for (let i = 0; i < walkers.length; i++) {
      for (let j = i + 1; j < walkers.length; j++) {
        const a = walkers[i];
        const b = walkers[j];
        if (a.ignores(b)) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = a.radius + b.radius;
        if (d < min && d > 1e-6) {
          const push = ((min - d) / d) * 0.5;
          a.pos.x -= dx * push;
          a.pos.z -= dz * push;
          b.pos.x += dx * push;
          b.pos.z += dz * push;
        }
      }
    }
    for (const w of walkers) nav.resolve(w.pos, 0.2);
  }
}

/** A walker that heads for its goal; can be told it is held up. */
class Goer extends Walker {
  speed = 1.2;
  radius = 0.4;
  root = new THREE.Object3D();
  headHeight = 1.7;
  heldUp = false;
  constructor(
    readonly id: string,
    start: Vec2,
    readonly goal: Vec2,
  ) {
    super(start);
    this.timer = 0;
  }
  override get stuck(): boolean {
    return this.heldUp || super.stuck;
  }
  protected decide(nav: NavGrid): void {
    this.walkTo(nav, this.goal);
  }
  get arrived(): boolean {
    return Math.hypot(this.pos.x - this.goal.x, this.pos.z - this.goal.z) < 0.3;
  }
}

describe('pet.make-way', () => {
  it('the lying spot beside a seated owner is never inside a passage, but close to the owner', () => {
    const { nav, passages, seat } = office();
    const passageAt = (p: Vec2) => passages.at(p);
    expect(passageAt(at(8, 5))).toBeGreaterThanOrEqual(0); // the gap between the desks is a passage
    let wouldHaveBlocked = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const ideal = { x: seat.x + Math.sin(a) * 0.9, z: seat.z + Math.cos(a) * 0.9 };
      const plain = nav.nearestWalkable(ideal);
      if (plain && passageAt(plain) >= 0) wouldHaveBlocked++;
      const spot = lieSpot(nav, passageAt, seat, ideal, 1.6);
      expect(spot).not.toBeNull();
      expect(passageAt(spot!)).toBe(-1);
      expect(Math.hypot(spot!.x - seat.x, spot!.z - seat.z)).toBeLessThanOrEqual(1.6);
    }
    expect(wouldHaveBlocked).toBeGreaterThan(0); // the old heel spot did end up in the gap
  });

  it('a pet (dog or cat) that starts in the gap walks out of it and lies down beside its seated owner', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const [side, cat] of [[1, false], [-1, false], [1, true], [-1, true]] as const) {
        setSeed(seed);
        const { nav, seat } = office();
        const traffic = new Traffic(nav);
        const owner = seatedOwner(seat, Math.PI); // facing the desk
        const dog = pet(owner, at(8, 5), side, traffic, cat);
        expect(dog.isCat).toBe(cat);
        run(nav, traffic, [dog], 8);
        expect(traffic.passages.at(dog.pos)).toBe(-1);
        expect(dog.lie).toBeGreaterThan(0.5);
        expect(dog.obstacle).toBe(true);
        expect(Math.hypot(dog.pos.x - seat.x, dog.pos.z - seat.z)).toBeLessThanOrEqual(1.8);
      }
    }
  });

  it('routes detour around a lying pet when there is another way, and still lead past it when there is none', () => {
    setSeed(1);
    // a 1.5 m wide aisle (3 cells) and a second one further down, joined at both ends
    const nav = new NavGrid(20, 12, CELL);
    nav.block(2, 3, 16, 5); // block between the two aisles: aisle 1 = z 0..2, aisle 2 = z 8..11
    const traffic = new Traffic(nav);
    const owner = seatedOwner(at(10, 0), 0);
    const dog = pet(owner, at(10, 1), 1, traffic);
    dog.lie = 1;
    traffic.update(1, [dog]);
    const path = traffic.route(new Goer('w', at(0, 1), at(19, 1)), at(19, 1), 0);
    expect(path.length).toBeGreaterThan(0);
    for (const p of path) expect(Math.hypot(p.x - dog.pos.x, p.z - dog.pos.z)).toBeGreaterThan(0.7);
    // seal the other aisle: the only way leads past the pet
    nav.block(0, 8, 20, 4);
    traffic.update(1, [dog]);
    const only = traffic.route(new Goer('w', at(0, 1), at(19, 1)), at(19, 1), 0);
    expect(only.length).toBeGreaterThan(0);
  });

  it('a lying pet gets up and moves off the route of somebody it holds up', () => {
    setSeed(3);
    const { nav, seat } = office();
    const traffic = new Traffic(nav);
    const owner = seatedOwner(seat, Math.PI);
    const dog = pet(owner, at(6, 7), 1, traffic);
    run(nav, traffic, [dog], 6);
    expect(dog.lie).toBeGreaterThan(0.5);
    const lay = { ...dog.pos };
    // somebody wants to walk straight through where the pet lies and is held up by it
    const w = new Goer('w', { x: lay.x - 1.2, z: lay.z }, { x: lay.x + 3, z: lay.z });
    w.walkTo(nav, w.goal);
    w.path = [{ x: lay.x, z: lay.z }, w.goal];
    w.heldUp = true;
    dog.update(1 / 60, nav, [dog, w]);
    expect(dog.state).toBe('walk');
    const target = dog.path[dog.path.length - 1];
    expect(inLane(target, dog.radius, w.pos, w.path, w.radius + 0.1)).toBe(false);
    expect(traffic.passages.at(target)).toBe(-1);
  });

  it('nobody waits for a lying pet in a 1.5 m aisle: the walker gets through', () => {
    for (let seed = 1; seed <= 5; seed++) {
      setSeed(seed);
      // one 1.5 m aisle (3 cells) between two long desks, owner seated at its end
      const nav = new NavGrid(24, 9, CELL);
      nav.block(0, 0, 24, 3);
      nav.block(0, 6, 24, 3);
      nav.unblock(12, 6); // the owner's chair niche
      const traffic = new Traffic(nav);
      const owner = seatedOwner(at(12, 6), 0);
      const dog = pet(owner, at(12, 4), 1, traffic);
      run(nav, traffic, [dog], 5);
      dog.lie = 1;
      const w = new Goer('w', at(1, 4), at(22, 4));
      run(nav, traffic, [dog, w], 30, () => w.arrived);
      expect(w.arrived, `seed ${seed}`).toBe(true);
    }
  });
});
