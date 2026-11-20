import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHRISTIAN_LINES } from '../data/christianLines';
import seats from '../data/seats.json';
import { installHeadlessDom } from '../test/headlessDom';
import { office, STEP } from '../test/office';
import { HIP_HEIGHT } from './petPose';
import { ARRIVE_LATEST, Christian, VISIT_DEADLINE_HOUR, WALL_ENTRY } from './Christian';
import type { Sim } from './Sim';
import { CYCLE_SECONDS, cycleOf } from './TimeOfDay';

installHeadlessDom();

/**
 * Christian's night visit (`Christian.ts`, #255): the schedule, what he cleans and how fast. How he looks and moves is
 * checked by eye.
 */

/** A night (or day) at `hour`, the office full of mess, and Christian ready. */
function stage(hour: number): { sim: Sim; ghost: Christian } {
  const sim = office({ seats }); // the fixed desks, as the game has them: Jannik sits at his
  sim.tod.setCycle(cycleOf(hour));
  sim.mess.fill();
  return { sim, ghost: new Christian(new THREE.Scene(), sim) };
}

/** Steps him until he is gone (true) or `seconds` have passed (false); `each` runs after every step. */
function visit(ghost: Christian, seconds = 400, each: () => void = () => {}): number {
  let t = 0;
  while (ghost.active && t < seconds) {
    ghost.update(STEP);
    each();
    t += STEP;
  }
  return t;
}

describe('christian.ghost', () => {
  it('christian.ghost: he comes in through the kitchen wall (from outside it, hidden from the room) and cleans every piece of mess, also what comes up while he works', () => {
    const { sim, ghost } = stage(23);
    expect(sim.mess.count()).toBeGreaterThan(20);
    expect(ghost.start()).toBe(true);
    expect(ghost.at).toEqual(WALL_ENTRY);
    expect(WALL_ENTRY.z).toBeLessThan(-0.15); // the north wall is the slab z -0.15..0.15: he starts outside it, hidden from the room
    let added = false;
    visit(ghost, 400, () => {
      if (!added && sim.mess.count() < 20) {
        added = true;
        sim.mess.fill(); // people leave more while he is at it
      }
    });
    expect(added).toBe(true);
    expect(ghost.active).toBe(false); // back in the wall
    expect(sim.mess.count()).toBe(0);
  });

  it('christian.ghost: he fades in as he steps out of the wall: nothing of him shows (nor of his glow) at the wall', () => {
    const { ghost } = stage(23);
    ghost.start();
    const opacities: number[] = [];
    ghost.rig!.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (m?.transparent) opacities.push(m.opacity);
    });
    expect(opacities.length).toBeGreaterThan(2); // the body, the halo, the pool of light
    for (const o of opacities) expect(o).toBe(0);
  });

  it('christian.ghost: with nothing lying around he does not come', () => {
    const { sim, ghost } = stage(23);
    sim.mess.clear();
    expect(ghost.start()).toBe(false);
    expect(ghost.active).toBe(false);
  });

  it('christian.ghost: first he mops around Jannik\'s desk for 15 to 20 s, then he cleans', () => {
    const { sim, ghost } = stage(12); // by day: no rush
    const desk = sim.person('jannik-stibi').homeDesk!;
    ghost.start();
    let mopping = 0;
    let at: { x: number; z: number }[] = [];
    visit(ghost, 120, () => {
      if (ghost['pose'] === 'mop' && ghost['hold'] > 0.9) {
        mopping += STEP;
        at.push(ghost.at!);
      }
    });
    expect(mopping).toBeGreaterThan(13);
    expect(mopping).toBeLessThan(24);
    // all the strokes stay around the chair
    for (const p of at) expect(Math.hypot(p.x - desk.seat.x, p.z - desk.seat.z)).toBeLessThan(1.5);
  });

  it('christian.ghost: legs and torso stay together however long he works (the torso sits exactly on the hips for the lean of the moment, nothing piles up)', () => {
    const { ghost } = stage(12);
    ghost.start();
    let worst = 0;
    let leaned = 0;
    visit(ghost, 120, () => {
      if (!ghost.rig) return; // he left with this step
      const { body } = ghost.rig;
      const lean = body.rotation.x;
      if (Math.abs(lean) > 0.3) leaned++;
      // hinge around the hips: forward shift HIP*sin(lean), the rest is the walk's own bob
      worst = Math.max(worst, Math.abs(body.position.z + HIP_HEIGHT * Math.sin(lean)), Math.abs(body.position.y - HIP_HEIGHT * (1 - Math.cos(lean))));
    });
    expect(leaned).toBeGreaterThan(30); // he did bend down
    expect(worst).toBeLessThan(0.05);
  });

  it('christian.ghost: his last word is always said, also when he works fast and his bubble is busy; lunchbox and bin lines too', () => {
    for (const hour of [1, 12]) {
      const { ghost } = stage(hour);
      ghost.start();
      const said = new Set<string>();
      visit(ghost, 400, () => ghost.text && said.add(ghost.text));
      expect(said.has('Passt. Fürs Erste.')).toBe(true);
      expect(CHRISTIAN_LINES.lunchbox.some((l) => said.has(l))).toBe(true);
      expect(CHRISTIAN_LINES.bin.some((l) => said.has(l))).toBe(true);
    }
  });

  it('christian.ghost: his bubbles come one at a time, stay up at least 3 s and are lines of his', () => {
    const { ghost } = stage(12);
    ghost.start();
    const all = new Set(Object.values(CHRISTIAN_LINES).flat());
    let current: string | null = null;
    let since = 0;
    const lasted: number[] = [];
    visit(ghost, 400, () => {
      if (ghost.text !== current) {
        if (current !== null) lasted.push(since);
        current = ghost.text;
        since = 0;
        if (current !== null) expect(all.has(current)).toBe(true);
      }
      since += STEP;
    });
    expect(lasted.length).toBeGreaterThan(4);
    for (const s of lasted) expect(s).toBeGreaterThanOrEqual(3 - 2 * STEP);
  });
});

