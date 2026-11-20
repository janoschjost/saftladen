import * as THREE from 'three';
import { FliesFx } from '../render/fliesFx';
import { buildMess, MESS_RADIUS, mouldy, type MessKind } from '../render/messProps';
import { OFFICE_D, PORCH, type OfficeModel } from '../render/officeModel';
import { TableSession } from './Coffee';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Desk } from './Office';
import type { Passages } from './Passages';
import type { Person } from './Person';
import type { Presence } from './Presence';
import { stream } from './rng';
import { GAME_HOUR } from './Smoke';

/** What can lie around: the props of `messProps.ts`, and the paper bin by the printer when it overflows. */
export type MessType = MessKind | 'bin';
/** Where a piece of mess lies. */
export type Surface = 'desk' | 'floor' | 'table' | 'bar' | 'counter' | 'bin';

/** At most this many of each type at once, so the office stays readable. */
export const MESS_CAPS: Readonly<Record<MessType, number>> = { cup: 6, bottle: 4, paper: 6, chips: 4, plate: 4, lunchbox: 3, jacket: 2, bin: 1 };
/** Where each type may lie (`mess` fills them in this order of preference, picked by dice). */
export const MESS_SURFACES: Readonly<Record<MessType, readonly Surface[]>> = {
  cup: ['desk', 'bar', 'table', 'floor'],
  bottle: ['desk', 'bar', 'floor'],
  paper: ['desk', 'floor', 'bar'],
  chips: ['floor'],
  plate: ['table'],
  lunchbox: ['table', 'bar', 'counter'],
  jacket: ['floor'],
  bin: ['bin'],
};
/** A lunchbox starts to turn green after this many clock hours and is fully green after twice as many. */
export const MOULD_HOURS = 2;
/** A lunchbox draws flies once it is this far gone (0 fresh .. 1 mouldy), 2 at first and up to `MAX_FLIES_PER_BOX` when fully mouldy. */
export const FLIES_FROM = 0.25;
export const MAX_FLIES_PER_BOX = 5;
/** Print jobs until the paper bin by the printer overflows. */
export const BIN_FULL = 4;
/** Floor kept clear around a doorway (m). */
export const DOOR_CLEAR = 1.2;
/** A print job that ends with this many seconds or less left was finished (one step); more: it was cut short. */
const PRINT_DONE = 0.1;
/** Chips that end with this many seconds or less left were eaten up (one step). */
const SNACK_DONE = 0.1;
/** How far from where it happened something may land on the floor (m). */
const NEAR = 2.5;
/** Air between two things on the floor (m). */
const FLOOR_GAP = 0.05;

/** Chances that something is left behind when somebody… (a test sets them to 1) */
export const MESS_CHANCE = {
  /** …puts a cup down that never made it to a desk (it ran out, they were called away) */
  cup: 0.6,
  /** …gets up from the desk after a coffee (the cup stays) */
  deskCup: 0.3,
  /** …gets up from the desk (a bottle, a ball of paper) */
  deskBottle: 0.08,
  deskPaper: 0.12,
  /** …has finished the chips */
  chips: 0.5,
  /** …printed (a ball of paper by the bin; once the bin overflows, more) */
  print: 0.25,
  printFull: 0.6,
  /** …gets up from the dining table */
  plate: 0.6,
  tableLunchbox: 0.15,
  /** …is back from lunch */
  lunchbox: 0.35,
  /** …comes in (a coat slips off the stand) */
  jacket: 0.04,
};

const dice = stream(0x6d657373);
const pick = <T>(list: readonly T[]): T => list[Math.floor(dice() * list.length)];

export interface MessItem {
  readonly kind: MessType;
  readonly on: Surface;
  /** what shows (the bin: its heap) */
  readonly mesh: THREE.Object3D;
  /** the desk it lies on */
  readonly desk: Desk | null;
  /** one item per slot: marker, desk spot or floor cell */
  readonly slot: string;
  /** seconds since it was left */
  age: number;
}

/** What `Mess` needs of the office besides the model. */
export interface MessOffice {
  desks: readonly Desk[];
  /** points on the floor to keep clear and how far (seats, standing spots, where people gather) */
  keepOff: () => ReadonlyArray<{ x: number; z: number; r: number }>;
  /** where the coat stands are now */
  racks: () => Vec2[];
  /** the middle of the kitchen */
  kitchen: Vec2;
}

