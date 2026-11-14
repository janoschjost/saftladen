import { describe, expect, it } from 'vitest';
import { Goer, separate } from '../test/goer';
import { NavGrid, type Vec2 } from './NavGrid';
import { setSeed } from './rng';
import type { Passages } from './Passages';
import { Traffic } from './Traffic';
import type { Walker } from './Walker';

const CELL = 0.5; // like the office
const STEP = 1 / 60;

/** A floor from a plan: `#` is wall or furniture, anything else floor; one character per 0.5 m cell, rows run along z. */
function floor(plan: string[]): NavGrid {
  const nav = new NavGrid(plan[0].length, plan.length, CELL);
  plan.forEach((row, cz) => [...row].forEach((c, cx) => c === '#' && nav.block(cx, cz)));
  return nav;
}

/** Steps the walkers the way `Sim.step` does: the traffic director first, then everybody moves, then bodies are kept apart and out of walls. */
function run(nav: NavGrid, traffic: Traffic, walkers: Walker[], seconds: number, done: () => boolean, each: (t: number) => void = () => {}): number {
  for (const w of walkers) w.traffic = traffic;
  let t = 0;
  for (; t < seconds && !done(); t += STEP) {
    traffic.update(STEP, walkers);
    for (const w of walkers) w.update(STEP, nav, walkers);
    for (let k = 0; k < 3; k++) separate(nav, walkers);
    each(t);
  }
  return t;
}

const at = (x: number, z: number): Vec2 => ({ x, z });

/** A walker on its way to `goal`; within half a metre counts as there (the other one may keep it off the exact spot). */
const goer = (id: string, start: Vec2, goal: Vec2): Goer => new Goer(id, start, goal, 0.5);

/** Stands where it was put for good (somebody parked in a doorway): it plugs the passage for both sides. */
class Stander extends Goer {
  protected control(): boolean {
    return true;
  }
}

// two rooms, a 1 m wide doorway (x 4.5-5.5, z 2-3) in the 1 m thick wall between them
const DOORWAY = [
  '####################',
  '#........##........#',
  '#........##........#',
  '#........##........#',
  '#..................#',
  '#..................#',
  '#........##........#',
  '#........##........#',
  '#........##........#',
  '####################',
];

// a row of desks across the room, 1.5 m deep, with a 1 m gap (x 4-5.5, z 2-3) between two of them
const DESK_GAP = [
  '####################',
  '#.......###........#',
  '#.......###........#',
  '#.......###........#',
  '#..................#',
  '#..................#',
  '#.......###........#',
  '#.......###........#',
  '#.......###........#',
  '####################',
];

// two rooms joined by a 3 m corridor, 1 m wide (x 4.5-7.5, z 2-3)
const CORRIDOR = [
  '########################',
  '#........######........#',
  '#........######........#',
  '#........######........#',
  '#......................#',
  '#......................#',
  '#........######........#',
  '#........######........#',
  '#........######........#',
  '########################',
];

// two rooms joined by a doorway (x 4.5-5.5, z 3.5-4.5) and, the long way round, by a 1.5 m hall along the top
const RING = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#...##########.....#',
  '#........##........#',
  '#........##........#',
  '#..................#',
  '#..................#',
  '#........##........#',
  '#........##........#',
  '####################',
];

// two rooms joined by a corridor with a bend: two passages, one along x and one along z, and no other way
const ELL = [
  '##############',
  '#....#########',
  '#....#########',
  '#.............',
  '#.............',
  '#....#######..',
  '#....#######..',
  '############..',
  '############..',
  '############..',
  '############..',
  '##########....',
  '##########....',
  '##########....',
  '##############',
];

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
/** game seconds two walkers deadlocked at the bend may take, all told, to get where they are going (the slowest seed takes about 130) */
const DEADLOCK_BOUND = 150;

/** Runs `scene` on a fresh floor and traffic director for every seed; it returns what went wrong, or null. */
function everySeed(plan: string[], scene: (nav: NavGrid, traffic: Traffic, p: Passages) => string | null): void {
  const failed: string[] = [];
  for (const seed of SEEDS) {
    setSeed(seed);
    const nav = floor(plan);
    const traffic = new Traffic(nav);
    const why = scene(nav, traffic, traffic.passages);
    if (why) failed.push(`seed ${seed}: ${why}`);
  }
  expect(failed).toEqual([]);
}

