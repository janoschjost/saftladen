import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LAYOUT } from '../data/layout';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, STEP } from '../test/office';
import { newBlockages } from './placement';
import type { Sim } from './Sim';

installHeadlessDom();

/** The office as the app ships it: the furniture where `src/data/layout.json` puts it. */
const shipped = (): Sim =>
  office({
    prepare: (m) => m.items.forEach((it) => it.set(DEFAULT_LAYOUT[it.id])),
  });
const labels = (sim: Sim) => sim.blocked().map((b) => b.label);
const item = (sim: Sim, id: string) => sim.model.items.find((it) => it.id === id)!;
/** What `edit` adds to what the furniture already does (the room editor refuses an edit for that, see `newBlockages`). */
function adds(sim: Sim, edit: () => void, by: 'label' | 'key' = 'label'): string[] {
  const was = sim.blocked();
  edit();
  return newBlockages(was, sim.blocked()).map((b) => b[by]);
}
/** Moves `id` so that the middle of its footprint lands on `at`. */
function moveTo(sim: Sim, id: string, at: { x: number; z: number }): void {
  const it = item(sim, id);
  it.set({ dx: it.dx + at.x - it.x, dz: it.dz + at.z - it.z });
}

/** the Holzhaus (pod) */
const POD = 'group@-1.9,2.2';

describe('editor.placement', () => {
  it('editor.placement: the shipped layout cuts nobody off', () => {
    expect(shipped().blocked().filter((b) => !/^(wall|overlap|spot) /.test(b.key)).map((b) => b.label)).toEqual([]);
  });

  it('editor.placement: the plant back in the gap behind desk 27 cuts off the seat', () => {
    const sim = shipped();
    expect(adds(sim, () => item(sim, 'plant@27.1,9').set({}))).toEqual(['Platz 27 versperren']); // where the office model puts it: in the only way to the chair
  });

  it('editor.placement: a plant in a doorway blocks the door', () => {
    const sim = shipped();
    const plant = item(sim, 'plant@-4,5.3');
    const door = sim.model.doors[0];
    plant.set({
      dx: door.center.x - plant.base.x,
      dz: door.center.z - plant.base.z,
    });
    expect(labels(sim)).toContain('eine Tür versperren');
  });

  it('editor.placement: two blocked doors are two blockages (the editor refuses the second one on its own)', () => {
    const sim = shipped();
    for (const [id, door] of [['plant@-4,5.3', sim.model.doors[0]], ['plant@-9.1,0.57', sim.model.doors[1]]] as const) {
      const plant = item(sim, id);
      plant.set({ dx: door.center.x - plant.base.x, dz: door.center.z - plant.base.z });
    }
    const keys = sim.blocked().map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(sim.blocked().filter((b) => b.key.startsWith('swing'))).toHaveLength(2);
  });

  it('editor.placement: a plant moved a little along open floor is fine', () => {
    const sim = shipped();
    expect(adds(sim, () => item(sim, 'plant@-4,5.3').set({ dx: 0.25 }))).toEqual([]);
  });

  it('editor.placement: a plant pushed into a desk, into the kicker or into a wall overlaps it', () => {
    const sim = shipped();
    // Tisch 13, out in the open office
    const top = item(sim, 'desk@8.672,8.233').bounds().getCenter(new THREE.Vector3());
    expect(adds(sim, () => moveTo(sim, 'plant@-4,5.3', top))).toContain('in Tisch 13 stehen');
    const kicker = item(sim, 'foosball');
    expect(adds(sim, () => moveTo(sim, 'plant@-4,5.3', kicker))).toContain('in Tischkicker stehen');
    const plant = item(sim, 'plant@-4,5.3');
    // the nearest wall south of it
    const b = plant.bounds();
    const south = Math.min(...sim.model.walls.filter((w) => w.min.x < b.max.x && w.max.x > b.min.x && w.min.z >= b.max.z).map((w) => w.min.z));
    expect(adds(sim, () => plant.set({ dz: plant.dz + south - b.max.z + 0.3 }))).toContain('in einer Wand stehen'); // 0.3 m into it
  });

  it('editor.placement: a coat stand or a meeting chair taken away and put back covers nothing new (its own spot moves with it)', () => {
    const sim = shipped();
    for (const id of ['coat-rack@-5.6,5', 'chair@22,4.25']) {
      expect(adds(sim, () => item(sim, id).set({ hidden: true }))).toEqual([]);
      expect(adds(sim, () => item(sim, id).set({}))).toEqual([]);
    }
  });

  it('editor.placement: a plant on the spot where a kicker player stands covers it', () => {
    const sim = shipped();
    expect(adds(sim, () => moveTo(sim, 'plant@-4,5.3', sim.model.foosball[1]))).toContain('den Kicker zustellen');
  });

  it('editor.placement: pieces that already stand in each other (a plant in a desk end, the counter against desks 8 to 10) do not count, and move along with each other', () => {
    const sim = shipped();
    expect(labels(sim)).toContain('in Tisch 2 stehen');
    expect(adds(sim, () => item(sim, 'plant@-9.1,0.57').set({ dz: 0.05 }))).toEqual([]);
    expect(adds(sim, () => item(sim, 'reception-counter').set({ dz: -0.05 }))).toEqual([]);
  });

  it('editor.placement: a plant that already stands in the Holzhaus may come out of it or move along it, but not go deeper', () => {
    const sim = shipped();
    const plant = item(sim, 'plant@-4,5.3'); // in front of the Holzhaus, its foliage in the house
    const pair = `overlap ${POD} ${plant.id}`;
    expect(sim.blocked().map((b) => b.key)).toContain(pair);
    const at = { dx: plant.dx, dz: plant.dz };
    expect(adds(sim, () => plant.set({ ...at, dz: at.dz - 0.25 }), 'key')).toEqual([pair]); // north, deeper into the house
    plant.set(at);
    expect(adds(sim, () => plant.set({ ...at, dz: at.dz + 0.25 }))).toEqual([]); // south, out of it
    plant.set(at);
    expect(adds(sim, () => plant.set({ ...at, dx: at.dx + 0.05 }))).toEqual([]); // east, along its front
  });

  it('editor.placement: no plant goes into the Holzhaus, through its open front or its walls, onto its benches or seats', () => {
    const sim = shipped();
    const pod = item(sim, POD).bounds();
    const seat = sim.model.pod.seats[0];
    const inside = [
      { x: (pod.min.x + pod.max.x) / 2, z: pod.max.z - 0.45 }, // the open front, between the side benches
      { x: pod.min.x + 0.6, z: (pod.min.z + pod.max.z) / 2 }, // a side bench
      { x: pod.max.x - 0.4, z: pod.min.z + 0.4 }, // the back corner, behind the other bench
      { x: seat.x, z: seat.z }, // a seat on the back bench
    ];
    for (const plant of sim.model.items.filter((it) => it.kind === 'plant')) {
      const at = plant.override ?? {};
      for (const p of inside) {
        const keys = adds(sim, () => moveTo(sim, plant.id, p), 'key');
        expect(keys.some((k) => k.startsWith('overlap ') && k.includes(POD)), `${plant.id} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}: ${keys.join(', ')}`).toBe(true);
        plant.set(at);
      }
    }
  });
});

