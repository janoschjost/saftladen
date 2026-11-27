import * as THREE from 'three';

/**
 * Tells whether the scene hides a point from the camera: the walls, the furniture built in, glass panes and the roof (when it is on).
 * The see-through ghost of the walls above the cut and people do not count. Used to fade a bubble whose speaker nobody can see.
 */
export class BubbleOcclusion {
  private readonly ray = new THREE.Raycaster();
  private readonly dir = new THREE.Vector3();

  /** `solids` are the objects to test (merged static scenery), looked at only while they are visible. */
  constructor(private readonly solids: readonly THREE.Object3D[]) {}

  /** Is there something solid between `eye` and `target`? */
  blocked(eye: THREE.Vector3, target: THREE.Vector3): boolean {
    const far = eye.distanceTo(target) - 0.05; // stops just short of the target, so what it stands on never counts
    if (far <= 0) return false;
    this.ray.ray.origin.copy(eye);
    this.ray.ray.direction.copy(this.dir.subVectors(target, eye).normalize());
    this.ray.near = 0;
    this.ray.far = far;
    for (const root of this.solids) {
      if (!root.visible) continue;
      for (const hit of this.ray.intersectObject(root, true)) {
        const o = hit.object;
        if (!(o instanceof THREE.Mesh)) continue; // cords, lines and points have no body to hide behind
        if (!Array.isArray(o.material) && (!o.material.transparent || o.material.userData.glass)) return true;
      }
    }
    return false;
  }
}
