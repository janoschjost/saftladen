import type { Box3 } from 'three';
import { CORRIDOR_POINT, DOOR_SWING, type OfficeModel } from '../render/officeModel';
import type { RoomItem } from '../render/roomItem';
import type { NavGrid, Vec2 } from './NavGrid';
import { Passages } from './Passages';
import type { Sim } from './Sim';

/**
 * A place the sim sends people to: fine when a cell within `ring` cells of `at` can be walked to from the corridor.
 * `id` names it for good (it stays the same when other places come and go). `stand`: people stand there for a while
 * (kicker, printer, coffee machine), on the free cell closest to `at` (within `ring`, as the sim picks it); that very
 * cell has to be reached. `seat`: somebody sits or stands right on `at`, so no other piece may cover it.
 */
interface Target {
  id: string;
  label: string;
  at: Vec2;
  ring: number;
  stand: boolean;
  seat: boolean;
}

/**
 * Something the furniture does that an edit may not add: `key` names this one (which door, which seat, which two
 * pieces), `label` says it for the panel after "… würde" ("Platz 9 versperren"), `who` the piece that does it.
 */
export interface Blockage {
  key: string;
  label: string;
  who?: string;
  /** two pieces in each other, or a piece on a seat: says it for whichever of them was moved */
  inside?: (moved: RoomItem) => string;
  /** two pieces (or a piece and a wall) in each other: how far (`depth`, m² of floor) */
  depth?: number;
}

/** Floor area (m²) a pair has to gain to count as deeper: well below what the smallest editor step adds. */
const DEEPER = 1e-6;

/**
 * What `now` does that `was` did not: the room editor refuses an edit for that. Only what an edit adds counts (a saved
 * layout may already cut something off, and that must not lock every other item). Two pieces that already stand in
 * each other may stay so or come apart, but not go deeper.
 */
export function newBlockages(was: Blockage[], now: Blockage[]): Blockage[] {
  const before = new Map(was.map((b) => [b.key, b]));
  return now.filter((b) => {
    const w = before.get(b.key);
    return !w || (b.depth ?? 0) > (w.depth ?? 0) + DEEPER;
  });
}

/**
 * Every seat and standing spot the simulation sends people to, where the furniture puts it right now. A spot is fine
 * when a way from the corridor ends next to it (`ring` cells of 0.5 m), the way people standing up from a desk look
 * for one (`Office.exit`): the chair, the bench, the machine is in between.
 */
