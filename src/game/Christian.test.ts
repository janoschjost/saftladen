import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CHRISTIAN_FACTS } from '../data/christianFacts';
import { CHRISTIAN_LINES } from '../data/christianLines';
import seats from '../data/seats.json';
import { installHeadlessDom } from '../test/headlessDom';
import { office, STEP } from '../test/office';
import { CHILL_RANGE, CHILL_TIME } from './Chill';
import { HIP_HEIGHT } from './petPose';
import { MAX_FRAME } from './seams';
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
function visit(ghost: Christian, seconds = 400, each: () => void = () => {}, step = STEP): number {
  let t = 0;
  while (ghost.active && t < seconds) {
    ghost.update(step);
    each();
    t += step;
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

  it('christian.night: also in the long frames of a fast clock (25×) full mess is gone before 04:00: a step that ends mid-frame hands the rest of the frame on', () => {
    const { sim, ghost } = stage(1.5);
    ghost.start();
    const window = (cycleOf(VISIT_DEADLINE_HOUR) - cycleOf(1.5)) * CYCLE_SECONDS;
    const took = visit(ghost, 400, () => {}, MAX_FRAME);
    expect(sim.mess.count()).toBe(0);
    expect(took).toBeLessThan(window);
  });

  it('christian.night: a clock that is let go during his visit (`?time=1`, then a speed button) makes him hurry for 04:00', () => {
    const { sim, ghost } = stage(1);
    sim.tod.pinned = true;
    ghost.start();
    expect(ghost.rate).toBe(1);
    ghost.update(STEP);
    sim.tod.pinned = false;
    visit(ghost, 5);
    expect(ghost.rate).toBeGreaterThan(2);
  });

  it('christian.night: a visit in the small hours from the dev event is that night\'s one', () => {
    const { sim, ghost } = stage(2); // after every arrival time he draws: the night's visit would start now
    ghost.start();
    visit(ghost);
    sim.mess.fill();
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
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

/** A day wander is on: Christian at hour 11 on his own, started by hand. */
function wander(hour = 11): { sim: Sim; ghost: Christian } {
  const { sim, ghost } = stage(hour);
  sim.mess.clear();
  expect(ghost.startWander()).toBe(true);
  return { sim, ghost };
}

/** The opacities of everything see-through on his rig: the body (his shared ghost material), the halo, the pool of light. */
function opacities(ghost: Christian): number[] {
  const out: number[] = [];
  ghost.rig!.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m?.transparent) out.push(m.opacity);
  });
  return out;
}

/** Just his body's see-through material (not the additive halo and pool). */
function body(ghost: Christian): number[] {
  const out: number[] = [];
  ghost.rig!.root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m?.transparent && m.blending !== THREE.AdditiveBlending) out.push(m.opacity);
  });
  return out;
}

