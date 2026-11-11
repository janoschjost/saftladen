import * as THREE from 'three';
import type { ItemOverride } from '../data/layout';

/** A point that belongs to an item (seat, standing spot): it moves and turns with it. `yaw` 0 = facing +z. */
export interface ItemAnchor {
  x: number;
  z: number;
  yaw?: number;
}

interface AnchorBase {
  target: ItemAnchor;
  /** offset from the pivot in the model pose */
  lx: number;
  lz: number;
  yaw: number | undefined;
}

const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * One movable piece of the office (desk, shelf, plant, a rigid group, ...). The office model builds it at its model
 * pose; the room editor shifts it on the floor (`dx` / `dz`), turns it in quarter turns around its pivot or hides it.
 */
export class RoomItem {
  dx = 0;
  dz = 0;
  /** quarter turns, 0..3 */
  rot = 0;
  hidden = false;
  /** runs after every `apply` (dependent data such as a desk's seat) */
  onApply: (() => void) | null = null;
  private anchors: AnchorBase[];

  constructor(
    readonly id: string,
    readonly kind: string,
    readonly label: string,
    /** scene object, positioned at the pivot */
    readonly holder: THREE.Object3D,
    /** pivot (game coordinates) and yaw of the holder in the model pose */
    readonly base: { x: number; z: number; yaw: number },
    /** walking blockers relative to the pivot, in the model pose */
    private localBlockers: THREE.Box3[],
    /** bounding box relative to the pivot, in the model pose */
    private localBounds: THREE.Box3,
    anchors: ItemAnchor[],
    /** false for things the simulation needs (desks, seats, foosball, printer) */
    readonly removable: boolean,
  ) {
    this.anchors = anchors.map((target) => ({ target, lx: target.x - base.x, lz: target.z - base.z, yaw: target.yaw }));
    holder.userData.roomItem = this;
  }

  get x(): number {
    return this.base.x + this.dx;
  }

  get z(): number {
    return this.base.z + this.dz;
  }

  get changed(): boolean {
    return this.dx !== 0 || this.dz !== 0 || this.rot !== 0 || this.hidden;
  }

  /** Takes over an override (missing fields = model pose) and moves the scene object. */
  set(o: ItemOverride = {}): void {
    this.dx = round(Number(o.dx) || 0);
    this.dz = round(Number(o.dz) || 0);
    this.rot = (((Math.round(Number(o.rot) || 0) % 4) + 4) % 4) | 0;
    this.hidden = !!o.hidden && this.removable;
    this.apply();
  }

  /** The current state as an override, or null when the item stands where the model puts it. */
  get override(): ItemOverride | null {
    if (!this.changed) return null;
    const o: ItemOverride = {};
    if (this.dx) o.dx = round(this.dx);
    if (this.dz) o.dz = round(this.dz);
    if (this.rot) o.rot = this.rot;
    if (this.hidden) o.hidden = true;
    return o;
  }

  /** Moves the scene object and everything that hangs on it to the current dx / dz / rot. */
  apply(): void {
    const a = (this.rot * Math.PI) / 2;
    this.holder.position.x = this.x;
    this.holder.position.z = this.z;
    this.holder.rotation.y = this.base.yaw + a;
    this.holder.visible = !this.hidden;
    this.holder.updateMatrixWorld(true);
    for (const p of this.anchors) {
      const [x, z] = this.turn(p.lx, p.lz);
      p.target.x = this.x + x;
      p.target.z = this.z + z;
      if (p.yaw !== undefined) p.target.yaw = p.yaw + a;
    }
    this.onApply?.();
  }

  /** Footprints that block walking (game coordinates); none while hidden. */
  blockers(): THREE.Box3[] {
    return this.hidden ? [] : this.localBlockers.map((b) => this.place(b));
  }

  /** Bounding box in game coordinates. */
  bounds(): THREE.Box3 {
    return this.place(this.localBounds);
  }

  /** Offset from the pivot, turned by the item's quarter turns (same sense as `rotation.y`). */
  private turn(x: number, z: number): [number, number] {
    switch (this.rot) {
      case 1:
        return [z, -x];
      case 2:
        return [-x, -z];
      case 3:
        return [-z, x];
      default:
        return [x, z];
    }
  }

  private place(b: THREE.Box3): THREE.Box3 {
    const [x0, z0] = this.turn(b.min.x, b.min.z);
    const [x1, z1] = this.turn(b.max.x, b.max.z);
    return new THREE.Box3(
      new THREE.Vector3(this.x + Math.min(x0, x1), b.min.y, this.z + Math.min(z0, z1)),
      new THREE.Vector3(this.x + Math.max(x0, x1), b.max.y, this.z + Math.max(z0, z1)),
    );
  }
}
