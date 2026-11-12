import type * as THREE from 'three';
import { screenOffMaterial, type DeskRig } from '../render/officeBuilder';
import { screenMaterial, tickScreens, tickTv, useScreen, type ScreenKind } from '../render/screens';
import type { DeskPlacement, OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import { random } from './rng';

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
    public yaw: number,
    private rig: DeskRig,
  ) {}

  get root(): THREE.Object3D {
    return this.rig.root;
  }

  setScreen(on: boolean, show?: { kind: ScreenKind; variant: number }): void {
    const old = this.rig.screen.material as THREE.Material;
    const next = on && show ? screenMaterial(show.kind, show.variant) : screenOffMaterial();
    if (old === next) return;
    useScreen(old, -1);
    useScreen(next, 1);
    this.rig.screen.material = next;
  }

  /** The lit material on this monitor (the dark one while off). */
  get screenMaterial(): THREE.Material {
    return this.rig.screen.material as THREE.Material;
  }

  /** How full the mug on the desk is (0 = empty); null = no mug here. */
  mugFill: number | null = null;

  /** Puts a mug on the desk (or takes it away with null). */
  putMug(fill: number | null): void {
    this.mugFill = fill;
    this.rig.mug.visible = fill !== null;
    this.rig.coffee.visible = fill !== null && fill > 0.03;
  }

  /** The mug is in somebody's hand: gone from the desk, but still theirs. */
  holdMug(): void {
    this.rig.mug.visible = false;
  }
}

/** The printer in the archive: one person at a time stands here while a job runs. */
export class Printer {
  occupant: Person | null = null;

  constructor(
    /** free floor cell in front of the printer */
    readonly stand: Vec2,
    /** direction the user faces (yaw, 0 = +z) */
    public yaw: number,
    private paper: THREE.Mesh,
  ) {}

  showPaper(on: boolean): void {
    this.paper.visible = on;
  }
}

/** One side of the foosball table. */
export class FoosSpot {
  occupant: Person | null = null;
  constructor(
    readonly stand: Vec2,
    /** direction the player faces (yaw, 0 = +z) */
    public yaw: number,
  ) {}
}

/** Foosball table: two people play against each other, one per side. */
export class Foosball {
  constructor(readonly spots: [FoosSpot, FoosSpot]) {}

  get free(): boolean {
    return this.spots.every((s) => !s.occupant);
  }

  /** `a` and `b` walk to the table and play. False when it is busy or somebody can't play. */
  start(a: Person, b: Person, nav: NavGrid): boolean {
    if (!this.free || a === b) return false;
    return a.startFoosball(nav, this.spots[0], b) && b.startFoosball(nav, this.spots[1], a);
  }
}

/** Every desk of the office model becomes a workplace; the approach cell is the first free cell behind the chair. */
export class Office {
  readonly desks: Desk[] = [];
  readonly printer: Printer | null;
  readonly foosball: Foosball | null;
  /** everybody who works here (filled by the game), used to find a foosball opponent */
  readonly people: Person[] = [];

  /** desk -> where the model puts it (the room editor moves the placement, `relayout` follows) */
  private placements = new Map<Desk, DeskPlacement>();

  constructor(
    private model: OfficeModel,
    nav: NavGrid,
  ) {
    const stand = nav.nearestWalkable(model.printer.stand, 6);
    this.printer = stand ? new Printer({ x: stand.x, z: stand.z }, model.printer.stand.yaw, model.printer.paper) : null;
    const spots = model.foosball.map((f) => {
      const stand = nav.nearestWalkable({ x: f.x, z: f.z }, 3);
      return stand ? new FoosSpot({ x: stand.x, z: stand.z }, f.yaw) : null;
    });
    this.foosball = spots[0] && spots[1] ? new Foosball([spots[0], spots[1]]) : null;
    for (const d of model.desks) {
      const approach = this.approachFor(d, nav);
      if (!approach) continue;
      const desk = new Desk(this.desks.length + 1, d.seat, approach, d.yaw, d.rig);
      this.desks.push(desk);
      this.placements.set(desk, d);
    }
  }

  /** Moves the pictures on the monitors (and the meeting-room TV); content runs faster while its sitter works. */
  updateScreens(dt: number): void {
    const typing = new Set<THREE.Material>();
    for (const d of this.desks) if (d.occupant?.working) typing.add(d.screenMaterial);
    tickScreens(dt, typing);
    tickTv(dt);
  }

  /** First free cell behind the chair. */
  private approachFor(d: DeskPlacement, nav: NavGrid): Vec2 | null {
    for (const dist of [1.0, 1.25, 1.5, 1.8, 2.2]) {
      const c = nav.toCell({ x: d.seat.x + d.back.x * dist, z: d.seat.z + d.back.z * dist });
      if (nav.walkable(c.cx, c.cz)) return nav.center(c.cx, c.cz);
    }
    return nav.nearestWalkable({ x: d.seat.x + d.back.x * 1.2, z: d.seat.z + d.back.z * 1.2 }, 6);
  }

  /**
   * Furniture was moved (room editor) and the nav grid rebuilt: desks, printer and foosball spots follow their model
   * positions. Existing objects are updated in place, so people who sit / stand there move along.
   */
  relayout(nav: NavGrid): void {
    const move = (to: Vec2, from: Vec2 | null) => {
      if (!from) return;
      to.x = from.x;
      to.z = from.z;
    };
    for (const desk of this.desks) {
      const d = this.placements.get(desk)!;
      desk.yaw = d.yaw; // `desk.seat` is the placement's own seat object
      move(desk.approach, this.approachFor(d, nav));
    }
    if (this.printer) {
      move(this.printer.stand, nav.nearestWalkable(this.model.printer.stand, 6));
      this.printer.yaw = this.model.printer.stand.yaw;
    }
    this.foosball?.spots.forEach((spot, i) => {
      const f = this.model.foosball[i];
      move(spot.stand, nav.nearestWalkable({ x: f.x, z: f.z }, 3));
      spot.yaw = f.yaw;
    });
  }

  /** `p` asks somebody who is free to play foosball; false when the table is busy or nobody is around. */
  challenge(p: Person, nav: NavGrid): boolean {
    const f = this.foosball;
    if (!f?.free) return false;
    const pool = this.people.filter((o) => o !== p && o.inOffice && !o.held && !o.controlled && !o.talk && !o.meetJob && !o.printJob && !o.foosJob && !o.vapeJob);
    if (!pool.length) return false;
    const other = pool[Math.floor(random() * pool.length)];
    return f.start(p, other, nav);
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
    const desk = near[Math.floor(random() * near.length)].d;
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
    d.putMug(null); // whoever leaves takes their mug along
  }
}
