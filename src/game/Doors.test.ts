import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DOOR_SWING, type DoorRig } from '../render/officeModel';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { Doors } from './Doors';
import { setSeed } from './rng';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** The slice of a door's state the tests look at (`Doors` keeps it private; `pivot` is what the player sees). */
type DoorState = { rig: DoorRig; open: number; rest: number; hold: number; reroll: number; locked: boolean };
const statesOf = (doors: Doors): DoorState[] => (doors as unknown as { states: DoorState[] }).states;

const rig = (x: number, z: number): DoorRig => ({
  pivot: new THREE.Group(),
  base: 0,
  swing: 1,
  center: { x, z },
  width: 0.9,
  height: 2.1,
});
/** How far the leaf stands open on screen: 0 shut, 1 wide open. */
const swung = (r: DoorRig): number => (r.pivot.rotation.y - r.base) / (r.swing * DOOR_SWING);

/** One door at the origin, resting shut for good (nobody rerolls it), nobody near. */
function oneDoor(): { doors: Doors; door: DoorState; rig: DoorRig; step: (secs: number, at?: Array<{ x: number; z: number }>) => void } {
  setSeed(1);
  const r = rig(0, 0);
  const doors = new Doors([r]);
  const door = statesOf(doors)[0];
  door.rest = 0;
  door.open = 0;
  door.reroll = 1e9;
  const step = (secs: number, at: Array<{ x: number; z: number }> = []) => {
    for (let t = 0; t < secs - 1e-9; t += STEP) doors.update(STEP, at);
  };
  return { doors, door, rig: r, step };
}

describe('doors', () => {
  beforeEach(() => setSeed(1));

  it('door.auto: a door swings open when somebody comes within 1.25 m', () => {
    const { rig, step } = oneDoor();
    step(2, [{ x: 1.4, z: 0 }]); // just outside
    expect(swung(rig)).toBeLessThan(0.01);
    step(2, [{ x: 1.2, z: 0 }]); // just inside
    expect(swung(rig)).toBeGreaterThan(0.95);
  });

  it('door.auto: it stays open about 0.9 s after the last person left, then closes again', () => {
    const { door, rig, step } = oneDoor();
    step(2, [{ x: 0.5, z: 0 }]);
    expect(swung(rig)).toBeGreaterThan(0.95);
    step(0.8); // still within the hold: kept open
    expect(door.hold).toBeGreaterThan(0);
    expect(swung(rig)).toBeGreaterThan(0.95);
    step(0.2); // hold over (0.9 s): starts to close
    expect(door.hold).toBe(0);
    step(0.3);
    expect(swung(rig)).toBeLessThan(0.95);
    step(4);
    expect(swung(rig)).toBeLessThan(0.01);
  });

  it('door.auto: whoever keeps standing there keeps the door open', () => {
    const { rig, step } = oneDoor();
    step(10, [{ x: 0.5, z: 0.5 }]);
    expect(swung(rig)).toBeGreaterThan(0.95);
  });

  it('door.rest: with nobody around a door rests closed, ajar or propped open, rerolled every 30-120 s', () => {
    const doors = new Doors(Array.from({ length: 12 }, (_, i) => rig(i * 5, 0)));
    const rests = new Set<number>();
    const gaps: number[] = [];
    const last = new Map<DoorState, number>();
    for (let t = 0; t < 1200; t += STEP) {
      doors.update(STEP, []);
      for (const s of statesOf(doors)) {
        rests.add(s.rest);
        const before = last.get(s);
        if (before !== undefined && s.reroll > before) gaps.push(s.reroll); // the timer jumped up: a reroll
        last.set(s, s.reroll);
      }
    }
    expect([...rests].sort((a, b) => a - b)).toEqual([0, 0.3, 1]);
    expect(gaps.length).toBeGreaterThan(50);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(30);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(120);
    // and the leaf follows the rest position
    for (const s of statesOf(doors)) expect(swung(s.rig)).toBeCloseTo(s.rest, 1);
  });

  describe('door.player', () => {
    // the player stands 1.5 m south of the door and looks north (+z) at it
    const look = (doors: Doors) => doors.facing(0, -1.5, 0, 1);

    it('door.player: the player toggles the door they face, and the choice holds', () => {
      const { doors, rig, step } = oneDoor();
      look(doors)!.toggle();
      step(3);
      expect(swung(rig)).toBeGreaterThan(0.95);
      expect(look(doors)!.open).toBe(true);
      step(50); // `door.rest` would reroll it any time before: it does not undo the choice right away
      expect(swung(rig)).toBeGreaterThan(0.95);
      look(doors)!.toggle();
      step(3);
      expect(swung(rig)).toBeLessThan(0.01);
      expect(look(doors)!.open).toBe(false);
    });

    it('door.player: only the door in front of them, within reach', () => {
      const { doors } = oneDoor();
      expect(doors.facing(0, -1.5, 0, -1)).toBeNull(); // looking away
      expect(doors.facing(0, -3, 0, 1)).toBeNull(); // too far
      expect(doors.facing(0, -1.5, 0, 1)).not.toBeNull();
    });

    it('door.player: people walking through still push it open', () => {
      const { doors, rig, step } = oneDoor();
      look(doors)!.toggle(); // chose open
      step(3);
      look(doors)!.toggle(); // and shut again
      step(3);
      expect(swung(rig)).toBeLessThan(0.01);
      step(2, [{ x: 0, z: 0.5 }]);
      expect(swung(rig)).toBeGreaterThan(0.95);
    });
  });

  it('door.lock: a locked door stays shut even with somebody next to it, and opens again once released', () => {
    const { doors, rig, step } = oneDoor();
    doors.setLocked({ x: 0, z: 0.3 }, true);
    step(3, [{ x: 0.2, z: 0 }]);
    expect(swung(rig)).toBeLessThan(0.01);
    expect(doors.facing(0, -1.5, 0, 1)!.locked).toBe(true);
    doors.facing(0, -1.5, 0, 1)!.toggle(); // the player cannot open it either
    step(3);
    expect(swung(rig)).toBeLessThan(0.01);
    doors.setLocked({ x: 0, z: 0.3 }, false);
    step(3, [{ x: 0.2, z: 0 }]);
    expect(swung(rig)).toBeGreaterThan(0.95);
  });
});

