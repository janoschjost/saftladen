import { describe, expect, it, vi } from 'vitest';
import * as assignments from '../data/homeAssignments';
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
  const v = sim.people.find((p) => p.id === 'zlatko-pesic')!;
  sim.presence.setVisit(v, true);
  sim.presence.callBack(v);
  let i = 0;
  for (; i < 90 * 60 && !sim.welcome.call; i++) sim.step(1 / 60);
  return { sim, v, greeted: !!sim.welcome.call };
}

describe('presence.remote-visit', () => {
  it('presence.remote-visit: on a remote day he gets a home office even when all are taken by hand (#homes)', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11), homes: true });
    Walker.animate = true;
    const v = sim.people.find((p) => p.id === 'zlatko-pesic')!;
    sim.presence.setVisit(v, true); // in for a visit first (as the dev event does) ...
    sim.presence.callBack(v);
    for (let i = 0; i < 90 * 60 && v.presence !== 'in'; i++) sim.step(1 / 60);
    expect(v.presence).toBe('in');
    expect(sim.presence.homeFull).toBe(true);
    expect(sim.presence.roomFor(v)).toBe(true);
    sim.presence.setVisit(v, false); // a remote day again
    for (let i = 0; i < 90 * 60 && !(v.presence === 'out' && v.awayKind === 'home'); i++) sim.step(1 / 60);
    expect([v.presence, v.awayKind]).toEqual(['out', 'home']);
  });

  it('presence.remote-visit: a visitor who just walked into a full office stays (the office cap sends somebody else)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { sim, v, greeted } = fullOfficeVisit(seed);
      expect(greeted, `seed ${seed}`).toBe(true);
      // more people come back than the office holds: the cap has to send somebody out again
      for (const p of sim.people.filter((o) => o.presence === 'out' && o.awayKind !== 'off' && o !== v).slice(0, 4)) sim.presence.callBack(p);
      let full = false;
      for (let j = 0; j < 30 * 60; j++) {
        sim.step(1 / 60);
        full ||= sim.people.filter((p) => p.presence === 'in').length >= 15;
        expect(v.presence, `seed ${seed}, ${(j / 60).toFixed(1)} s after the welcome`).toBe('in');
      }
      expect(full, `seed ${seed}: the office was full with him`).toBe(true);
    }
  });

  it('presence.remote-visit: with all home offices taken, makeRoom calls one person back even into a full office', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11) });
    Walker.animate = true;
    for (let i = 0; i < 60 && !sim.presence.homeFull; i++) sim.step(1 / 60);
    expect(sim.presence.homeFull).toBe(true);
    expect(sim.people.filter((p) => p.presence === 'in').length).toBeGreaterThanOrEqual(15);
    sim.presence.makeRoom();
    const back = sim.people.filter((p) => p.awayKind === 'home' && p.presence === 'out' && p.awayLeft === 0);
    expect(back.length).toBe(1);
    sim.presence.makeRoom(); // a second call while the first is on the way calls nobody else
    expect(sim.people.filter((p) => p.awayKind === 'home' && p.presence === 'out' && p.awayLeft === 0)).toEqual(back);
    let i = 0;
    for (; i < 20 * 60 && back[0].presence !== 'in'; i++) {
      sim.step(1 / 60);
      sim.presence.makeRoom();
    }
    expect(back[0].presence).toBe('in');
  });
});

describe('dev.events', () => {
  it('dev.events: with all home offices taken (#homes) the home event still sends somebody, whoever sat in that room comes back', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11), homes: true });
    Walker.animate = true;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(sim.presence.homeFull).toBe(true);
    const p = sim.people.find((o) => o.presence === 'in' && !o.task && !o.talk && !o.member.homebody)!;
    const before = sim.people.filter((o) => o.awayKind === 'home' && o.presence === 'out');
    expect(sim.presence.send(p, 'home', sim.nav)).toBe(false); // the player's H: a full home office stays full
    expect(sim.presence.send(p, 'home', sim.nav, true)).toBe(true);
    const back = before.filter((o) => o.homeVariant === p.homeVariant);
    expect(back.length).toBe(1);
    expect(back[0].awayLeft).toBe(0);
    for (let i = 0; i < 90 * 60 && (p.presence !== 'out' || back[0].presence !== 'in'); i++) sim.step(1 / 60);
    expect([p.presence, p.awayKind, back[0].presence]).toEqual(['out', 'home', 'in']);
  });
});

