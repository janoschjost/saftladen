import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { DOOR, DOOR_LANES, laneBusy } from './Door';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** People put at their desks (hold 'free': the simulation takes over, so `presence.send` accepts them). */
function atDesks(sim: Sim, ids: string[]): Person[] {
  for (const id of ids) sim.scenario.put(id, 'desk', 'free');
  return ids.map((id) => sim.person(id));
}

const IDS = ['oscar-grob', 'andrew-jelley', 'linda-peter', 'milica-rakic'];

describe('presence.errand: the way through the door', () => {
  it('presence.errand: out through the front door onto the porch, hidden and not clickable while away, back in the same way', () => {
    const sim = office();
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    const [p] = atDesks(sim, ['oscar-grob']);
    expect(sim.presence.send(p, 'errand', sim.nav)).toBe(true);
    const lane = () => p.lane;
    // walks to the inside of its wing, through the doorway, vanishes on the porch
    let sawIn = false;
    let sawGate = false;
    expect(
      run(sim, 120, () => p.presence === 'out', () => {
        if (p.presence !== 'leaving') return;
        sawIn ||= Math.hypot(p.pos.x - lane().in.x, p.pos.z - lane().in.z) < 0.8;
        sawGate ||= Math.abs(p.pos.x - lane().gate.x) < 0.1 && Math.abs(p.pos.z - lane().gate.z) < 0.3;
      }),
    ).toBe(true);
    expect(sawIn && sawGate).toBe(true);
    expect(p.pos.z).toBeGreaterThan(DOOR.z); // on the porch, outside the wall
    expect(p.pos.x).toBeCloseTo(p.lane.out.x, 1);
    // away: not drawn and out of what a click or the walk-mode aim picks (`!away && inOffice`)
    run(sim, 2);
    expect(p.away).toBe(true);
    expect(p.inOffice).toBe(false);
    expect(p.root.visible).toBe(false);
    // and back through the same door (called back by hand): appears on the porch, walks in to the inside of its wing
    sim.presence.callBack(p);
    expect(run(sim, 200, () => p.presence === 'returning')).toBe(true);
    expect(p.away).toBe(false);
    expect(p.pos.z).toBeGreaterThan(DOOR.z);
    expect(run(sim, 60, () => p.presence === 'in')).toBe(true);
    expect(Math.hypot(p.pos.x - p.lane.in.x, p.pos.z - p.lane.in.z)).toBeLessThan(1);
  });
});

describe('office.entrance: two lanes', () => {
  it('office.entrance: every trip uses one of the two lanes, both wings get used, and everybody stays in their own wing through the doorway', () => {
    const sim = office();
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    const people = atDesks(sim, IDS);
    for (const p of people) expect(sim.presence.send(p, 'errand', sim.nav)).toBe(true);
    const wings = new Set(people.map((p) => p.lane.wing));
    for (const p of people) expect(DOOR_LANES).toContain(p.lane);
    expect(wings).toEqual(new Set(['left', 'right']));
    expect(DOOR_LANES[0].gate.x).toBeLessThan(DOOR_LANES[1].gate.x);
    // in the doorway (z between the gate and the porch) everybody stays inside the 1 m of their own wing
    const crossed = new Set<Person>();
    run(sim, 120, () => people.every((p) => p.presence === 'out'), () => {
      for (const p of people) {
        if (p.presence !== 'leaving' || p.pos.z < p.lane.gate.z) continue;
        crossed.add(p);
        expect(Math.abs(p.pos.x - p.lane.gate.x), p.id).toBeLessThan(0.6);
      }
    });
    expect(crossed.size).toBe(people.length);
  });

  it('office.entrance: each wing opens on its own, only while somebody is in its lane', () => {
    const [left, right] = DOOR_LANES;
    const walker = (x: number, z: number, away = false) => ({ away, pos: { x, z } });
    expect(laneBusy(left, [])).toBe(false);
    expect(laneBusy(left, [walker(left.gate.x, left.gate.z)])).toBe(true);
    expect(laneBusy(right, [walker(left.gate.x, left.gate.z)])).toBe(false);
    expect(laneBusy(right, [walker(right.gate.x, right.gate.z + 1)])).toBe(true);
    expect(laneBusy(left, [walker(right.gate.x, right.gate.z + 1)])).toBe(false);
    expect(laneBusy(left, [walker(left.gate.x, left.gate.z, true)])).toBe(false); // away: nobody there
  });
});

describe('fx.materialise: on state', () => {
  it('fx.materialise: the effect starts on the porch when somebody leaves and when they arrive, the entrance door stays closed meanwhile', () => {
    const sim = office();
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    const [p] = atDesks(sim, ['oscar-grob']);
    expect(p.takeFx()).toBeNull();
    expect(sim.presence.send(p, 'errand', sim.nav)).toBe(true);
    // leaving: the 'out' effect fires at the moment they step out onto the porch, not before
    let out: 'in' | 'out' | null = null;
    let at = { x: 0, z: 0 };
    let busy = true;
    expect(
      run(sim, 120, () => out === 'out', () => {
        const e = p.takeFx();
        if (e && !out) {
          out = e;
          at = { ...p.pos };
          busy = DOOR_LANES.some((l) => laneBusy(l, [p]));
        } else expect(e).toBeNull();
      }),
    ).toBe(true);
    expect(p.presence).toBe('out');
    expect(at.z).toBeGreaterThan(DOOR.z);
    expect(at.x).toBeCloseTo(p.lane.out.x, 1);
    expect(busy).toBe(false); // gone from the lane: the wing stays shut
    sim.presence.callBack(p);
    // arriving: the 'in' effect fires on the porch, and the wing does not open while they materialise
    let inFx: 'in' | 'out' | null = null;
    let porch = { x: 0, z: 0 };
    let opened = false;
    expect(
      run(sim, 200, () => inFx === 'in', () => {
        const e = p.takeFx();
        if (e) {
          inFx = e;
          porch = { ...p.pos };
        }
      }),
    ).toBe(true);
    expect(p.presence).toBe('returning');
    expect(porch.z).toBeGreaterThan(DOOR.z);
    expect(porch.x).toBeCloseTo(p.lane.out.x, 1);
    // materialising: they stand on the porch (fx < 1) and are outside the reach of the wing
    run(sim, 3, () => p.fx >= 1, () => {
      if (p.fx < 1) opened ||= DOOR_LANES.some((l) => laneBusy(l, [p]));
    });
    expect(p.fx).toBeLessThan(1.0001);
    expect(opened).toBe(false);
  });
});
