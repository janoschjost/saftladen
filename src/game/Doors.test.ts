import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DOOR_SWING, type DoorRig } from '../render/officeModel';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { Doors, type DoorState, type Sight } from './Doors';
import { setSeed } from './rng';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

const statesOf = (doors: Doors): readonly DoorState[] => doors.states;

/** The leaf's hinge side and rest angle as the model gives them: the office has both swings and non-zero bases. */
type Hinge = { swing: 1 | -1; base: number };
const HINGES: Hinge[] = [
  { swing: 1, base: 0 },
  { swing: -1, base: 1.2 },
];

const rig = (x: number, z: number, { swing, base }: Hinge = HINGES[0]): DoorRig => ({
  pivot: new THREE.Group(),
  base,
  swing,
  center: { x, z },
  width: 0.9,
  height: 2.1,
});
/** How far the leaf stands open on screen: 0 shut, 1 wide open. */
const swung = (r: DoorRig): number => (r.pivot.rotation.y - r.base) / (r.swing * DOOR_SWING);

/** One door at the origin, resting shut for good (nobody rerolls it), nobody near. */
function oneDoor(hinge?: Hinge): {
  doors: Doors;
  door: DoorState;
  rig: DoorRig;
  step: (secs: number, at?: Sight[]) => void;
} {
  setSeed(1);
  const r = rig(0, 0, hinge);
  const doors = new Doors([r]);
  const door = statesOf(doors)[0];
  door.rest = 0;
  door.open = 0;
  door.reroll = 1e9;
  const step = (secs: number, at: Sight[] = []) => {
    for (let t = 0; t < secs - 1e-9; t += STEP) doors.update(STEP, at);
  };
  return { doors, door, rig: r, step };
}