describe('presence.manual', () => {
  it('presence.manual: sent home with all rooms taken, somebody whose regular room is theirs takes it, its sitter comes back', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11), homes: true });
    Walker.animate = true;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const p = sim.people.find((o) => o.presence === 'in' && !o.task && !o.talk && !o.member.homebody)!;
    const room = 3;
    const sitter = sim.people.find((o) => o.awayKind === 'home' && o.homeVariant === room)!;
    expect(sitter).toBeDefined();
    // p owns that room (team data / character view)
    vi.spyOn(assignments, 'homeRoomOf').mockImplementation((id) => (id === p.id ? room : null));
    expect(sim.presence.send(p, 'home', sim.nav)).toBe(true);
    expect(p.homeVariant).toBe(room);
    expect(sitter.awayLeft).toBe(0); // on the way back to the office
    vi.restoreAllMocks();
  });
});

describe('presence.remote-greet', () => {
  it('presence.remote-greet: the team welcomes the remote worker who walks in, once per visit', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11) });
    Walker.animate = true;
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const v = sim.people.find((p) => p.id === 'zlatko-pesic')!;
    expect(v).toBeDefined();
    sim.presence.setVisit(v, true);
    sim.presence.callBack(v);
    let i = 0;
    for (; i < 90 * 60 && !sim.welcome.call; i++) sim.step(1 / 60);
    expect(v.presence).toBe('in');
    const call = sim.welcome.call!;
    expect(call.text).toBe(`${v.member.name.split(' ')[0]}! 🎉`);
    expect(call.who).not.toBe(v);
    // greeters cheer or wave; the two closest walk over, even from their desks (everybody near the door works at 11:00)
    const gesturing = () => sim.people.filter((p) => p !== v && p.reaction && ['cheer', 'wave'].includes(p.reaction.kind)).length;
    const walkers = sim.people.filter((p) => p.scripted && !p.scripted.arrived);
    expect(walkers.length).toBe(2);
    let most = 0;
    let closest = Infinity;
    // a walker is let go at the latest WELCOME.timeout (20 s) after the call, or WELCOME.hold (5 s) after a late cheer
    for (let j = 0; j < 25 * 60; j++) {
      sim.step(1 / 60);
      most = Math.max(most, gesturing());
      for (const w of walkers) if (w.scripted) closest = Math.min(closest, Math.hypot(w.pos.x - v.pos.x, w.pos.z - v.pos.z));
    }
    expect(most).toBeGreaterThanOrEqual(2);
    expect(closest).toBeLessThan(1.6); // came over to him
    // the walkers are let go again, and the call is over
    expect(sim.welcome.call).toBeNull();
    for (const w of walkers) expect(w.scripted).toBeNull();
    // once per visit: nothing more while he stays
    for (let j = 0; j < 30 * 60; j++) {
      sim.step(1 / 60);
      expect(sim.welcome.call).toBeNull();
    }
  });

  it('presence.remote-greet: the walkers hurry to the visitor, they run so that near or far they are there about 2 to 5 s after he walks in (longer when the way round a wall is long)', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { sim, v, greeted } = fullOfficeVisit(seed);
      expect(greeted, `seed ${seed}`).toBe(true);
      const walkers = sim.people.filter((p) => p.scripted && !p.scripted.arrived);
      expect(walkers.length, `seed ${seed}`).toBeGreaterThan(0);
      const behindGlass = new Set(walkers.filter((w) => w.pos.x < 4.5).map((w) => w.id)); // the glass door is a long way round from there
      const took = new Map<string, number>();
      const gap = new Map<string, number>(); // how far from him when they got there
      for (let j = 0; j < 12 * 60; j++) {
        sim.step(1 / 60);
        for (const w of walkers) if (w.scripted?.arrived && !took.has(w.id)) {
            took.set(w.id, j / 60);
            gap.set(w.id, Math.hypot(w.pos.x - v.pos.x, w.pos.z - v.pos.z));
          }
      }
      for (const w of walkers) {
        const t = took.get(w.id);
        expect(t, `seed ${seed}: ${w.id} got there`).toBeDefined();
        expect(t!, `seed ${seed}: ${w.id}`).toBeLessThan(behindGlass.has(w.id) ? 10 : 8); // 5 s; from behind the glass the way round is 20 m or more, and a run is capped
        expect(gap.get(w.id)!).toBeLessThan(1.6);
      }
    }
  });
});
