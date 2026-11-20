import * as THREE from 'three';
import { christianLook } from '../data/christian';
import { buildCharacter, type CharacterRig } from '../render/characterBuilder';
import type { NavGrid } from './NavGrid';
import { WALK_PHASE_PER_M, walkPose } from './walkPose';

const IN_PLACE = 4; // seconds he walks on the spot before he sets off
const SPEED = 1.3; // m/s along the line
const MAX_LINE = 8; // m

/**
 * The longest straight stretch of open floor along x: where Christian walks. Cells are scanned row by row, the stretch is
 * cut to `MAX_LINE` and ends half a cell short of each end so he does not brush the furniture.
 */
export function longestRun(nav: NavGrid): { z: number; x0: number; x1: number } {
  let best = { z: nav.center(0, 0).z, x0: nav.center(0, 0).x, x1: nav.center(0, 0).x };
  for (let cz = 0; cz < nav.rows; cz++) {
    let start = -1;
    for (let cx = 0; cx <= nav.cols; cx++) {
      // a cell counts only with its neighbours in z open as well: he is wider than a line
      const open = cx < nav.cols && nav.walkable(cx, cz) && nav.walkable(cx, cz - 1) && nav.walkable(cx, cz + 1);
      if (open && start < 0) start = cx;
      if (!open && start >= 0) {
        const a = nav.center(start, cz).x;
        const b = nav.center(cx - 1, cz).x;
        if (b - a > best.x1 - best.x0) best = { z: nav.center(0, cz).z, x0: a, x1: b };
        start = -1;
      }
    }
  }
  const len = Math.min(MAX_LINE, best.x1 - best.x0);
  const mid = (best.x0 + best.x1) / 2;
  return { z: best.z, x0: mid - len / 2, x1: mid + len / 2 };
}

/**
 * Dev model check (#259): Christian Davatz, opaque, 2.1 m tall, standing in the office. First he walks on the spot, then
 * up and down a straight line, to check size and animations. He is a prop of the view: not a person of the simulation.
 */
export class ChristianModel {
  /** his rig, while he is there */
  rig: CharacterRig | null = null;
  private t = 0;
  private line = { z: 0, x0: 0, x1: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly nav: NavGrid,
  ) {}

  get active(): boolean {
    return this.rig !== null;
  }

  get root(): THREE.Object3D | null {
    return this.rig?.root ?? null;
  }

  /** He stands in the office and starts with the walk on the spot (again, when he is there already). */
  start(): void {
    this.stop();
    this.line = longestRun(this.nav);
    this.rig = buildCharacter(christianLook);
    this.scene.add(this.rig.root);
    this.t = 0;
    this.pose();
  }

  stop(): void {
    if (!this.rig) return;
    this.scene.remove(this.rig.root);
    this.rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose(); // the geometry is built per rig; materials may be shared
    });
    this.rig = null;
  }

  update(dt: number): void {
    if (!this.rig) return;
    this.t += dt;
    this.pose();
  }

  private pose(): void {
    const r = this.rig!;
    const { z, x0, x1 } = this.line;
    const len = x1 - x0;
    const walking = this.t >= IN_PLACE;
    let x = x0;
    let yaw = Math.PI / 2; // +x
    if (walking && len > 0) {
      // up and down the line, turning round at each end
      const d = (this.t - IN_PLACE) * SPEED;
      const lap = 2 * len;
      const m = d % lap;
      x = m < len ? x0 + m : x1 - (m - len);
      yaw = m < len ? Math.PI / 2 : -Math.PI / 2;
    }
    r.root.position.set(x, 0, z);
    r.root.rotation.y = yaw;
    walkPose(r, this.t * SPEED * WALK_PHASE_PER_M);
  }
}
