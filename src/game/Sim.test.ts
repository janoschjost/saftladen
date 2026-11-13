import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { setSeed } from './rng';
import { cycleOf } from './TimeOfDay';
import { Sim, type SimOptions } from './Sim';
import { Walker } from './Walker';

installHeadlessDom();

/** A fresh office from `seed`, run for `seconds` at 60 steps a second. */
function run(seed: number, seconds: number, options?: SimOptions): Sim {
  setSeed(seed);
  const sim = new Sim(options);
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

  it('presence.caps: called back into a full office, they come in on the first countdown and the office sends somebody else out', () => {
    const sim = run(1, 5, { cycle: cycleOf(11) });
    const present = () => sim.people.filter((p) => p.presence === 'in' || p.presence === 'returning').length;
    expect(present()).toBe(15);
    const one = sim.people.find((p) => p.presence === 'out' && p.awayKind !== 'off' && p.awayLeft > 20)!;
    sim.presence.callBack(one);
    // the countdown never starts over: in within seconds
    let last = one.awayLeft;
    let t = 0;
    for (; t < 30 && one.presence !== 'in'; t += 1 / 60) {
      sim.step(1 / 60);
      if (one.presence === 'out') expect(one.awayLeft).toBeLessThanOrEqual(last);
      last = one.awayLeft;
    }
    expect(one.presence).toBe('in');
    expect(t).toBeLessThan(10);
    // over the cap: somebody else leaves, the one called back stays
    const others = sim.people.filter((p) => p !== one && p.presence === 'in');
    for (t = 0; t < 40; t += 1 / 60) {
      sim.step(1 / 60);
      expect(one.presence, `${t.toFixed(1)} s after coming in`).toBe('in');
    }
    expect(others.some((p) => p.presence !== 'in')).toBe(true);
    expect(present()).toBeLessThanOrEqual(15);
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