describe('christian.day', () => {
  it('christian.day: he comes every 3 to 5 clock hours in office hours, wanders 25 to 45 s and fades out; not when he is opened at 11:00', () => {
    const { sim, ghost } = stage(6);
    sim.mess.clear();
    ghost.update(STEP); // the new day: the first one is drawn for 08:30 to 10:00
    expect(ghost.active).toBe(false);
    sim.tod.setCycle(cycleOf(8.4));
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
    sim.tod.setCycle(cycleOf(10.1));
    ghost.update(STEP);
    expect(ghost.active).toBe(true);
    expect(ghost.wandering).toBe(true);
    const took = visit(ghost, 120);
    expect(took).toBeGreaterThanOrEqual(25);
    expect(took).toBeLessThanOrEqual(46);
    expect(ghost.active).toBe(false);
    // the next one is 3 to 5 clock hours later: not after 2.9, there after 5.1
    sim.tod.setCycle(cycleOf(10.1 + 2.9));
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
    sim.tod.setCycle(cycleOf(10.1 + 5.1));
    ghost.update(STEP);
    expect(ghost.wandering).toBe(true);
    // a game opened at 11:00 does not start with him
    const late = stage(11);
    late.sim.mess.clear();
    late.ghost.update(STEP);
    expect(late.ghost.active).toBe(false);
  });

  it('christian.day: none in the evening, and he does not clean by day: a wander leaves the mess alone', () => {
    const { sim, ghost } = stage(6);
    ghost.update(STEP);
    sim.tod.setCycle(cycleOf(17.5));
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
    const w = wander();
    w.sim.mess.fill();
    const mess = w.sim.mess.count();
    expect(mess).toBeGreaterThan(0);
    visit(w.ghost, 120);
    expect(w.sim.mess.count()).toBe(mess);
  });

  it('christian.day: he fades in at about 25% (the night ghost\'s look, fainter) and out again, with no mop', () => {
    const { ghost } = wander();
    expect(Math.max(...opacities(ghost))).toBe(0); // at the start nothing shows (nor the glow)
    visit(ghost, 3);
    expect(Math.max(...body(ghost))).toBeGreaterThan(0.05);
    let max = 0;
    let mop = false;
    visit(ghost, 120, () => {
      if (ghost.active) max = Math.max(max, ...body(ghost));
      mop ||= ghost['mop']?.visible ?? false;
    });
    expect(max).toBeLessThanOrEqual(0.25);
    expect(max).toBeGreaterThan(0.15); // at his faintest he is not gone: about a quarter
    expect(mop).toBe(false);
    const night = stage(23);
    night.ghost.start();
    visit(night.ghost, 20);
    expect(Math.max(...body(night.ghost))).toBeGreaterThan(0.25); // the night ghost is stronger
  });

  it('christian.day: he glides at a steady pace, never jumps, and wanders over the floor of the office', () => {
    const { sim, ghost } = wander();
    let last = ghost.at!;
    let far = 0;
    let moved = 0;
    visit(ghost, 120, () => {
      const p = ghost.at;
      if (!p) return;
      const d = Math.hypot(p.x - last.x, p.z - last.z);
      far = Math.max(far, d);
      moved += d;
      last = p;
      expect(sim.nav.inside(sim.nav.toCell(p).cx, sim.nav.toCell(p).cz)).toBe(true);
    });
    expect(far).toBeLessThan(0.05); // never a jump
    expect(moved).toBeGreaterThan(15); // 25 s or more at about 1 m/s
  });

  it('christian.day: about every 15 s he says one of his facts, one bubble at a time', () => {
    const { ghost } = wander();
    const said: Array<{ at: number; text: string }> = [];
    let t = 0;
    let shown: string | null = null;
    visit(ghost, 120, () => {
      t += STEP;
      if (ghost.text !== shown) {
        shown = ghost.text;
        if (shown) said.push({ at: t, text: shown });
      }
    });
    expect(said.length).toBeGreaterThanOrEqual(2);
    for (const f of said) expect(CHRISTIAN_FACTS).toContain(f.text);
    for (let i = 1; i < said.length; i++) {
      expect(said[i].at - said[i - 1].at).toBeGreaterThan(11);
      expect(said[i].at - said[i - 1].at).toBeLessThan(19);
      expect(said[i].text).not.toBe(said[i - 1].text);
    }
  });

  it('christian.day: a new working day (04:00) ends a wander that is still going', () => {
    const { sim, ghost } = wander();
    ghost.update(1);
    expect(ghost.active).toBe(true);
    sim.presence.days++;
    ghost.update(STEP);
    expect(ghost.active).toBe(false);
  });
});

describe('christian.chill', () => {
  it('christian.chill: somebody within 0.6 m of him shivers for 2 s, somebody farther does not; what they do is not touched', () => {
    const { sim, ghost } = wander();
    const at = ghost.at!;
    sim.scenario.put('donata-manser', { x: at.x + CHILL_RANGE * 0.7, z: at.z }, 'pin');
    sim.scenario.put('jannik-stibi', { x: at.x + CHILL_RANGE * 1.6, z: at.z }, 'pin');
    const donata = sim.person('donata-manser');
    const before = { ...donata.pos };
    ghost.update(STEP);
    expect(donata.chill).toBe(CHILL_TIME);
    for (const p of sim.people) expect(p.chill > 0).toBe(!p.away && Math.hypot(p.pos.x - at.x, p.pos.z - at.z) <= CHILL_RANGE);
    expect(sim.people.some((p) => p.chill === 0 && !p.away)).toBe(true);
    ghost.stop(); // he is gone: the shiver runs out by itself
    for (let i = 0; i < (CHILL_TIME + 0.1) / STEP; i++) sim.step(STEP);
    expect(donata.chill).toBe(0);
    expect(donata.pos.x).toBeCloseTo(before.x, 5);
    expect(donata.presence).toBe('in');
  });

  it('christian.chill: somebody who is out of the office feels nothing', () => {
    const { sim, ghost } = wander();
    sim.scenario.put('donata-manser', 'home', 'pin');
    ghost.update(STEP);
    expect(sim.person('donata-manser').chill).toBe(0);
  });

  it('christian.chill: the night ghost makes a night owl at their desk shiver, who keeps sitting and working', () => {
    const { sim, ghost } = stage(23);
    const owl = sim.person('jannik-stibi'); // the night visit starts at his desk
    sim.scenario.put(owl.id, 'desk', 'pin');
    expect(owl.working).toBe(true);
    ghost.start();
    let shivered = false;
    visit(ghost, 60, () => {
      if (owl.chill > 0) {
        shivered = true;
        expect(owl.working).toBe(true); // nothing is interrupted
      }
      sim.step(STEP);
    });
    expect(shivered).toBe(true);
  });
});