describe('move.passages', () => {
  for (const [name, plan, a0] of [
    ['doorway', DOORWAY, at(4, 2.25)],
    ['desk gap', DESK_GAP, at(3.5, 2.25)],
  ] as const) {
    it(`move.passages: two walkers meeting at a ${name}: one waits beside the entrance, the other passes, then the waiting one goes`, () => {
      const lane = 2.5; // middle of the doorway / gap
      everySeed(plan, (nav, traffic, p) => {
        // a is nearer the entrance, b stands right in front of the other end of it
        const a = goer('a', a0, at(8.75, 1.25));
        const b = goer('b', at(6.25, lane), at(1.25, 4.25));
        let aIn = -1;
        let aOut = -1;
        let bIn = -1;
        let aside = 0; // how far b stepped off the middle of the lane while it waited for a
        run(nav, traffic, [a, b], 30, () => a.arrived && b.arrived, (t) => {
          if (aIn < 0 && p.at(a.pos) >= 0) aIn = t;
          if (aIn >= 0 && aOut < 0 && p.at(a.pos) < 0) aOut = t;
          if (bIn < 0 && p.at(b.pos) >= 0) bIn = t;
          if (b.yielding && aIn >= 0 && aOut < 0) aside = Math.max(aside, Math.abs(b.pos.z - lane));
        });
        const ok = a.arrived && b.arrived && aIn >= 0 && aOut > aIn && bIn > aOut && aside > 0.4;
        return ok ? null : `arrived ${a.arrived}/${b.arrived}, a in ${aIn.toFixed(2)} out ${aOut.toFixed(2)}, b in ${bIn.toFixed(2)}, aside ${aside.toFixed(2)}`;
      });
    });
  }

  it('move.passages: when both sides queue they take turns: who waits on the other side goes before the queue behind the first one is through', () => {
    everySeed(CORRIDOR, (nav, traffic, p) => {
      // three come from the left one after the other; r waits on the right, clear of where they come out
      const ws = [
        goer('l1', at(3.75, 2.25), at(10.75, 4.25)),
        goer('l2', at(2.25, 2.75), at(9.25, 4.25)),
        goer('l3', at(1.25, 2.25), at(10.75, 2.75)),
        goer('r', at(8.25, 1.25), at(1.25, 0.75)),
      ];
      const r = ws[3];
      const order: string[] = [];
      let rWaited = 0;
      run(nav, traffic, ws, 60, () => ws.every((w) => w.arrived), () => {
        for (const w of ws) if (!order.includes(w.id) && p.at(w.pos) >= 0) order.push(w.id);
        if (r.yielding && !order.includes('r')) rWaited += STEP;
      });
      const ok = ws.every((w) => w.arrived) && order[0] === 'l1' && rWaited > 1 && order.indexOf('r') < order.indexOf('l3');
      return ok ? null : `order ${order.join()}, r waited ${rWaited.toFixed(2)}, arrived ${ws.filter((w) => w.arrived).map((w) => w.id).join()}`;
    });
  });

  it('move.passages: head-on inside a passage: the one who came in later backs out, both reach their goals', () => {
    everySeed(CORRIDOR, (nav, traffic, p) => {
      // a walks through the corridor; b gets going inside it a moment later, 2 m ahead of a, the other way
      const a = goer('a', at(5, 2.5), at(10.75, 1.25));
      const b = goer('b', at(7, 2.5), at(1.25, 3.75));
      b.timer = 0.5;
      let aBack = false;
      let bBack = -1;
      let aOut = -1;
      run(nav, traffic, [a, b], 30, () => a.arrived && b.arrived, (t) => {
        if (p.at(a.pos) < 0 && aOut < 0) {
          aOut = t;
          aBack = a.pos.x < 6;
        }
        if (p.at(b.pos) < 0 && bBack < 0 && b.pos.x > 6) bBack = t;
      });
      const ok = a.arrived && b.arrived && !aBack && bBack >= 0 && bBack < aOut;
      return ok ? null : `arrived ${a.arrived}/${b.arrived}, a out ${aOut.toFixed(2)} back ${aBack}, b back ${bBack.toFixed(2)}`;
    });
  });

  it('move.passages: a plugged passage with another way round: the walker waits, then takes the detour', () => {
    everySeed(RING, (nav, traffic, p) => {
      const w = goer('w', at(3.25, 4.25), at(7.75, 4.25));
      const s = new Stander('s', at(5, 4), at(5, 4));
      const doorway = p.at(s.pos);
      let waited = 0;
      let inside = false;
      const t = run(nav, traffic, [w, s], 30, () => w.arrived, () => {
        if (w.yielding) waited += STEP;
        if (p.at(w.pos) === doorway) inside = true;
      });
      const ok = doorway >= 0 && w.arrived && !inside && waited > 2.5;
      return ok ? null : `doorway passage ${doorway}, arrived ${w.arrived} after ${t.toFixed(2)}, waited ${waited.toFixed(2)}, went in ${inside}`;
    });
  });

  it('move.passages: deadlock at a bend (each waits inside for the other): giving way, then pushing through, both reach their goals', () => {
    everySeed(ELL, (nav, traffic) => {
      const a = goer('a', at(1.25, 1.75), at(5.75, 6.25));
      const b = goer('b', at(5.75, 6.25), at(1.25, 1.75));
      let locked = 0; // seconds both stood waiting for each other
      const t = run(nav, traffic, [a, b], DEADLOCK_BOUND, () => a.arrived && b.arrived, () => {
        if (a.yielding && b.yielding) locked += STEP;
      });
      const ok = a.arrived && b.arrived && locked > 1;
      return ok ? null : `arrived ${a.arrived}/${b.arrived} after ${t.toFixed(2)}, locked ${locked.toFixed(2)}`;
    });
  });
});
