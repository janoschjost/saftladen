import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MESS_RADIUS, MOULD, type MessKind } from '../render/messProps';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { BIN_FULL, DOOR_CLEAR, MESS_CAPS, MESS_CHANCE, MESS_SURFACES, MOULD_HOURS, type MessItem, type MessType } from './Mess';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

installHeadlessDom();

/**
 * Mess (`Mess.ts`, #254) on the whole office: what people leave behind, where it may lie, how much of it, and that the
 * next working day starts clean. How it looks is checked by eye.
 */

const WHO = 'linda-peter';

/** One step of the mess alone: it compares what everybody does now with the step before. */
const look = (sim: Sim) => sim.mess.update(0, sim.presence.days, sim.people, sim.presence);

/** Somebody does something, then stops: what is left behind. */
function stop(sim: Sim, start: () => void, end: () => void): MessItem[] {
  const before = new Set(sim.mess.list());
  start();
  look(sim);
  end();
  look(sim);
  return sim.mess.list().filter((i) => !before.has(i));
}

describe('office.mess', () => {
  const keep = { ...MESS_CHANCE };
  beforeEach(() => {
    for (const k of Object.keys(MESS_CHANCE) as Array<keyof typeof MESS_CHANCE>) MESS_CHANCE[k] = 1;
  });
  afterEach(() => Object.assign(MESS_CHANCE, keep));

  /** `WHO` stands still in the open office, everything else as the seed has it. */
  function stage(at = { x: 12, z: 7 }): { sim: Sim; p: Person } {
    const sim = office();
    sim.scenario.put(WHO, at, 'pin');
    look(sim);
    return { sim, p: sim.person(WHO) };
  }

  it('office.mess: finished chips leave the bag on the floor nearby', () => {
    const { sim, p } = stage();
    const left = stop(sim, () => (p.snackLeft = 0.01), () => (p.snackLeft = 0));
    expect(left.map((i) => [i.kind, i.on])).toEqual([['chips', 'floor']]);
    const at = sim.mess.where(left[0]);
    expect(Math.hypot(at.x - p.pos.x, at.z - p.pos.z)).toBeLessThan(2.6);
  });

  it('office.mess: a coffee that never made it to a desk leaves the cup, in the kitchen on the bar or the table', () => {
    const { sim, p } = stage();
    const out = stop(sim, () => (p.cupHeld = true), () => (p.cupHeld = false));
    expect(out.map((i) => [i.kind, i.on])).toEqual([['cup', 'floor']]);
    const k = sim.model.kitchen.center;
    sim.scenario.put(WHO, { x: k.x, z: k.z + 1 }, 'pin');
    look(sim);
    const kitchen = stop(sim, () => (p.cupHeld = true), () => (p.cupHeld = false));
    expect(kitchen.map((i) => i.kind)).toEqual(['cup']);
    expect(['bar', 'table']).toContain(kitchen[0].on);
  });

  it('office.mess: getting up from the desk after a coffee leaves the cup (and a bottle, paper) on it', () => {
    const { sim, p } = stage();
    const desk = sim.office.desks[0];
    const left = stop(
      sim,
      () => {
        p.task = { desk, phase: 'work', t: 0, from: desk.seat, remaining: 60, retries: 0, retryIn: 0 };
        desk.putMug(1);
      },
      () => {
        p.task = null;
        desk.putMug(null);
      },
    );
    expect(left.map((i) => i.kind).sort()).toEqual(['bottle', 'cup', 'paper']);
    for (const i of left.filter((x) => x.on === 'desk')) {
      expect(i.desk).toBe(desk);
      expect(i.mesh.parent).toBe(desk.root);
    }
    // two things per desk at most
    expect(sim.mess.list().filter((i) => i.desk === desk).length).toBeLessThanOrEqual(2);
  });

  it('office.mess: printing drops paper by the bin, and the bin overflows after a few jobs', () => {
    const { sim, p } = stage();
    for (let n = 1; n <= BIN_FULL; n++) {
      stop(sim, () => (p.printJob = { phase: 'print', remaining: 0, retries: 0, retryIn: 0 }), () => (p.printJob = null));
      expect(sim.mess.count('bin')).toBe(n >= BIN_FULL ? 1 : 0);
    }
    expect(sim.model.mess.bin.heap.visible).toBe(true);
    const balls = sim.mess.list().filter((i) => i.kind === 'paper');
    expect(balls.length).toBe(BIN_FULL);
    for (const b of balls) expect(sim.model.mess.bin.floor).toContain(b.mesh.parent);
  });

  it('office.mess: a print job cut short (called away) leaves nothing', () => {
    const { sim, p } = stage();
    const left = stop(sim, () => (p.printJob = { phase: 'print', remaining: 3, retries: 0, retryIn: 0 }), () => (p.printJob = null));
    expect(left).toEqual([]);
  });

  it('office.mess: a coffee run keeps the desk: nothing is left on it', () => {
    const { sim, p } = stage();
    const desk = sim.office.desks[0];
    const left = stop(
      sim,
      () => {
        p.task = { desk, phase: 'work', t: 0, from: desk.seat, remaining: 60, retries: 0, retryIn: 0 };
        desk.putMug(1);
      },
      () => {
        // standing up for the run: the task is in its leave phase with the errand, the run itself starts after
        p.task = { desk, phase: 'leave', t: 0, from: desk.seat, remaining: 30, retries: 0, retryIn: 0, errand: { spot: { index: 0, stand: { x: 0, z: 0 }, yaw: 0 }, left: 30 } };
      },
    );
    expect(left).toEqual([]);
  });

  it('office.mess: lunch at the dining table leaves plates and a lunchbox', () => {
    const sim = office();
    const p = sim.person(WHO);
    sim.scenario.put(WHO, 'desk', 'free');
    sim.kitchen.startTable([p], sim.nav);
    expect(run(sim, 240, () => sim.mess.count('plate') > 0)).toBe(true);
    expect(sim.mess.list().find((i) => i.kind === 'plate')!.on).toBe('table');
    expect(sim.mess.count('lunchbox')).toBeGreaterThan(0);
  });

  it('office.mess: coming in, a coat slips off the stand onto the floor nearby', () => {
    const { sim, p } = stage();
    sim.scenario.put(WHO, 'errand');
    look(sim);
    sim.scenario.put(WHO, 'desk');
    look(sim);
    expect(p.presence).toBe('in');
    const jacket = sim.mess.list().find((i) => i.kind === 'jacket')!;
    expect(jacket.on).toBe('floor');
    const at = sim.mess.where(jacket);
    const racks = sim.model.coatRacks.map((r) => r.root.getWorldPosition(new THREE.Vector3()));
    expect(Math.min(...racks.map((r) => Math.hypot(r.x - at.x, r.z - at.z)))).toBeLessThan(2.6);
  });

  it('office.mess: a lunchbox turns green after a few clock hours', () => {
    const sim = office();
    const box = sim.mess.leave('lunchbox', 'counter')!;
    const color = () => ((box.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial).color;
    const fresh = color().clone();
    sim.mess.update(MOULD_HOURS * GAME_HOUR * 0.9, sim.presence.days, [], sim.presence);
    expect(color().equals(fresh)).toBe(true);
    sim.mess.update(MOULD_HOURS * GAME_HOUR * 1.2, sim.presence.days, [], sim.presence);
    const d = (c: THREE.Color) => Math.hypot(c.r - MOULD.r, c.g - MOULD.g, c.b - MOULD.b);
    expect(d(color())).toBeLessThan(d(fresh) * 0.3);
  });
});

describe('office.mess-spots', () => {
  for (const seed of [1, 2, 3]) {
    it(`office.mess-spots: event mess fills every type up to its cap, on valid spots that keep off doorways, passages, gear and each other (seed ${seed})`, () => {
      const sim = office({}, seed);
      expect(sim.events.trigger('mess')).toMatch(/^Chaos: \d+ Sachen/);
      for (const kind of Object.keys(MESS_CAPS) as MessType[]) expect([kind, sim.mess.count(kind)]).toEqual([kind, MESS_CAPS[kind]]);
      const items = sim.mess.list();
      expect(new Set(items.map((i) => i.slot)).size).toBe(items.length);
      for (const i of items) {
        expect(MESS_SURFACES[i.kind]).toContain(i.on);
        if (i.kind === 'bin') continue;
        expect(i.mesh.parent).not.toBeNull();
        if (i.on !== 'floor') continue;
        const at = sim.mess.where(i);
        const r = MESS_RADIUS[i.kind as MessKind];
        // off the doorways and passages, on walkable floor (no furniture), clear of every other thing on the floor
        for (const d of sim.model.doors) expect(Math.hypot(d.center.x - at.x, d.center.z - at.z)).toBeGreaterThanOrEqual(DOOR_CLEAR);
        expect(sim.traffic.passages.at(at)).toBe(-1);
        // (the balls by the paper bin lie on their own spots next to the printer, off the walking floor)
        if (!sim.model.mess.bin.floor.includes(i.mesh.parent!)) expect(sim.mess.floorOk(at, r, i)).toBe(true);
        for (const o of items) {
          if (o === i || o.on !== 'floor') continue;
          const b = sim.mess.where(o);
          expect(Math.hypot(b.x - at.x, b.z - at.z)).toBeGreaterThanOrEqual(r + MESS_RADIUS[o.kind as MessKind]);
        }
      }
      // full: nothing more is added, the caps hold
      expect(sim.events.trigger('mess')).toBe('Chaos: mehr passt nicht mehr hin');
      expect(sim.mess.count()).toBe(items.length);
    });
  }

  it('office.mess-spots: the same seed puts the same mess on the same spots', () => {
    const spots = () => {
      const sim = office();
      sim.events.trigger('mess');
      return sim.mess.list().map((i) => [i.kind, i.slot]);
    };
    expect(spots()).toEqual(spots());
  });
});

describe('office.mess-reset', () => {
  it('office.mess-reset: the mess stays through the day, the night ghost can list it, take one and clear it all', () => {
    const sim = office();
    sim.events.trigger('mess');
    const n = sim.mess.count();
    run(sim, 30);
    expect(sim.mess.count()).toBeGreaterThanOrEqual(n);
    const item = sim.mess.list().find((i) => i.kind === 'cup')!;
    expect(sim.mess.take(item)).toBe(true);
    expect(sim.mess.list()).not.toContain(item);
    expect(item.mesh.parent).toBeNull();
    expect(sim.mess.take(item)).toBe(false);
    const bin = sim.mess.list().find((i) => i.kind === 'bin')!;
    sim.mess.take(bin);
    expect(sim.model.mess.bin.heap.visible).toBe(false);
    sim.mess.clear();
    expect(sim.mess.count()).toBe(0);
  });

  it('office.mess-reset: the next working day (04:00) starts clean', () => {
    const sim = office();
    sim.step(1 / 60);
    sim.events.trigger('mess');
    const meshes = sim.mess.list().map((i) => i.mesh);
    sim.presence.days++;
    sim.step(1 / 60);
    expect(sim.mess.count()).toBe(0);
    expect(sim.model.mess.bin.heap.visible).toBe(false);
    for (const m of meshes) if (m !== sim.model.mess.bin.heap) expect(m.parent).toBeNull();
  });

  it('office.mess-event: mess-end clears it, and says "nicht möglich" when there is nothing to clear', () => {
    const sim = office();
    expect(sim.events.trigger('mess-end')).toMatch(/nicht möglich/);
    sim.events.trigger('mess');
    expect(sim.events.trigger('mess-end')).toBe('Alles aufgeräumt');
    expect(sim.mess.count()).toBe(0);
  });
});