describe('doors', () => {
  for (const hinge of HINGES) {
    it(`door.auto: a door swings open when somebody comes within 1.25 m (swing ${hinge.swing}, base ${hinge.base})`, () => {
      const { rig, step } = oneDoor(hinge);
      step(2, [{ x: 1.4, z: 0 }]); // just outside
      expect(swung(rig)).toBeLessThan(0.01);
      step(2, [{ x: 1.2, z: 0 }]); // just inside
      expect(swung(rig)).toBeGreaterThan(0.95);
      expect(Math.sign(rig.pivot.rotation.y - rig.base)).toBe(hinge.swing); // swings to its own side
    });

    it(`door.auto: it stays open about 0.9 s after the last person left, then closes again (swing ${hinge.swing}, base ${hinge.base})`, () => {
      const { door, rig, step } = oneDoor(hinge);
      step(2, [{ x: 0.5, z: 0 }]);
      expect(swung(rig)).toBeGreaterThan(0.99);
      step(0.85); // still within the hold: kept open
      expect(door.hold).toBeGreaterThan(0);
      expect(swung(rig)).toBeGreaterThan(0.99);
      step(0.1); // 0.95 s: the hold is over
      expect(door.hold).toBe(0);
      const before = swung(rig);
      step(0.3);
      expect(swung(rig)).toBeLessThan(before); // and the leaf has started to close
      step(4);
      expect(swung(rig)).toBeLessThan(0.01);
    });
  }

  describe('door.auto: only for somebody whose route goes through the doorway', () => {
    // the door at the origin sits in a wall along x (base 0): the doorway is z = 0, |x| <= 0.45
    it('door.auto: a route across the doorway opens the door, entering and leaving alike', () => {
      for (const [from, to] of [
        [
          { x: 0, z: -1 },
          { x: 0, z: 2 },
        ],
        [
          { x: 0, z: 1 },
          { x: 0, z: -2 },
        ],
      ]) {
        const { rig, step } = oneDoor();
        step(2, [{ ...from, path: [to] }]);
        expect(swung(rig)).toBeGreaterThan(0.95);
      }
    });

    it('door.auto: the same distance along the corridor does not open it', () => {
      const { rig, step } = oneDoor();
      step(3, [{ x: -1, z: -0.6, path: [{ x: 1, z: -0.6 }] }]); // passes 0.6 m from the door centre, on one side of the wall
      expect(swung(rig)).toBeLessThan(0.01);
      step(3, [{ x: 0.3, z: -0.6, path: [] }]); // standing near it without going anywhere
      expect(swung(rig)).toBeLessThan(0.01);
      step(3, [
        {
          x: -1,
          z: -0.6,
          path: [
            { x: 0, z: -0.6 },
            { x: 2, z: 0.8 },
          ],
        },
      ]); // it crosses the wall line at x = 0.86 m, outside the doorway
      expect(swung(rig)).toBeLessThan(0.01);
    });

    it('door.auto: a long sparse route that crosses the doorway opens it once within 1.25 m', () => {
      const { rig, step } = oneDoor();
      step(2, [{ x: 0.1, z: -1.2, path: [{ x: 0, z: 6 }] }]);
      expect(swung(rig)).toBeGreaterThan(0.95);
      const far = oneDoor();
      far.step(2, [{ x: 0.1, z: -1.4, path: [{ x: 0, z: 6 }] }]); // the route goes through, but it is still 1.4 m away
      expect(swung(far.rig)).toBeLessThan(0.01);
    });

    it('door.auto: a door in a wall along z is crossed along x', () => {
      setSeed(1);
      const r = rig(0, 0, { swing: 1, base: -Math.PI / 2 });
      const doors = new Doors([r]);
      const d = statesOf(doors)[0];
      d.rest = d.open = 0;
      d.reroll = 1e9;
      for (let t = 0; t < 2; t += STEP) doors.update(STEP, [{ x: -0.6, z: 0, path: [{ x: -0.6, z: 3 }] }]);
      expect(swung(r)).toBeLessThan(0.01);
      for (let t = 0; t < 2; t += STEP) doors.update(STEP, [{ x: -1, z: 0, path: [{ x: 1, z: 0 }] }]);
      expect(swung(r)).toBeGreaterThan(0.95);
    });

    it('door.auto: somebody without a route (the walk-view eye, a steered person) still opens it by proximity', () => {
      const { rig, step } = oneDoor();
      step(2, [{ x: 0, z: -0.8 }]);
      expect(swung(rig)).toBeGreaterThan(0.95);
    });

    it('door.rest: a passer-by leaves a door at its rest position', () => {
      const { door, rig, step } = oneDoor();
      door.rest = 0.3;
      step(3);
      step(3, [{ x: -1, z: -0.6, path: [{ x: 1, z: -0.6 }] }]);
      expect(swung(rig)).toBeCloseTo(0.3, 1);
    });

    it('door.lock: a locked door stays shut for somebody going through it', () => {
      const { doors, rig, step } = oneDoor();
      doors.setLocked({ x: 0, z: 0 }, true);
      step(3, [{ x: 0, z: -0.8, path: [{ x: 0, z: 2 }] }]);
      expect(swung(rig)).toBeLessThan(0.01);
    });
  });

  it('door.auto: whoever keeps standing there keeps the door open', () => {
    const { rig, step } = oneDoor();
    step(10, [{ x: 0.5, z: 0.5 }]);
    expect(swung(rig)).toBeGreaterThan(0.95);
  });

  it('door.rest: with nobody around a door rests closed, ajar or propped open and is rerolled 30-120 s after its last reroll', () => {
    const doors = new Doors(Array.from({ length: 12 }, (_, i) => rig(i * 5, 0, HINGES[i % 2])));
    const rests = new Set<number>();
    const gaps: number[] = []; // seconds between two rerolls of the same door
    const lastAt = new Map<DoorState, number>();
    const prev = new Map<DoorState, number>();
    let t = 0;
    for (; t < 1200; t += STEP) {
      doors.update(STEP, []);
      for (const s of statesOf(doors)) {
        rests.add(s.rest);
        const before = prev.get(s);
        if (before !== undefined && s.reroll > before) {
          // the timer jumped up: a reroll (the first one comes off the staggered start, so it is not measured)
          const since = lastAt.get(s);
          if (since !== undefined) gaps.push(t - since);
          lastAt.set(s, t);
        }
        prev.set(s, s.reroll);
      }
    }
    expect([...rests].sort((a, b) => a - b)).toEqual([0, 0.3, 1]);
    expect(gaps.length).toBeGreaterThan(50);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(30 - STEP);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(120 + STEP);
    // a door that has had time to settle since its last reroll lies at its rest position
    const settled = statesOf(doors).filter((s) => t - (lastAt.get(s) ?? 0) > 5);
    expect(settled.length).toBeGreaterThan(5);
    for (const s of settled) expect(swung(s.rig)).toBeCloseTo(s.rest, 1);
  });

  describe('door.player', () => {
    // the player stands 1.5 m south of the door and looks north (+z) at it
    const look = (doors: Doors) => doors.facing(0, -1.5, 0, 1);

    for (const hinge of HINGES)
      it(`door.player: the player toggles the door they face, and the choice holds (swing ${hinge.swing}, base ${hinge.base})`, () => {
        const { doors, door, rig, step } = oneDoor(hinge);
        door.reroll = 1; // door.rest would reroll it within a second; the player's choice must push that far out
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
const doorAt = (sim: Sim, at: { x: number; z: number }): DoorState => {
  const door = statesOf(sim.doors).reduce((a, b) =>
    Math.hypot(a.rig.center.x - at.x, a.rig.center.z - at.z) <= Math.hypot(b.rig.center.x - at.x, b.rig.center.z - at.z) ? a : b,
  );
  expect(Math.hypot(door.rig.center.x - at.x, door.rig.center.z - at.z)).toBeLessThan(1); // `setLocked` only matches within 1 m
  return door;
};

/** After the unlock somebody stepping up to the door gets it open (the leaf really swings, not just the flag). */
function opensFor(sim: Sim, door: DoorState): void {
  for (let t = 0; t < 3 && swung(door.rig) < 0.95; t += STEP) sim.doors.update(STEP, [door.rig.center]);
  expect(swung(door.rig)).toBeGreaterThan(0.95);
}

function crew(sim: Sim, ...ids: string[]): Person[] {
  const people = ids.map((id) => {
    sim.scenario.put(id, 'desk', 'stay');
    return sim.people.find((p) => p.id === id)!;
  });
  people.forEach((p) => sim.drop(p));
  return people;
}

describe('door.auto in the office', () => {
  it('door.auto: somebody walking past the phone booth door in the corridor leaves it shut', () => {
    const sim = office();
    const door = doorAt(sim, sim.phoneBooth.doorPos);
    door.rest = 0;
    door.open = 0;
    door.reroll = 1e9;
    const c = door.rig.center;
    const p = sim.people.find((q) => q.id === 'oscar-grob')!;
    sim.scenario.put(p.id, { x: c.x + 3, z: c.z + 0.9 }, 'free');
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    p.walkTo(sim.nav, { x: c.x - 3, z: c.z + 0.9 }); // along the wall, 0.9 m from the door centre, never through it
    expect(p.state).toBe('walk');
    let closest = Infinity;
    let widest = 0;
    run(
      sim,
      12,
      () => p.state !== 'walk',
      () => {
        closest = Math.min(closest, Math.hypot(p.pos.x - c.x, p.pos.z - c.z));
        widest = Math.max(widest, door.open);
      },
    );
    expect(closest).toBeLessThan(1.25); // went right past it ...
    expect(widest).toBeLessThan(0.01); // ... and it stayed shut
  });

  /** Steps until `done`; counts the steps in which `p` stood in the doorway while the leaf was still shut. */
  function shutAtDoorway(sim: Sim, door: DoorState, p: Person, done: () => unknown): number {
    let shut = 0;
    expect(
      run(sim, 120, done, () => {
        if (Math.hypot(p.pos.x - door.rig.center.x, p.pos.z - door.rig.center.z) < 0.3 && door.open < 0.5 && !door.locked) shut++;
      }),
    ).toBe(true);
    return shut;
  }

  function closed(door: DoorState): void {
    door.rest = 0;
    door.open = 0;
    door.reroll = 1e9;
  }

  it('door.auto: somebody sent to the phone booth has the door open for them without waiting', () => {
    const sim = office();
    const door = doorAt(sim, sim.phoneBooth.doorPos);
    closed(door);
    const [p] = crew(sim, 'oscar-grob');
    expect(sim.phoneBooth.start(p, sim.nav)).toBeTruthy();
    expect(shutAtDoorway(sim, door, p, () => sim.phoneBooth.current?.calling)).toBe(0); // the leaf was open when they reached it
  });

  it('door.auto: somebody sent to a toilet cabin has the door open for them without waiting', () => {
    const sim = office();
    sim.scenario.clear('wc');
    const [p] = crew(sim, 'oscar-grob');
    expect(sim.toilets.go(p, sim.nav)).toBe('cabin');
    const cabin = sim.toilets.cabins.find((c) => c.session?.person === p)!;
    const door = doorAt(sim, cabin.doorPos);
    closed(door);
    expect(shutAtDoorway(sim, door, p, () => cabin.session?.seated)).toBe(0);
  });

  it('door.auto: people called to the meeting room have the door open for them without waiting', () => {
    const sim = office();
    const door = doorAt(sim, sim.meetingRoom.doorPos);
    closed(door);
    const group = crew(sim, ...GROUP.slice(0, 3));
    sim.meetingRoom.start(group, sim.nav, 'slides');
    let shut = 0;
    const seated = run(
      sim,
      120,
      () => sim.meetingRoom.occupants(sim.people) === group.length,
      () => {
        for (const p of group)
          if (Math.hypot(p.pos.x - door.rig.center.x, p.pos.z - door.rig.center.z) < 0.3 && door.open < 0.5 && !door.locked) shut++;
      },
    );
    expect(seated).toBe(true);
    expect(shut).toBe(0);
  });
});

describe('door.lock in the office', () => {
  it('door.lock: the meeting room door is locked while a meeting is on and open to people again afterwards', () => {
    const sim = office();
    const door = doorAt(sim, sim.meetingRoom.doorPos);
    expect(door.locked).toBe(false);
    sim.meetingRoom.start(crew(sim, ...GROUP.slice(0, 3)), sim.nav);
    expect(run(sim, 120, () => door.locked)).toBe(true);
    // it stays locked until the meeting is over, however long that takes
    expect(run(sim, 900, () => !door.locked)).toBe(true);
    expect(run(sim, 10, () => !sim.meetingRoom.current)).toBe(true);
    opensFor(sim, door);
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
    opensFor(sim, door);
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
    opensFor(sim, door);
    expect(cabin.session?.seated).toBeFalsy();
  });
});