describe('christian.night', () => {
  it('christian.night: by day he works at normal speed, at night he speeds up so that even full mess is gone before 04:00', () => {
    const day = stage(12).ghost;
    day.start();
    expect(day.rate).toBe(1);
    // the clock races through the night: from his arrival to 04:00 is only a few real seconds
    for (const hour of [0.5, 1, 1.5]) {
      const { sim, ghost } = stage(hour);
      expect(sim.mess.count()).toBe(30); // every cap full
      ghost.start();
      expect(ghost.rate).toBeGreaterThan(2);
      const window = (cycleOf(VISIT_DEADLINE_HOUR) - cycleOf(hour)) * CYCLE_SECONDS;
      const took = visit(ghost);
      expect(sim.mess.count()).toBe(0);
      expect(took).toBeLessThan(window);
    }
  });

  it('christian.night: the evening counts too: 04:00 is only seconds away on the racing clock, so he hurries; a clock that stands still has no 04:00', () => {
    const evening = stage(22).ghost;
    evening.start();
    expect(evening.rate).toBeGreaterThan(1.5);
    const pinned = stage(22);
    pinned.sim.tod.pinned = true; // `?time=22`: the clock stands still
    pinned.ghost.start();
    expect(pinned.ghost.rate).toBe(1);
    const paused = stage(1);
    paused.sim.tod.auto = false;
    paused.ghost.start();
    expect(paused.ghost.rate).toBe(1);
  });

  it('christian.night: he comes once a night, in the small hours, only when something lies around', () => {
    const { sim, ghost } = stage(2); // 02:00: after the latest arrival time he draws, before ARRIVE_LATEST
    sim.mess.clear();
    ghost.update(STEP);
    expect(ghost.active).toBe(false); // nothing to clean
    sim.mess.fill();
    ghost.update(STEP);
    expect(ghost.active).toBe(true);
    visit(ghost);
    expect(sim.mess.count()).toBe(0);
    sim.mess.fill();
    ghost.update(STEP);
    expect(ghost.active).toBe(false); // the same night: once
    sim.presence.days++; // the next working day has started (04:00): the next night
    sim.mess.fill();
    ghost.update(STEP);
    expect(ghost.active).toBe(true);
  });

  it('christian.night: a new working day (04:00) ends a visit that is still going', () => {
    const { sim, ghost } = stage(23);
    ghost.start();
    ghost.update(1);
    expect(ghost.active).toBe(true);
    sim.presence.days++;
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
  });

  it('christian.night: not in the daytime, and not when the clock is jumped to the end of the night', () => {
    for (const hour of [11, 22, ARRIVE_LATEST + 0.5]) {
      const { ghost } = stage(hour);
      ghost.update(STEP);
      expect(ghost.active).toBe(false);
    }
  });
});