interface Seen {
  presence: Person['presence'];
  cup: boolean;
  /** the desk they work at, and whether their coffee stands on it */
  desk: Desk | null;
  mug: boolean;
  /** printing, and the seconds the job still had (a job cut short leaves nothing) */
  printing: boolean;
  printLeft: number;
  /** why they were away (a smoke break or fetching the post on the porch is no arrival) */
  away: Person['awayKind'];
  snack: boolean;
  /** seconds the chips still lasted (more than a step: something else took over, they were binned) */
  snackLeft: number;
  table: boolean;
  lunch: boolean;
}

/** What a search for a spot on the floor keeps clear of. */
interface Floor {
  keep: ReadonlyArray<{ x: number; z: number; r: number }>;
  things: Array<{ item: MessItem; at: Vec2; r: number }>;
}

const v = new THREE.Vector3();
/** points of a footprint, in radii: the middle, the corners, the middle of each edge (closer than a nav cell, so every cell it covers is seen) */
const CORNERS = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dz) => [dx, dz] as const));
const q = { x: 0, z: 0 };

/**
 * Mess (#254): over the day people leave things lying around the office (cups, bottles, paper, chip bags, plates,
 * lunchboxes, a jacket that slipped off a stand, an overflowing paper bin). It comes from what they do, lies on seeded
 * spots that keep off doorways, passages, gear and each other, at most `MESS_CAPS` of each type, and stays until it is
 * taken (`take`, `clear`: for the night ghost) or the next working day's 04:00 clears it. Rolls its own dice, so it never
 * shifts the simulation's numbers.
 */
export class Mess {
  private readonly items: MessItem[] = [];
  private seen = new Map<Person, Seen>();
  /** print jobs since the bin was last emptied */
  private binFill = 0;
  /** the working day the mess belongs to (null: not yet seen) */
  private days: number | null = null;
  /** the flies around the mouldy lunchboxes: one shared effect */
  private readonly flies: FliesFx;
  /** the flies' spots as last set, to see when they change */
  private fliesKey = '';

  constructor(
    private world: THREE.Object3D,
    private model: OfficeModel['mess'],
    private nav: NavGrid,
    private passages: Passages,
    private office: MessOffice,
  ) {
    this.flies = new FliesFx(world);
  }

  /** How many flies are out now. */
  get flyCount(): number {
    return this.flies.count;
  }

  /** Everything that lies around now (for the night ghost: what to clean, and where). */
  list(): readonly MessItem[] {
    return this.items;
  }

  count(kind?: MessType): number {
    return kind ? this.items.filter((i) => i.kind === kind).length : this.items.length;
  }

  /** Where an item lies now (game coordinates; its furniture may have moved). */
  where(item: MessItem): Vec2 {
    return worldXZ(item.mesh);
  }

  /** Somebody cleans one item away. False when it is not (or no longer) there. */
  take(item: MessItem): boolean {
    const i = this.items.indexOf(item);
    if (i < 0) return false;
    this.items.splice(i, 1);
    this.showFlies();
    if (item.kind === 'bin') {
      item.mesh.visible = false;
      this.binFill = 0;
    } else {
      item.mesh.removeFromParent();
      const m = item.mesh as THREE.Mesh;
      m.geometry.dispose();
      if (item.kind === 'lunchbox') (m.material as THREE.Material).dispose(); // its own, to turn green
    }
    return true;
  }

  /** All the mess is gone at once. */
  clear(): void {
    for (const item of [...this.items]) this.take(item);
    this.binFill = 0;
  }

  /** The whole office is messy at once (dev event `mess`): every type up to its cap. Returns how many things were added. */
  fill(): number {
    let added = 0;
    for (const kind of Object.keys(MESS_CAPS) as MessType[]) {
      for (let tries = 0; this.count(kind) < MESS_CAPS[kind] && tries < 40; tries++) {
        const on = pick(MESS_SURFACES[kind]);
        const near = on === 'floor' && kind === 'paper' && dice() < 0.4 ? 'printer' : undefined;
        if (this.leave(kind, near ?? on)) added++;
      }
    }
    // the lunchboxes have been there long enough to be mouldy and draw flies
    for (const item of this.items) if (item.kind === 'lunchbox') item.age = Math.max(item.age, 2 * MOULD_HOURS * GAME_HOUR);
    this.mould();
    return added;
  }