function targets(sim: Sim): Target[] {
  const m = sim.model;
  const spots = (label: string, ring: number, points: ReadonlyArray<Vec2 | null>, kind: { stand?: boolean; seat?: boolean } = {}): Target[] =>
    points.flatMap((at, k) => (at ? [{ id: `${label} ${k}`, label, at, ring, stand: !!kind.stand, seat: kind.seat ?? true }] : []));
  return [
    ...sim.office.desks.flatMap((d) => spots(`Platz ${d.number}`, 3, [d.seat])),
    ...spots('den Drucker', 6, [m.printer.stand], { stand: true }), // the rings of `Office` and `Kitchen`
    ...spots('den Kicker', 3, m.foosball, { stand: true }),
    ...spots('das Sitzungszimmer', 3, m.meeting.seats),
    ...spots('das Holzhaus', 4, m.pod.seats),
    ...spots('die Kaffeemaschine', 2, m.kitchen.stands, { stand: true }),
    ...spots('den Küchentisch', 3, sim.kitchen.benches),
    ...spots('die Telefonbox', 5, [m.phoneBooth.seat]),
    ...spots('das WC', 2, m.toilets.cabins.map((c) => c.doorPos)),
    // a coat stand is a piece of furniture itself: other pieces in it are overlaps
    ...spots('eine Garderobe', 2, m.coatRacks.map((r) => (r.root.visible ? { x: r.root.position.x, z: r.root.position.z } : null)), { seat: false }),
    ...spots('eine Tür', 1, m.doors.map((d) => d.center), { seat: false }),
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

/** Boxes that only touch (one standing on, or against, the other) do not overlap: the same margin as `NavGrid.blockWorld`. */
const TOUCH = 0.02;
const overlap = (a: Box3, b: Box3) =>
  a.min.x + TOUCH < b.max.x && b.min.x + TOUCH < a.max.x && a.min.y + TOUCH < b.max.y && b.min.y + TOUCH < a.max.y && a.min.z + TOUCH < b.max.z && b.min.z + TOUCH < a.max.z;

/**
 * How far `a` and `b` stand in each other: the largest floor area one box of `a` shares with one box of `b` (0: they
 * do not overlap). The largest, not the sum: boxes of one piece overlap each other (the Holzhaus' walls and the room
 * inside it), and a sum would grow when a piece only moves along.
 */
function depth(a: Box3[], b: Box3[]): number {
  let most = 0;
  for (const x of a)
    for (const y of b) if (overlap(x, y)) most = Math.max(most, (Math.min(x.max.x, y.max.x) - Math.max(x.min.x, y.min.x)) * (Math.min(x.max.z, y.max.z) - Math.max(x.min.z, y.min.z)));
  return most;
}

/** One box around all of `boxes` (null when there are none), to skip the far ones at once. */
function around(boxes: Box3[]): Box3 | null {
  return boxes.length ? boxes.reduce((u, b) => u.union(b), boxes[0].clone()) : null;
}

/**
 * Every piece of furniture that stands in a wall, in another piece (`RoomItem.solids`: also in the room inside the
 * Holzhaus) or on a seat or standing spot (its walking footprint), one entry per pair. Things that stand on top of each
 * other (a plant on a desk) only touch and do not count.
 */
function overlaps(m: OfficeModel, footprints: Box3[][], spots: Target[]): Blockage[] {
  const out: Blockage[] = [];
  const pieces = m.items.flatMap((it, i) => {
    const boxes = it.solids();
    const all = around(boxes);
    return all ? [{ it, boxes, all, feet: footprints[i] }] : [];
  });
  pieces.forEach((p, i) => {
    m.walls.forEach((w, k) => {
      const d = overlap(p.all, w) ? depth(p.boxes, [w]) : 0;
      if (d > 0) out.push({ key: `wall ${p.it.id} ${k}`, label: 'in einer Wand stehen', who: p.it.label, depth: d });
    });
    for (let j = i + 1; j < pieces.length; j++) {
      const q = pieces[j];
      const d = overlap(p.all, q.all) ? depth(p.boxes, q.boxes) : 0;
      if (!d) continue;
      const [a, b] = [p.it, q.it];
      const inside = (moved: RoomItem) => `in ${(moved === b ? a : b).label} stehen`;
      out.push({ key: `overlap ${a.id} ${b.id}`, label: inside(a), who: a.label, inside, depth: d });
    }
    // its own seat (a meeting chair's) moves with it and does not count
    for (const t of spots) {
      if (p.it.owns(t.at) || !p.feet.some((b) => covers(b, t.at))) continue;
      const label = `${t.label} zustellen`;
      out.push({ key: `spot ${t.id} ${p.it.id}`, label, who: p.it.label, inside: (moved) => (moved === p.it ? label : `${t.label} unter ${p.it.label} schieben`) });
    }
  });
  return out;
}

/**
 * Checks the furniture where it stands now (room editor). Lists what it does wrong, for the editor's message; empty
 * when the layout is fine:
 * - every desk seat, every place the sim sends people to and every door can still be walked to from the corridor
 *   (`CORRIDOR_POINT`), also while people stand at the kicker, the printer and the coffee machine;
 * - no piece of furniture stands in a doorway or where a door swings;
 * - no piece stands in a wall, in another piece or on a seat or standing spot.
 * The room editor only refuses what an edit adds: a saved layout (or the office model) may already have some of these.
 * `nav` is a scratch grid of the office's size, rebuilt here from the furniture; the sim's own grid is not touched.
 */
export function blockages(sim: Sim, nav: NavGrid): Blockage[] {
  const m = sim.model;
  const footprints = m.items.map((it) => it.blockers());
  const furniture = footprints.flat();
  nav.clear();
  nav.blockBoxes(m.walls);
  nav.blockBoxes(furniture);
  nav.sealUnreachable(CORRIDOR_POINT); // as the sim's own grid (`Sim.blockNav`): nobody is sent into a sealed pocket
  const out: Blockage[] = [];
  m.doors.forEach((d, i) => doorSweep(d).some((p) => furniture.some((b) => covers(b, p))) && out.push({ key: `swing ${i}`, label: 'eine Tür versperren' }));
  const all = targets(sim);
  // the free cell next to a standing spot where the sim puts people (null: there is none)
  const cells = all.map((t) => (t.stand ? nav.nearestWalkable(t.at, t.ring) : null));
  const reach = (t: Target, i: number) => (t.stand ? !!cells[i] && nav.opens(cells[i], CORRIDOR_POINT) : !!nav.openNear(t.at, CORRIDOR_POINT, t.ring));
  const cut = all.map((t, i) => !reach(t, i));
  // Somebody standing still in a narrow passage plugs it for everybody else (`Passages`): a way through the passage
  // somebody plays, prints or gets a coffee in does not count for the other places.
  const passages = new Passages(nav);
  const plugs = cells.map((c) => !!c && passages.at(c) >= 0);
  cells.forEach((c, i) => {
    if (!c || !plugs[i]) return;
    const { cx, cz } = nav.toCell(c);
    nav.block(cx, cz);
  });
  all.forEach((t, i) => {
    if (cut[i]) return;
    if (!plugs[i]) return void (cut[i] = !reach(t, i));
    // a stand that plugs a passage itself: still reachable past the others (two players one behind the other are not)
    const { cx, cz } = nav.toCell(cells[i]!);
    nav.unblock(cx, cz);
    cut[i] = !reach(t, i);
    nav.block(cx, cz);
  });
  all.forEach((t, i) => cut[i] && out.push({ key: t.id, label: `${t.label} versperren` }));
  return [...overlaps(m, footprints, all.filter((t) => t.seat)), ...out]; // what the moved piece itself runs into first, for the message
}
