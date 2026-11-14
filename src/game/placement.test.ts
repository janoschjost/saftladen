import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT } from '../data/layout';
import { installHeadlessDom } from '../test/headlessDom';
import { office } from '../test/office';
import type { Sim } from './Sim';

installHeadlessDom();

/** The office as the app ships it: the furniture where `src/data/layout.json` puts it. */
const shipped = (): Sim =>
  office({
    prepare: (m) => m.items.forEach((it) => it.set(DEFAULT_LAYOUT[it.id])),
  });
const item = (sim: Sim, id: string) => sim.model.items.find((it) => it.id === id)!;

describe('editor.placement', () => {
  it('editor.placement: the shipped layout cuts nobody off', () => {
    expect(shipped().blocked()).toEqual([]);
  });

  it('editor.placement: the plant back in the gap behind desk 27 cuts off the seat', () => {
    const sim = shipped();
    item(sim, 'plant@27.1,9').set({}); // where the office model puts it: in the only way to the chair
    expect(sim.blocked()).toEqual(['Platz 27']);
  });

  it('editor.placement: a plant in a doorway blocks the door', () => {
    const sim = shipped();
    const plant = item(sim, 'plant@-4,5.3');
    const door = sim.model.doors[0];
    plant.set({
      dx: door.center.x - plant.base.x,
      dz: door.center.z - plant.base.z,
    });
    expect(sim.blocked()).toContain('eine Tür');
  });

  it('editor.placement: a plant moved a little along open floor is fine', () => {
    const sim = shipped();
    item(sim, 'plant@-4,5.3').set({ dx: 0.25 });
    expect(sim.blocked()).toEqual([]);
  });
});
