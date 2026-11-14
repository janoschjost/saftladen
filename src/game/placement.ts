import type { Box3 } from 'three';
import { CORRIDOR_POINT, DOOR_SWING, type OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Sim } from './Sim';

/** A place the sim sends people to: fine when a cell within `ring` cells of `at` can be walked to from the corridor. */
interface Target {
  label: string;
  at: Vec2;
  ring: number;
}

/** Something the furniture cuts off: `key` names this one (which door, which seat), `label` is for the message. */
export interface Blockage {
  key: string;
  label: string;
}

/**
 * Every seat and standing spot the simulation sends people to, where the furniture puts it right now. A spot is fine
 * when a way from the corridor ends next to it (`ring` cells of 0.5 m), the way people standing up from a desk look
 * for one (`Office.exit`): the chair, the bench, the machine is in between.
 */
function targets(sim: Sim): Target[] {
  const m = sim.model;
  const spot = (label: string, ring: number) => (at: Vec2) => ({ label, at, ring });
  return [
    ...sim.office.desks.map((d) => spot(`Platz ${d.number}`, 3)(d.seat)),
    spot('den Drucker', 2)(m.printer.stand),
    ...m.foosball.map(spot('den Kicker', 2)),
    ...m.meeting.seats.map(spot('das Sitzungszimmer', 3)),
    ...m.pod.seats.map(spot('das Holzhaus', 4)),
    ...m.kitchen.stands.map(spot('die Kaffeemaschine', 2)),
    ...sim.kitchen.benches.map(spot('den Küchentisch', 3)),
    spot('die Telefonbox', 5)(m.phoneBooth.seat),
    ...m.toilets.cabins.map((c) => spot('das WC', 2)(c.doorPos)),
    ...m.coatRacks.filter((r) => r.root.visible).map((r) => spot('eine Garderobe', 2)({ x: r.root.position.x, z: r.root.position.z })),
    ...m.doors.map((d) => spot('eine Tür', 1)(d.center)),
  ];
}

/** Points on the floor a door's leaf sweeps over between shut (the doorway) and wide open. */
function doorSweep(d: OfficeModel['doors'][number]): Vec2[] {
  const h = d.pivot.position;
  const out: Vec2[] = [];
  for (let i = 0; i <= 8; i++) {
    // the leaf runs along the pivot's local +x; rotation.y = a turns +x to (cos a, -sin a)
    const a = d.base + d.swing * DOOR_SWING * (i / 8);
    for (let k = 1; k <= 6; k++) out.push({ x: h.x + Math.cos(a) * d.width * (k / 6), z: h.z - Math.sin(a) * d.width * (k / 6) });
  }
  return out;
}

const covers = (b: Box3, p: Vec2) => p.x > b.min.x && p.x < b.max.x && p.z > b.min.z && p.z < b.max.z;

/**
 * Checks the furniture where it stands now (room editor). Lists what it cuts off, for the editor's message; empty
 * when the layout is fine: every desk seat, every place the sim sends people to and every door can still be walked
 * to from the corridor (`CORRIDOR_POINT`), and no piece of furniture stands in a doorway or where a door swings.
 * `nav` is a scratch grid of the office's size, rebuilt here from the furniture; the sim's own grid is not touched.
 */
export function blockages(sim: Sim, nav: NavGrid): Blockage[] {
  const m = sim.model;
  const furniture = m.items.flatMap((it) => it.blockers());
  nav.clear();
  nav.blockBoxes(m.blockers());
  const out: Blockage[] = [];
  m.doors.forEach((d, i) => doorSweep(d).some((p) => furniture.some((b) => covers(b, p))) && out.push({ key: `swing ${i}`, label: 'eine Tür' }));
  targets(sim).forEach((t, i) => !nav.openNear(t.at, CORRIDOR_POINT, t.ring) && out.push({ key: `${t.label} ${i}`, label: t.label }));
  return out;
}
