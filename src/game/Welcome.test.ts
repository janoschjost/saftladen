import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { setSeed } from './rng';
import { Sim } from './Sim';
import { cycleOf } from './TimeOfDay';
import { Walker } from './Walker';

installHeadlessDom();

/** He comes in for a visit at 11:00 (the office already holds 15 at that hour) and is welcomed. */
function fullOfficeVisit(seed: number) {
  setSeed(seed);
  const sim = new Sim({ cycle: cycleOf(11) });
  Walker.animate = true;
  const v = sim.people.find((p) => p.member.schedule.visitChance !== undefined)!;
  sim.presence.setVisit(v, true);
  sim.presence.callBack(v);
  let i = 0;
  for (; i < 90 * 60 && !sim.welcome.call; i++) sim.step(1 / 60);
  return { sim, v, greeted: !!sim.welcome.call };
}

describe('presence.remote-greet', () => {
  it('presence.remote-greet: a visitor who just walked into a full office stays (the office cap sends somebody else)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { sim, v, greeted } = fullOfficeVisit(seed);
      expect(greeted, `seed ${seed}`).toBe(true);
      for (let j = 0; j < 30 * 60; j++) {
        sim.step(1 / 60);
        expect(v.presence, `seed ${seed}, ${(j / 60).toFixed(1)} s after the welcome`).toBe('in');
      }
      expect(v.playerChat).toBeNull();
    }
  });

  it('presence.remote-greet: the team welcomes the remote worker who walks in, once per visit', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11) });
    Walker.animate = true;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const v = sim.people.find((p) => p.member.schedule.visitChance !== undefined)!;
    expect(v).toBeDefined();
    sim.presence.setVisit(v, true);
    sim.presence.callBack(v);
    let i = 0;
    for (; i < 90 * 60 && !sim.welcome.call; i++) sim.step(1 / 60);
    expect(v.presence).toBe('in');
    const call = sim.welcome.call!;
    expect(call.text).toBe(`${v.member.name.split(' ')[0]}! 🎉`);
    expect(call.who).not.toBe(v);
    // greeters cheer or wave, somebody walks over to him
    const gesturing = () => sim.people.filter((p) => p !== v && p.reaction && ['cheer', 'wave'].includes(p.reaction.kind)).length;
    const walkers = sim.people.filter((p) => p.scripted && !p.scripted.arrived);
    expect(gesturing() + walkers.length).toBeGreaterThanOrEqual(2);
    let most = 0;
    for (let j = 0; j < 20 * 60; j++) {
      sim.step(1 / 60);
      most = Math.max(most, gesturing());
    }
    expect(most).toBeGreaterThanOrEqual(2);
    // the walkers are let go again, and the call is over
    expect(sim.welcome.call).toBeNull();
    for (const w of walkers) expect(w.scripted).toBeNull();
    // once per visit: nothing more while he stays
    for (let j = 0; j < 30 * 60; j++) {
      sim.step(1 / 60);
      expect(sim.welcome.call).toBeNull();
    }
  });
});
