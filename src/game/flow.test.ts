import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run, STEP } from '../test/office';
import { WALL_CLEARANCE } from './Avoidance';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { cycleOf } from './TimeOfDay';

installHeadlessDom();

/** Somebody else within this distance counts as in the way. */
const NEAR = 1.5;
/** Two standstills less than this apart are one (a re-plan in the middle of a jam does not end it). */
const BRIDGE = 0.8;
/** Metres in a second under which somebody on their way counts as standing still. */
const STILL = 0.25;

/** A standstill under way: away from doors (`body`) or at one (`door`), from when to when (seconds into the run). */
interface Run {
  kind: 'body' | 'door';
  from: number;
  last: number;
}

interface Jams {
  /** longest standstill with somebody in the way away from doors (seconds) */
  body: number;
  /** longest wait at a door: in front of a passage for oncoming traffic, or queueing in or next to one */
  door: number;
  where: string;
}

/**
 * Runs the office for `seconds` (the clock moving too) and measures how long people who are on their way stand still
 * with somebody in the way: "standing still" = walking with a route but less than `STILL` metres on in the last second
 * (creeping through a crowd is slow, not stuck).
 */
function jams(sim: Sim, seconds: number, untilHour = Infinity): Jams {
  const out: Jams = { body: 0, door: 0, where: '' };
  const runs = new Map<Person, Run>();
  const trails: Array<Array<{ x: number; z: number }>> = [];
  const SECOND = Math.round(1 / STEP);
  const close = (p: Person, r: Run) => {
    const len = r.last - r.from;
    if (len > out[r.kind]) {
      out[r.kind] = len;
      if (r.kind === 'body') out.where = `${p.id} from ${r.from.toFixed(1)} s`;
    }
  };
  for (let t = 0; t < seconds && sim.tod.hour < untilHour; t += STEP) {
    sim.tod.update(STEP);
    sim.step(STEP);
    sim.people.forEach((p, i) => {
      const trail = (trails[i] ??= []);
      trail.push({ x: p.pos.x, z: p.pos.z });
      if (trail.length > SECOND) trail.shift();
      const ago = trail[0];
      const still =
        !p.away &&
        !p.steady && // holding the spot on purpose (stroking a pet, dozing off) is no jam
        p.state === 'walk' &&
        p.path.length > 0 &&
        trail.length === SECOND &&
        Math.hypot(p.pos.x - ago.x, p.pos.z - ago.z) < STILL &&
        sim.walkers.some((o) => o !== p && !o.away && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < NEAR);
      if (p.away) trail.length = 0;
      if (!still) return;
      const kind = p.yielding || atDoor(sim, p.pos) ? 'door' : 'body';
      const r = runs.get(p);
      if (r && r.kind === kind && t - r.last < BRIDGE) r.last = t;
      else {
        if (r) close(p, r);
        runs.set(p, { kind, from: t, last: t });
      }
    });
  }
  for (const [p, r] of runs) close(p, r);
  return out;
}

/** In a doorway or corridor (a passage), or within a metre of one: queueing there is waiting at a door. */
function atDoor(sim: Sim, q: { x: number; z: number }): boolean {
  for (let dz = -1; dz <= 1; dz += 0.5) for (let dx = -1; dx <= 1; dx += 0.5) if (Math.hypot(dx, dz) <= 1 && sim.traffic.passages.at({ x: q.x + dx, z: q.z + dz }) >= 0) return true;
  return false;
}

describe('move.flow', () => {
  // Everybody called back at once walks in through the hallway while others are on their way out, to the coffee or a meeting.
  // Before #127 this left people stuck nose to nose for up to 40 s
  for (const [seed, hour] of [
    [2, 8], // seed 2 for seed 1 since #253: a talk member stands in front of the archive door for 20 s (#265)
    [5, 8],
    [1, 11],
    [4, 11],
  ]) {
    it(`move.flow "Alle zurückholen" at ${hour}:00 (seed ${seed}): nobody stands in a jam for more than 4.5 s away from doors, nobody waits at a door for more than 20 s`, () => {
      const sim = office({ cycle: cycleOf(hour) }, seed);
      sim.presence.callAllBack();
      const j = jams(sim, 120);
      expect(j.body, j.where).toBeLessThanOrEqual(4.5); // 3 s before walkers got 15% faster (#235)
      expect(j.door).toBeLessThanOrEqual(20);
    });
  }

  // The same rush with the clock started a hair later or earlier (nothing a player could notice): the limits hold in every
  // run, not only in one lucky one. 2e-4 left two people with a coffee standing across the kitchen and somebody stuck
  // behind them for 21 s (#268)
  for (const nudge of [1e-4, 2e-4, 3e-4, -2e-4]) {
    it(`move.flow "Alle zurückholen" at 11:00 (seed 1), clock nudged by ${nudge}: nobody stands in a jam for more than 4.5 s away from doors, nobody waits at a door for more than 20 s`, () => {
      const sim = office({ cycle: cycleOf(11) + nudge }, 1);
      sim.presence.callAllBack();
      const j = jams(sim, 120);
      expect(j.body, j.where).toBeLessThanOrEqual(4.5);
      expect(j.door).toBeLessThanOrEqual(20);
    });
  }

  it('move.flow lunch rush (11:45 to 13:30): nobody stands in a jam for more than 3 s away from doors, nobody waits at a door for more than 20 s', () => {
    const sim = office({ cycle: cycleOf(11.75) }, 4);
    const j = jams(sim, 600, 13.5);
    expect(j.body, j.where).toBeLessThanOrEqual(3);
    expect(j.door).toBeLessThanOrEqual(20);
  });

  it('move.flow a walker whose route the room editor blocks walks round the moved item and gets there', () => {
    const sim = office();
    const walker = sim.person('oscar-grob');
    for (const p of sim.people) if (p !== walker) sim.setRemoved(p.id, true);
    sim.scenario.put(walker.id, { x: 6, z: 6.25 }, 'free');
    const goal = { x: 22, z: 6.25 };
    walker.walkTo(sim.nav, goal);
    expect(walker.path.length).toBeGreaterThan(0);
    run(sim, 0.5); // under way, on the route planned through the empty hallway

    // drop a plant right onto the hallway ahead of them, like the room editor does
    const plant = sim.model.items.find((it) => it.kind === 'plant' && it.removable)!;
    const box = () => plant.blockers()[0];
    const c = box().getCenter(new THREE.Vector3());
    plant.set({ dx: plant.dx + 13 - c.x, dz: plant.dz + 6.25 - c.z });
    sim.relayout();
    const { cx, cz } = sim.nav.toCell({ x: 13, z: 6.25 });
    expect(sim.nav.walkable(cx, cz)).toBe(false);

    let closest = Infinity;
    for (let i = 0; i < 20 / STEP && Math.hypot(walker.pos.x - goal.x, walker.pos.z - goal.z) > 0.5; i++) {
      sim.step(STEP);
      const b = box();
      closest = Math.min(closest, Math.hypot(walker.pos.x - Math.min(Math.max(walker.pos.x, b.min.x), b.max.x), walker.pos.z - Math.min(Math.max(walker.pos.z, b.min.z), b.max.z)));
    }
    expect(Math.hypot(walker.pos.x - goal.x, walker.pos.z - goal.z)).toBeLessThan(0.5);
    expect(closest).toBeGreaterThan(WALL_CLEARANCE * 0.5);
  });
});
