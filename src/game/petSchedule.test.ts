import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { DogRig } from '../render/dogBuilder';
import { Dog } from './Dog';
import type { Person } from './Person';
import { petComesToday } from './petSchedule';
import { setSeed } from './rng';

describe('pet.schedule', () => {
  it('pet.schedule: only on its weekdays, then with its chance', () => {
    setSeed(1);
    expect(petComesToday({ days: [1, 3] }, 1)).toBe(true);
    expect(petComesToday({ days: [1, 3] }, 2)).toBe(false);
    expect(petComesToday(undefined, 6)).toBe(true);
    expect(petComesToday({ chance: 0 }, 2)).toBe(false);
    const hits = Array.from({ length: 1000 }, () => petComesToday({ chance: 0.35 }, 0)).filter(Boolean).length;
    expect(hits).toBeGreaterThan(280);
    expect(hits).toBeLessThan(420);
    expect(petComesToday({ days: [4], chance: 1 }, 4, () => 0.99)).toBe(true);
  });
});

describe('pet.owner', () => {
  const lane = { in: { x: 0, z: 1 }, out: { x: 0, z: 3 } };
  const owner = () => ({ id: 'o', pets: [] as Dog[], lane, presence: 'out' }) as unknown as Person;
  const rig = () => ({ root: new THREE.Object3D(), headHeight: 0.4 }) as unknown as DogRig;

  it('pet.owner: a pet that comes today appears together with its owner', () => {
    const o = owner();
    const dog = new Dog('Ellie', rig(), o, { x: 0, z: 0 });
    dog.sendAway();
    dog.arriveWith(o);
    expect(dog.away).toBe(false);
  });

  it('pet.schedule: a pet that stays home today does not come in with its owner', () => {
    const o = owner();
    const dog = new Dog('Ellie', rig(), o, { x: 0, z: 0 }, { visits: { days: [1, 3] } });
    dog.sendAway();
    dog.comesToday = false;
    dog.arriveWith(o);
    expect(dog.away).toBe(true);
  });
});
