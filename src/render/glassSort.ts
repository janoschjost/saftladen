import * as THREE from 'three';

/**
 * Glass does not write depth (so what stands behind it stays visible), which leaves the draw order of see-through
 * things to `renderOrder`: everything drawn after a pane is tinted by it. A bubble or lettering in front of a pane
 * has to be drawn after it (clean), one behind a pane before it (washed out by the pane).
 */
export const GLASS_ORDER = 2;
const BEHIND = GLASS_ORDER - 1;
export const IN_FRONT = GLASS_ORDER + 1;

const EVERY = 4; // frames between two passes: panes and bubbles move slowly
const RESCAN = 60; // passes between two scans of the scene for panes and marked objects
const NEAR = 0.01; // m: stops the ray just short of the target, so a pane 1 cm behind a lettering never counts

/** Marks a material as a glass pane that `GlassSort` looks for. */
export function markGlass<T extends THREE.Material>(material: T): T {
  material.userData.glass = true;
  return material;
}

/** Marks a fixed object (a lettering) whose `renderOrder` `GlassSort` sets from the side of the glass it is seen on. */
export function markGlassSorted(object: THREE.Object3D): void {
  object.userData.glassSort = true;
}

export class GlassSort {
  private panes: THREE.Mesh[] = [];
  private marked: THREE.Object3D[] = [];
  private tracked = new Set<THREE.Object3D>();
  private frame = 0;
  private pass = 0;
  private readonly ray = new THREE.Raycaster();
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor(private readonly scene: THREE.Object3D) {}

  /** Call once per rendered frame, after the bubbles are placed. */
  update(camera: THREE.Camera): void {
    if (this.frame++ % EVERY) return;
    if (this.pass++ % RESCAN === 0) this.scan();
    camera.updateMatrixWorld();
    const eye = camera.getWorldPosition(this.ray.ray.origin);
    for (const list of [this.marked, this.tracked]) {
      for (const o of list) {
        if (!o.visible) continue;
        o.getWorldPosition(this.at);
        o.renderOrder = this.behindGlass(eye, this.at) ? BEHIND : IN_FRONT;
      }
    }
  }

  /** Sorts an object that comes and goes (a bubble), which a scan of the scene would only find later. */
  track(object: THREE.Object3D): void {
    object.renderOrder = IN_FRONT;
    this.tracked.add(object);
  }

  /** Is there a glass pane between `eye` and `target`? */
  behindGlass(eye: THREE.Vector3, target: THREE.Vector3): boolean {
    const far = eye.distanceTo(target) - NEAR;
    if (far <= 0) return false;
    this.ray.ray.origin.copy(eye);
    this.ray.ray.direction.copy(this.dir.subVectors(target, eye).normalize());
    this.ray.near = 0;
    this.ray.far = far;
    for (const pane of this.panes) if (pane.visible && this.ray.intersectObject(pane, false).length) return true;
    return false;
  }

  private scan(): void {
    this.panes = [];
    this.marked = [];
    this.scene.traverse((o) => {
      if (o.userData.glassSort) this.marked.push(o);
      if (o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.userData.glass) this.panes.push(o);
    });
  }
}
