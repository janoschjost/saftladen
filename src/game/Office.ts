import type * as THREE from 'three';
import { screenOffMaterial, screenOnMaterial, type DeskRig } from '../render/officeBuilder';
import type { OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';

export class Desk {
  occupant: Person | null = null;
  /** person this desk is assigned to (1 owner per desk, see `Office.assign`) */
  owner: Person | null = null;
  /** owner on the way to a desk that a squatter still sits at; gets it as soon as the squatter leaves */
  pending: Person | null = null;

  constructor(
    /** seat number shown in the UI, 1-based */
    readonly number: number,
    /** where the sitter's hips end up (centre of the chair cell) */
    readonly seat: Vec2,
    /** free cell behind the chair, where people walk to before sitting down */
    readonly approach: Vec2,
    /** direction the sitter faces (yaw, 0 = +z) */
    readonly yaw: number,
    private rig: DeskRig,
  ) {}

  get root(): THREE.Object3D {
    return this.rig.root;
  }

  setScreen(on: boolean): void {
    this.rig.screen.material = on ? screenOnMaterial() : screenOffMaterial();
  }
}

/** The printer in the archive: one person at a time stands here while a job runs. */
export class Printer {
  occupant: Person | null = null;

  constructor(
    /** free floor cell in front of the printer */
    readonly stand: Vec2,
    /** direction the user faces (yaw, 0 = +z) */
    readonly yaw: number,
    private paper: THREE.Mesh,
  ) {}

  showPaper(on: boolean): void {
    this.paper.visible = on;
  }
}

/** Every desk of the office model becomes a workplace; the approach cell is the first free cell behind the chair. */
export class Office {
  readonly desks: Desk[] = [];
  readonly printer: Printer | null;

  constructor(model: OfficeModel, nav: NavGrid) {
    const stand = nav.nearestWalkable(model.printer.stand, 6);
    this.printer = stand ? new Printer(stand, model.printer.yaw, model.printer.paper) : null;
    for (const d of model.desks) {
      let approach: Vec2 | null = null;
      for (const dist of [1.0, 1.25, 1.5, 1.8, 2.2]) {
        const c = nav.toCell({ x: d.seat.x + d.back.x * dist, z: d.seat.z + d.back.z * dist });
        if (nav.walkable(c.cx, c.cz)) {
          approach = nav.center(c.cx, c.cz);
          break;
        }
      }
      approach ??= nav.nearestWalkable({ x: d.seat.x + d.back.x * 1.2, z: d.seat.z + d.back.z * 1.2 }, 6);
      if (approach) this.desks.push(new Desk(this.desks.length + 1, d.seat, approach, d.yaw, d.rig));
    }
  }

  desk(number: number): Desk | undefined {
    return this.desks[number - 1];
  }

  /** Gives `p` the desk with this number (or no desk). A desk has one owner; a person has one desk. */
  assign(p: Person, number: number | null): void {
    if (p.homeDesk) p.homeDesk.owner = null;
    p.homeDesk = null;
    const d = number ? this.desk(number) : undefined;
    if (!d) return;
    if (d.owner) d.owner.homeDesk = null;
    d.owner = p;
    p.homeDesk = d;
  }

  /**
   * Reserves a desk for `p`. The owner gets their own desk; if somebody else sits there, that person is asked to
   * leave and the desk is handed over once they stand up. Everybody else takes a free desk close by, preferring
   * desks nobody owns. `evict` false = never ask anybody to move (game start). Returns null if nothing is free.
   */
  claim(p: Person, evict = true): Desk | null {
    const own = p.homeDesk;
    if (own && own.pending !== p) {
      if (!own.occupant) {
        own.occupant = p;
        return own;
      }
      if (evict && own.occupant !== p) {
        own.pending = p;
        own.occupant.yieldDesk();
        return own;
      }
    }
    const free = this.desks
      .filter((d) => !d.occupant && !d.pending)
      .map((d) => ({ d, dist: Math.hypot(d.approach.x - p.pos.x, d.approach.z - p.pos.z) }))
      .sort((a, b) => a.dist - b.dist);
    const pool = free.some((f) => !f.d.owner) ? free.filter((f) => !f.d.owner) : free;
    const near = pool.slice(0, 4);
    if (!near.length) return null;
    const desk = near[Math.floor(Math.random() * near.length)].d;
    desk.occupant = p;
    return desk;
  }

  /** `p` lets go of the desk (sat there, or was still waiting for it). */
  release(d: Desk, p: Person): void {
    if (d.pending === p) d.pending = null;
    if (d.occupant !== p) return;
    d.occupant = d.pending;
    d.pending = null;
    d.setScreen(false);
  }
}
