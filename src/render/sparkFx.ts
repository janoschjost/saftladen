import * as THREE from 'three';
import { fxRandom } from '../game/rng';

const GRAVITY = 9.8;
const MAX = 140;
const FLOOR = 0.02;
const GEO = new THREE.BoxGeometry(1, 1, 1);
const MATS = [new THREE.MeshBasicMaterial({ color: 0xffd45a }), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }), new THREE.MeshBasicMaterial({ color: 0xff8a2a })];

interface Spark {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  t: number;
  size: number;
}

/** Sparks that shoot out of the broken server rack: short glowing bits that fly, fall, hit the floor and die. */
export class SparkFx {
  private bits: Spark[] = [];
  private readonly at = new THREE.Vector3();

  constructor(private scene: THREE.Scene) {}

  get count(): number {
    return this.bits.length;
  }

  /** `n` sparks from `from`, thrown out along `dir` (a horizontal unit vector, x/z) in a wide cone. */
  burst(from: THREE.Vector3, dir: { x: number; z: number }, n: number): void {
    for (let i = 0; i < n && this.bits.length < MAX; i++) {
      const mesh = new THREE.Mesh(GEO, MATS[i % MATS.length]);
      mesh.userData.nonav = true;
      this.at.set(from.x + (fxRandom() - 0.5) * 0.4, from.y + (fxRandom() - 0.5) * 0.6, from.z + (fxRandom() - 0.5) * 0.1);
      mesh.position.copy(this.at);
      const out = 0.6 + fxRandom() * 1.8;
      const side = (fxRandom() - 0.5) * 2.4;
      const vel = new THREE.Vector3(dir.x * out - dir.z * side, 0.3 + fxRandom() * 2.6, dir.z * out + dir.x * side);
      const size = 0.012 + fxRandom() * 0.02;
      // the size is set now, not at the next `update`: a burst after this frame's update would show 1 m cubes for a frame
      mesh.scale.set(size, size, size * 3);
      mesh.lookAt(this.at.x + vel.x, this.at.y + vel.y, this.at.z + vel.z);
      this.scene.add(mesh);
      this.bits.push({ mesh, vel, life: 0.35 + fxRandom() * 0.5, t: 0, size });
    }
  }

  update(dt: number): void {
    for (const b of this.bits) {
      b.t += dt;
      b.vel.y -= GRAVITY * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.mesh.position.y <= FLOOR) {
        b.mesh.position.y = FLOOR;
        b.vel.set(0, 0, 0);
        b.t = Math.max(b.t, b.life * 0.7); // lies there a moment, going out
      }
      if (b.vel.lengthSq() > 0.01) b.mesh.lookAt(b.mesh.position.x + b.vel.x, b.mesh.position.y + b.vel.y, b.mesh.position.z + b.vel.z);
      b.mesh.scale.setScalar(b.size * Math.max(0.05, 1 - b.t / b.life));
      b.mesh.scale.z *= 3;
    }
    this.bits = this.bits.filter((b) => {
      if (b.t < b.life) return true;
      this.scene.remove(b.mesh);
      return false;
    });
  }
}