/** The door of the real office nearest to `at`. */
const doorAt = (sim: Sim, at: { x: number; z: number }): DoorState =>
  statesOf(sim.doors).reduce((a, b) => (Math.hypot(a.rig.center.x - at.x, a.rig.center.z - at.z) <= Math.hypot(b.rig.center.x - at.x, b.rig.center.z - at.z) ? a : b));

function crew(sim: Sim, ...ids: string[]): Person[] {
  const people = ids.map((id) => {
    sim.scenario.put(id, 'desk', 'stay');
    return sim.people.find((p) => p.id === id)!;
  });
  people.forEach((p) => sim.drop(p));
  return people;
}

describe('door.lock in the office', () => {
  it('door.lock: the meeting room door is locked while a meeting is on and open to people again afterwards', () => {
    const sim = office();
    const door = doorAt(sim, sim.meetingRoom.doorPos);
    expect(door.locked).toBe(false);
    sim.meetingRoom.start(crew(sim, ...GROUP.slice(0, 3)), sim.nav);
    expect(run(sim, 120, () => door.locked)).toBe(true);
    expect(run(sim, 20, () => false)).toBe(false);
    expect(door.locked).toBe(true);
    expect(swung(door.rig)).toBeLessThan(0.01);
    expect(run(sim, 900, () => !door.locked)).toBe(true);
  });

  it('door.lock: the phone booth door is locked while somebody is on a call and released afterwards', () => {
    const sim = office();
    const door = doorAt(sim, sim.phoneBooth.doorPos);
    const [p] = crew(sim, 'oscar-grob');
    expect(sim.phoneBooth.start(p, sim.nav)).toBeTruthy();
    expect(run(sim, 120, () => sim.phoneBooth.current?.calling && door.locked)).toBe(true);
    run(sim, 3); // the leaf swings shut
    expect(swung(door.rig)).toBeLessThan(0.01);
    expect(run(sim, 900, () => !door.locked)).toBe(true);
  });

  it('door.lock: a toilet cabin door is locked while somebody sits on the toilet and released afterwards', () => {
    const sim = office();
    sim.scenario.clear('wc');
    const [p] = crew(sim, 'oscar-grob');
    expect(sim.toilets.go(p, sim.nav)).toBe('cabin');
    const cabin = sim.toilets.cabins.find((c) => c.session?.person === p)!;
    const door = doorAt(sim, cabin.doorPos);
    expect(door.locked).toBe(false); // on the way in
    expect(run(sim, 120, () => cabin.session?.seated && door.locked)).toBe(true);
    expect(run(sim, 600, () => !door.locked)).toBe(true);
    expect(cabin.session?.seated).toBeFalsy();
  });
});