  /**
   * Leaves a piece of `kind` on `on` ('printer': the floor by the paper bin): near `near` (the closest free spots,
   * picked by dice; anywhere without it), on `desk` for a desk. Null when the type is at its cap or there is no free spot.
   */
  leave(kind: MessType, on: Surface | 'printer', near?: Vec2, desk?: Desk): MessItem | null {
    if (this.count(kind) >= MESS_CAPS[kind]) return null;
    if (kind === 'bin') return this.overflow();
    const mesh = buildMess(kind, Math.floor(dice() * 64));
    mesh.rotation.y = dice() * Math.PI * 2;
    const slot = this.place(kind, on, mesh, near, desk);
    if (!slot) return null;
    const item: MessItem = { kind, on: on === 'printer' ? 'floor' : on, mesh, desk: slot.desk ?? null, slot: slot.key, age: 0 };
    this.items.push(item);
    return item;
  }

  /**
   * Is `p` a fine spot on the floor for something of radius `r`: walkable all round, no passage or doorway, nobody's
   * spot, nothing else there. `floor`: what is in the way, taken once for a whole search (`floorNow`).
   */
  floorOk(p: Vec2, r: number, except?: MessItem, floor = this.floorNow()): boolean {
    for (const [dx, dz] of CORNERS) {
      q.x = p.x + dx * r;
      q.z = p.z + dz * r;
      const { cx, cz } = this.nav.toCell(q);
      if (!this.nav.walkable(cx, cz) || this.passages.at(q) >= 0) return false;
    }
    if (p.z + r > OFFICE_D && p.x > PORCH.x - 0.5) return false; // the porch is outside
    if (floor.keep.some((k) => dist(k, p) < k.r + r)) return false;
    return !this.hitsFloorItem(p, r, floor, except);
  }

  /** The spots to keep clear and where the things on the floor lie, for one search. */
  private floorNow(): Floor {
    const things = this.items.filter((o) => o.on === 'floor').map((item) => ({ item, at: this.where(item), r: MESS_RADIUS[item.kind as MessKind] }));
    return { keep: this.office.keepOff(), things };
  }

  /** Something on the floor is closer to `p` than both their sizes. */
  private hitsFloorItem(p: Vec2, r: number, floor: Floor, except?: MessItem): boolean {
    return floor.things.some((t) => t.item !== except && dist(t.at, p) < r + t.r + FLOOR_GAP);
  }

  /** Puts `mesh` on a free spot; the slot it took, or null. */
  private place(kind: MessKind, on: Surface | 'printer', mesh: THREE.Object3D, near?: Vec2, desk?: Desk): { key: string; desk?: Desk } | null {
    const taken = new Set(this.items.map((i) => i.slot));
    if (on === 'desk') {
      const desks = desk ? [desk] : this.office.desks;
      const free = desks.flatMap((d) => d.messSpots.map((s, i) => ({ d, s, key: `desk:${d.number}:${i}` }))).filter((c) => !taken.has(c.key) && this.deskRoom(c.d));
      if (!free.length) return null;
      const { d, s, key } = pick(free);
      mesh.position.set(s.x, 0.75, s.z);
      d.root.add(mesh);
      return { key, desk: d };
    }
    if (on === 'floor') {
      const r = MESS_RADIUS[kind];
      const spot = near ? this.floorNear(near, r) : this.floorAnywhere(r);
      if (!spot) return null;
      mesh.position.set(spot.x, 0, spot.z);
      this.world.add(mesh);
      return { key: `floor:${spot.x.toFixed(2)},${spot.z.toFixed(2)}` };
    }
    if (on === 'bin') return null; // the heap shows instead (`overflow`)
    const markers = on === 'printer' ? this.model.bin.floor : this.model[on];
    const floor = on === 'printer' ? this.floorNow() : null;
    let free = markers.map((m, i) => ({ m, at: worldXZ(m), key: `${on}:${i}` })).filter((c) => !taken.has(c.key));
    if (floor) free = free.filter((c) => !this.hitsFloorItem(c.at, MESS_RADIUS[kind], floor));
    if (!free.length) return null;
    if (near) {
      // the closest few, by dice
      free.sort((a, b) => dist(a.at, near) - dist(b.at, near));
      free = free.slice(0, 3);
    }
    const { m, key } = pick(free);
    mesh.position.set(0, 0, 0);
    m.add(mesh);
    return { key };
  }

