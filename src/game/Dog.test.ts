import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DogRig } from '../render/dogBuilder';
import { NAV_CELL, WORLD } from '../render/World';
import { Dog } from './Dog';
import { DOOR, DOOR_LANES } from './Door';
import { NavGrid } from './NavGrid';
import type { Person, Presence } from './Person';
import { setSeed } from './rng';

const STEP = 1 / 60;

/** Just what a pet reads from its owner. */
interface FakeOwner {
  id: string;
  presence: Presence;
  lane: (typeof DOOR_LANES)[number];
  pos: { x: number; z: number };
  yaw: number;
  sit: number;
  held: boolean;
  pets: Dog[];
}

/** The office floor: walkable inside, everything beyond the front wall (porch, street) is blocked. */
function office(): NavGrid {
  const nav = new NavGrid(Math.ceil(WORLD.width / NAV_CELL), Math.ceil(WORLD.depth / NAV_CELL), NAV_CELL);
  nav.blockWorld(0, DOOR.z, WORLD.width, WORLD.depth);
  return nav;
}

/** Steps the pet like the game does: update, then walkers that are not pinned get pushed back onto free floor. */
function step(dog: Dog, nav: NavGrid): void {
  dog.update(STEP, nav, [dog]);
  if (!dog.away && !dog.fixed) nav.resolve(dog.pos, 0.2);
}

describe('pet.owner', () => {
  let nav: NavGrid;
  let owner: FakeOwner;
  let dog: Dog;

  beforeEach(() => {
    setSeed(1);
    nav = office();
    const lane = DOOR_LANES[0];
    // the owner is still far inside, slowly making their way to the door
    owner = { id: 'nina', presence: 'leaving', lane, pos: { x: lane.in.x, z: 3 }, yaw: 0, sit: 0, held: false, pets: [] };
    const rig = { root: new THREE.Group(), headHeight: 0.5 } as unknown as DogRig;
    dog = new Dog('Harry', rig, owner as unknown as Person, { x: lane.in.x, z: lane.in.z - 2 });
  });

  it('pet.owner waits on the porch when it reaches the door before its owner (#72)', () => {
    let t = 0;
    while (!dog.onPorch && t < 10) {
      step(dog, nav);
      t += STEP;
    }
    expect(dog.onPorch).toBe(true);
    // the owner takes a while longer: the pet stays out there, visible, and doesn't pop back inside
    for (let i = 0; i < 20 / STEP; i++) {
      step(dog, nav);
      expect(dog.onPorch).toBe(true);
      expect(dog.away).toBe(false);
    }
    // the owner is out: both vanish together, and the pet stays gone until the owner is back
    owner.presence = 'out';
    dog.sendAway();
    for (let i = 0; i < 10 / STEP; i++) {
      step(dog, nav);
      expect(dog.away).toBe(true);
    }
  });

  it('pet.owner walks back in with the owner who changed their mind on the way out (#72)', () => {
    for (let t = 0; !dog.onPorch && t < 10; t += STEP) step(dog, nav);
    expect(dog.onPorch).toBe(true);
    owner.presence = 'in';
    for (let i = 0; i < 5 / STEP; i++) step(dog, nav);
    expect(dog.pos.z).toBeLessThan(DOOR.z);
    expect(dog.away).toBe(false);
  });
});
