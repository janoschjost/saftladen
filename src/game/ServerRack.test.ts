import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { poseRepair } from './repairPose';
import { CURSES } from './ServerRack';
import type { Sim } from './Sim';

installHeadlessDom();

/** the sim with one dev put at the desk and the rack broken by the event */
function breakIt() {
  const sim = office();
  const devs = sim.people.filter((p) => p.member.look.nerf);
  for (const d of devs) sim.scenario.put(d.id, 'desk', 'free');
  expect(sim.events.trigger('server-rack')).toMatch(/^Serverschrank sprüht Funken, \w+ repariert$/);
  const repair = sim.serverRack.current!;
  return { sim, rack: sim.serverRack, repair, p: repair.person, devs };
}
const phase = (sim: Sim) => sim.serverRack.current?.phase;

describe('place.server-rack', () => {
  it('breaks (red leds, sparks), a dev comes, bangs on it and swears, then it works again and they leave', () => {
    const { sim, rack, repair, p, devs } = breakIt();
    expect(devs).toContain(p); // never anybody but a dev
    expect(rack.state).toBe('broken');
    const fault: boolean[] = [];
    const leds = sim.model.serverRack.leds;
    sim.model.serverRack.leds = (f, t) => (fault.push(f), leds(f, t));
    expect(run(sim, 60, () => phase(sim) === 'fix')).toBe(true);
    expect(p.repairOn).toBe(true);
    // faces the rack and stands in front of it
    const at = rack.front;
    const want = Math.atan2(at.x - p.pos.x, at.z - p.pos.z);
    expect(Math.abs(Math.atan2(Math.sin(p.yaw - want), Math.cos(p.yaw - want)))).toBeLessThan(0.3);
    expect(Math.hypot(at.x - p.pos.x, at.z - p.pos.z)).toBeLessThan(1.6);
    // while they fix it: sparks fly, it is bangs and curses
    const said = new Set<string>();
    let peak = 0;
    run(sim, 30, () => phase(sim) !== 'fix', () => {
      if (repair.text) said.add(repair.text);
      peak = Math.max(peak, rack.sparks.count);
    });
    expect(peak).toBeGreaterThan(5);
    expect(repair.bangs).toBeGreaterThanOrEqual(3);
    expect(said.size).toBeGreaterThanOrEqual(3);
    said.delete('Na also!'); // the last word, once it works
    for (const t of said) expect(CURSES).toContain(t);
    expect(fault.at(-1)).toBe(false); // the leds are fine again
    expect(fault).toContain(true);
    expect(rack.state).toBe('ok');
    expect(run(sim, 10, () => !rack.current)).toBe(true);
    expect(p.repairOn).toBe(false);
    expect(p.talk).toBe(null);
    expect(rack.free).toBe(true);
    run(sim, 3);
    expect(rack.sparks.count).toBe(0); // no more sparks
  });

  it('fixing takes 8-14 s', () => {
    const { sim, repair } = breakIt();
    run(sim, 60, () => phase(sim) === 'fix');
    let t = 0;
    run(sim, 30, () => phase(sim) !== 'fix', () => (t += 1 / 60));
    expect(t).toBeGreaterThan(7.9);
    expect(t).toBeLessThan(14.1);
    expect(repair.phase).toBe('relief');
  });

  it('while broken the event fixes it first and breaks it again; it is refused when a scene holds every dev away', () => {
    const { sim } = breakIt();
    expect(sim.events.trigger('server-rack')).toMatch(/^Serverschrank sprüht Funken, \w+ repariert$/);
    expect(sim.serverRack.state).toBe('broken');
    const other = office();
    for (const d of other.people.filter((p) => p.member.look.nerf)) other.scenario.put(d.id, 'home', 'stay');
    expect(other.events.trigger('server-rack')).toMatch(/: nicht möglich$/);
    expect(other.serverRack.state).toBe('ok');
  });

  it('the event brings a dev in when none is in the office', () => {
    const sim = office();
    const devs = sim.people.filter((p) => p.member.look.nerf);
    for (const d of devs) sim.scenario.put(d.id, 'errand', 'free');
    expect(devs.every((d) => d.presence !== 'in')).toBe(true);
    expect(sim.events.trigger('server-rack')).toMatch(/^Serverschrank sprüht Funken, \w+ repariert$/);
    expect(devs.filter((d) => d.presence === 'in')).toHaveLength(1); // one is enough
    expect(sim.serverRack.state).toBe('broken');
    expect(run(sim, 90, () => sim.serverRack.state === 'ok')).toBe(true);
  });

  it('breaks by itself now and then, but only while a dev is in', () => {
    const sim = office();
    const devs = sim.people.filter((p) => p.member.look.nerf);
    for (const d of devs) sim.scenario.put(d.id, 'home', 'stay');
    run(sim, 400);
    expect(sim.serverRack.state).toBe('ok'); // nobody to fix it: it holds out
    sim.scenario.put(devs[0].id, 'desk', 'free');
    expect(run(sim, 400, () => sim.serverRack.state === 'broken')).toBe(true);
    expect(run(sim, 120, () => sim.serverRack.state === 'ok')).toBe(true); // and gets fixed again
  });

  it('being pulled away while fixing leaves it broken, then another dev takes over', () => {
    const { sim, rack, p } = breakIt();
    expect(run(sim, 60, () => phase(sim) === 'fix')).toBe(true);
    sim.drop(p);
    p.held = true;
    run(sim, 1);
    p.held = false;
    expect(rack.current).toBe(null);
    expect(p.repairOn).toBe(false);
    expect(rack.state).toBe('broken');
    expect(run(sim, 30, () => rack.current)).toBe(true); // somebody is sent
    expect(run(sim, 90, () => rack.state === 'ok')).toBe(true);
    expect(rack.state).toBe('ok');
  });

  it('the end event fixes it at once', () => {
    const { sim, rack, p } = breakIt();
    run(sim, 60, () => phase(sim) === 'fix');
    expect(sim.events.trigger('server-rack-end')).toBe('Serverschrank läuft wieder');
    expect(rack.state).toBe('ok');
    expect(p.repairOn).toBe(false);
    expect(run(sim, 10, () => rack.free)).toBe(true);
    expect(sim.events.trigger('server-rack-end')).toMatch(/: nicht möglich$/);
  });

  it('the spot to stand at is on free floor', () => {
    const sim = office();
    const s = sim.model.serverRack.stand;
    expect(sim.nav.nearestWalkable(s, 3)).not.toBe(null);
  });
});

describe('place.server-rack: the repair pose', () => {
  it('leans in, the right fist is forward and higher at the bang', () => {
    const sim = office();
    const r = sim.person('oscar-grob').rig;
    poseRepair(r, 0, 0, 0);
    const rest = r.armR.rotation.x;
    poseRepair(r, 1, 1, 0);
    expect(r.armR.rotation.x).toBeLessThan(rest);
    expect(r.armR.rotation.x).toBeLessThan(-1.2);
  });
});

describe('place.server-rack: nobody to fix it', () => {
  it('a rack nobody can fix is given up after two minutes and works again', () => {
    const { sim, rack, p, devs } = breakIt();
    sim.drop(p);
    p.held = true;
    run(sim, 1);
    for (const d of devs) sim.scenario.put(d.id, 'home', 'stay');
    p.held = false;
    expect(rack.state).toBe('broken');
    expect(run(sim, 150, () => rack.state === 'ok')).toBe(true);
  });
});