  /** Two items on one desk at most, so it does not drown. */
  private deskRoom(d: Desk): boolean {
    return this.items.filter((i) => i.desk === d).length < 2;
  }

  /** A free spot on the floor within `NEAR` of `p`: one of the closest few, by dice. */
  private floorNear(p: Vec2, r: number): Vec2 | null {
    const cell = this.nav.cell;
    const reach = Math.ceil(NEAR / cell);
    const { cx, cz } = this.nav.toCell(p);
    const floor = this.floorNow();
    const found: Array<{ at: Vec2; d: number }> = [];
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const c = this.nav.center(cx + dx, cz + dz);
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d > NEAR || !this.nav.inside(cx + dx, cz + dz)) continue;
        const at = this.jitter(c, r);
        if (this.floorOk(at, r, undefined, floor)) found.push({ at, d });
      }
    }
    found.sort((a, b) => a.d - b.d);
    return found.length ? pick(found.slice(0, 5)).at : null;
  }

  /** A free spot anywhere on the office floor. */
  private floorAnywhere(r: number): Vec2 | null {
    const floor = this.floorNow();
    for (let t = 0; t < 60; t++) {
      const cx = Math.floor(dice() * this.nav.cols);
      const cz = Math.floor(dice() * this.nav.rows);
      if (!this.nav.walkable(cx, cz)) continue;
      const at = this.jitter(this.nav.center(cx, cz), r);
      if (this.floorOk(at, r, undefined, floor)) return at;
    }
    return null;
  }

  /** A bit off the middle of the cell, never past its edge. */
  private jitter(c: Vec2, r: number): Vec2 {
    const room = Math.max(0, this.nav.cell / 2 - r) * 0.8;
    return { x: c.x + (dice() - 0.5) * 2 * room, z: c.z + (dice() - 0.5) * 2 * room };
  }

  /** The paper bin overflows: the heap shows. */
  private overflow(): MessItem {
    const heap = this.model.bin.heap;
    heap.visible = true;
    this.binFill = Math.max(this.binFill, BIN_FULL);
    const item: MessItem = { kind: 'bin', on: 'bin', mesh: heap, desk: null, slot: 'bin', age: 0 };
    this.items.push(item);
    return item;
  }

  /** Mess left by what people did since the last step; lunchboxes get older; a new working day clears everything. */
  update(dt: number, days: number, people: readonly Person[], presence: Presence): void {
    if (days !== this.days) {
      if (this.days !== null) this.clear();
      this.days = days;
    }
    for (const item of this.items) item.age += dt;
    this.mould();
    this.flies.update(dt);
    for (const p of people) {
      const now = this.look(p, presence);
      const was = this.seen.get(p);
      this.seen.set(p, now);
      if (was) this.compare(p, was, now);
    }
  }

  /** Lunchboxes turn green with age, and the old ones get flies. */
  private mould(): void {
    for (const item of this.items) if (item.kind === 'lunchbox') mouldy(item.mesh as THREE.Mesh, mouldAmount(item));
    this.showFlies();
  }

  /** Flies around every lunchbox that is far gone; the spots are only handed on when they change. */
  private showFlies(): void {
    const spots: Array<{ x: number; y: number; z: number; n: number }> = [];
    for (const item of this.items) {
      const n = fliesAround(item);
      if (!n) continue;
      item.mesh.getWorldPosition(v);
      spots.push({ x: v.x, y: v.y, z: v.z, n });
    }
    const key = spots.map((s) => `${s.x.toFixed(2)},${s.y.toFixed(2)},${s.z.toFixed(2)},${s.n}`).join('|');
    if (key === this.fliesKey) return;
    this.fliesKey = key;
    this.flies.set(spots);
  }

  private look(p: Person, presence: Presence): Seen {
    const desk = p.working ? p.task!.desk : null;
    return {
      presence: p.presence,
      cup: p.cupHeld,
      desk,
      mug: !!desk && desk.mugFill !== null,
      printing: p.printJob?.phase === 'print',
      printLeft: p.printJob?.remaining ?? 0,
      away: p.awayKind,
      snack: p.snackLeft > 0,
      snackLeft: p.snackLeft,
      table: p.talk instanceof TableSession && p.meetSeated,
      lunch: presence.atLunch(p),
    };
  }

  /** What `p` stopped doing since the last step, and what it leaves behind. */
  private compare(p: Person, was: Seen, now: Seen): void {
    const kitchen = this.office.kitchen;
    const at = { x: p.pos.x, z: p.pos.z };
    const roll = (chance: number) => dice() < chance;
    // a cup that never made it to a desk: put down where they are (in the kitchen on the counter)
    if (was.cup && !now.cup && !was.desk && !p.working && !p.drink && now.presence === 'in' && roll(MESS_CHANCE.cup)) {
      if (!(dist(at, kitchen) < 3.5 && this.leave('cup', pick(['bar', 'table'] as const), at))) this.leave('cup', 'floor', at);
    }
    // up from the desk: the coffee cup, a bottle, a ball of paper may stay
    // (not on a coffee or snack run: the desk is kept for them, they come back to it)
    if (was.desk && was.desk !== now.desk && p.run?.desk !== was.desk && !(p.task?.desk === was.desk && p.task.errand)) {
      const d = was.desk;
      if (was.mug && roll(MESS_CHANCE.deskCup)) this.leave('cup', 'desk', undefined, d);
      if (roll(MESS_CHANCE.deskBottle)) this.leave('bottle', 'desk', undefined, d);
      if (roll(MESS_CHANCE.deskPaper)) this.leave('paper', roll(0.5) ? 'desk' : 'floor', d.seat, d);
    }
    if (was.printing && !now.printing && was.printLeft <= PRINT_DONE) {
      this.binFill++;
      if (this.binFill >= BIN_FULL) this.leave('bin', 'bin');
      if (roll(this.binFill >= BIN_FULL ? MESS_CHANCE.printFull : MESS_CHANCE.print)) this.leave('paper', 'printer');
    }
    if (was.snack && !now.snack && was.snackLeft <= SNACK_DONE && now.presence === 'in' && roll(MESS_CHANCE.chips)) this.leave('chips', 'floor', at);
    if (was.table && !now.table) {
      if (roll(MESS_CHANCE.plate)) this.leave('plate', 'table', at);
      if (roll(MESS_CHANCE.tableLunchbox)) this.leave('lunchbox', pick(MESS_SURFACES.lunchbox), at);
    }
    if ((was.presence === 'out' || was.presence === 'returning') && now.presence === 'in' && was.away !== 'smoke' && was.away !== 'mail') {
      if (was.lunch && roll(MESS_CHANCE.lunchbox)) this.leave('lunchbox', pick(MESS_SURFACES.lunchbox), kitchen);
      const racks = this.office.racks();
      if (racks.length && roll(MESS_CHANCE.jacket)) this.leave('jacket', 'floor', pick(racks));
    }
  }
}

/** How far a lunchbox has turned green: 0 fresh .. 1 mouldy. */
const mouldAmount = (item: MessItem): number => Math.min(1, Math.max(0, (item.age / GAME_HOUR - MOULD_HOURS) / MOULD_HOURS));

/** How many flies buzz around `item`: none unless it is a lunchbox gone green, then more the older it is. */
export function fliesAround(item: MessItem): number {
  if (item.kind !== 'lunchbox') return 0;
  const amount = mouldAmount(item);
  if (amount < FLIES_FROM) return 0;
  const span = (amount - FLIES_FROM) / (1 - FLIES_FROM);
  return Math.min(MAX_FLIES_PER_BOX, 2 + Math.floor(span * (MAX_FLIES_PER_BOX - 1)));
}

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.z - b.z);
const worldXZ = (o: THREE.Object3D): Vec2 => {
  o.getWorldPosition(v);
  return { x: v.x, z: v.z };
};