/** Longest time (game seconds) somebody on their way stands still, over `seconds` of the office at work with the kicker in use. */
function longestStandstill(sim: Sim, seconds: number): number {
  const [a, b] = GROUP.map((id) => sim.person(id));
  const still = new Map<string, number>();
  const last = new Map<string, { x: number; z: number }>();
  let worst = 0;
  for (let n = 0; n < seconds / STEP; n++) {
    if (n % 600 === 0 && sim.office.foosball?.free) sim.office.foosball.start(a, b, sim.nav); // a game whenever the table is free
    sim.tod.update(STEP);
    sim.step(STEP);
    if (n % 60) continue; // once a second
    for (const p of sim.people) {
      const was = last.get(p.id);
      last.set(p.id, { ...p.pos });
      const on = !p.away && p.state === 'walk' && p.path.length > 0;
      const s = on && was && Math.hypot(p.pos.x - was.x, p.pos.z - was.z) < 0.25 ? (still.get(p.id) ?? 0) + 1 : 0;
      still.set(p.id, s);
      worst = Math.max(worst, s);
    }
  }
  return worst;
}

describe('editor.placement with people walking', () => {
  // a plant on the lounge side of the kicker, its corner on the table's: the lounge is left with the one-cell lane
  // past the far kicker player, who stands in it for the whole game
  const BY_KICKER = { x: 8.5, z: 11 };

  it('editor.placement: a plant that leaves only the way past a kicker player is refused (people got stuck behind the player)', () => {
    const sim = shipped();
    expect(adds(sim, () => moveTo(sim, 'plant@-4,5.3', BY_KICKER))).toEqual(['den Kicker versperren']);
    sim.relayout();
    expect(longestStandstill(sim, 240)).toBeGreaterThan(10);
  });

  it('editor.placement: with the plant half a metre over (east and south) there is still a way round on open floor: people walk round it, and it is accepted', () => {
    const sim = shipped();
    expect(adds(sim, () => moveTo(sim, 'plant@-4,5.3', { x: BY_KICKER.x + 0.5, z: BY_KICKER.z + 0.5 }))).toEqual([]);
    sim.relayout();
    expect(longestStandstill(sim, 240)).toBeLessThan(10);
  });
});
