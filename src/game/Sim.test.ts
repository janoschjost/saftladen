import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { setSeed } from './rng';
import { Sim } from './Sim';
import { Walker } from './Walker';

installHeadlessDom();

/** A fresh office from `seed`, run for `seconds` at 60 steps a second. */
function run(seed: number, seconds: number): Sim {
  setSeed(seed);
  const sim = new Sim();
  Walker.animate = true; // as in the game: from now on arriving and leaving take their time
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60);
  return sim;
}

const places = (sim: Sim): string => sim.walkers.map((w) => `${w.pos.x.toFixed(3)},${w.pos.z.toFixed(3)}`).join(' ');

describe('dev.seed', () => {
  it('dev.seed: the whole office runs without a browser, the same from the same seed', () => {
    const a = run(1, 30);
    expect(a.people.length).toBeGreaterThan(30);
    expect(a.pets.length).toBeGreaterThan(0);
    expect(a.people.some((p) => p.inOffice)).toBe(true);
    // somebody walked: not everybody is where a fresh office puts them
    setSeed(1);
    expect(places(a)).not.toBe(places(new Sim()));
    expect(places(run(1, 30))).toBe(places(a));
    expect(places(run(2, 30))).not.toBe(places(a));
  });

  it('presence.door-flow: somebody called back from outside appears at the door and walks in', () => {
    setSeed(1);
    const sim = new Sim();
    Walker.animate = true;
    const out = sim.people.find((p) => p.presence === 'out' && p.awayKind !== 'off')!;
    expect(out).toBeDefined();
    sim.presence.callBack(out);
    for (let i = 0; i < 60 * 60 && out.presence !== 'in'; i++) sim.step(1 / 60);
    expect(out.presence).toBe('in');
    expect(out.fx).toBe(1);
  });

  it('presence.door-flow: after "all back" at most two are on their way in at once, and each has moved on from the entrance 4 s after stepping in', () => {
    setSeed(1);
    const sim = new Sim();
    Walker.animate = true;
    expect(sim.presence.away.length).toBeGreaterThanOrEqual(3);
    sim.presence.callAllBack();
    let maxIn = 0;
    const dists: number[] = [];
    const inAt = new Map<unknown, number>();
    const last = new Map<unknown, string>();
    for (let step = 0; step < 120 * 60 && dists.length < 3; step++) {
      sim.step(1 / 60);
      maxIn = Math.max(maxIn, sim.people.filter((p) => p.presence === 'returning').length);
      for (const p of sim.people) {
        if (last.get(p) === 'returning' && p.presence === 'in') inAt.set(p, step);
        last.set(p, p.presence);
        const t = inAt.get(p);
        if (t !== undefined && step - t >= 4 * 60) {
          inAt.delete(p);
          dists.push(Math.hypot(p.pos.x - p.lane.in.x, p.pos.z - p.lane.in.z));
        }
      }
    }
    expect(dists.length).toBeGreaterThanOrEqual(3);
    expect(maxIn).toBeLessThanOrEqual(2);
    for (const d of dists) expect(d).toBeGreaterThan(2);
  });

  it('move.collision: after a minute nobody stands inside a wall or outside the office', () => {
    const sim = run(1, 60);
    for (const w of sim.walkers) {
      if (w.away || w.fixed || w.held) continue;
      const { cx, cz } = sim.nav.toCell(w.pos);
      expect(sim.nav.walkable(cx, cz), `${w.id} at ${w.pos.x.toFixed(2)},${w.pos.z.toFixed(2)}`).toBe(true);
    }
  });
});
