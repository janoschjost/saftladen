import * as THREE from 'three';

/** Most flies at once: 5 around each of the 3 lunchboxes the mess allows, with room to spare. */
export const MAX_FLIES = 24;
const GEO = new THREE.BoxGeometry(1, 1, 1);
const MAT = new THREE.MeshBasicMaterial({ color: 0x15130f });
const m = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scale = new THREE.Vector3(0.012, 0.008, 0.012);

/** A fixed number in 0..1 for fly `i` and a stream `k`: every fly flies its own loop, the same every time. */
const hash = (i: number, k: number): number => {
  const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Flies around old food (#263): one instanced mesh for all of them, a few specks per spot circling and jittering
 * above and around it. `set` says where flies are and how many; `update` moves them. Nothing is drawn, and nothing
 * moves, while no spot has flies.
 */
export class FliesFx {
  readonly mesh: THREE.InstancedMesh;
  private spots: Array<{ x: number; y: number; z: number; n: number }> = [];
  private t = 0;

  constructor(parent: THREE.Object3D) {
    this.mesh = new THREE.InstancedMesh(GEO, MAT, MAX_FLIES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.userData.nonav = true;
    parent.add(this.mesh);
  }

  /** How many flies are out now. */
  get count(): number {
    return this.mesh.count;
  }

  /** Flies at these places (`n` each, game coordinates, `y` the surface). Call whenever the spots change. */
  set(spots: ReadonlyArray<{ x: number; y: number; z: number; n: number }>): void {
    let total = 0;
    this.spots = spots.map((s) => {
      const n = Math.min(s.n, MAX_FLIES - total);
      total += n;
      return { ...s, n };
    });
    this.mesh.count = total;
    this.place();
  }

  /** Moves the flies on (`dt` seconds). Does nothing without flies. */
  update(dt: number): void {
    if (!this.mesh.count) return;
    this.t += dt;
    this.place();
  }

  private place(): void {
    let i = 0;
    for (const s of this.spots) {
      for (let k = 0; k < s.n; k++, i++) {
        const speed = 2.5 + hash(i, 1) * 3;
        const a = this.t * speed * (i % 2 ? 1 : -1) + hash(i, 2) * Math.PI * 2;
        const r = 0.08 + hash(i, 3) * 0.14 + Math.sin(this.t * 1.7 + i) * 0.03;
        const h = 0.1 + hash(i, 4) * 0.18 + Math.sin(this.t * 5 + i * 2) * 0.03;
        pos.set(s.x + Math.cos(a) * r, s.y + h, s.z + Math.sin(a * 1.3) * r);
        m.compose(pos, quat, scale);
        this.mesh.setMatrixAt(i, m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
