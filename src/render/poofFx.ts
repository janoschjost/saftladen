import * as THREE from 'three';
import { fxRandom } from '../game/rng';

const COUNT = 18;
const LIFE = 0.9; // seconds
const COLORS = ['#ffffff', '#fff2c4', '#ffd36b', '#f3d9a8', '#e8821e'];

interface Bit {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  t: number;
  size: number;
  spin: number;
}

/** A puff of smoke and sparkles (Kurt's transformation, #32): small cubes burst out, swell, drift up and fade. */
export class PoofFx {
  private bits: Bit[] = [];

  constructor(private scene: THREE.Scene) {}

  burst(x: number, y: number, z: number): void {
    for (let i = 0; i < COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: COLORS[i % COLORS.length], transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      mesh.userData.nonav = true;
      const a = fxRandom() * Math.PI * 2;
      const up = fxRandom() * 1.4 - 0.3;
      mesh.position.set(x, y + (fxRandom() - 0.5) * 1.2, z);
      this.scene.add(mesh);
      const sparkle = i % 3 === 0;
      this.bits.push({ mesh, mat, vel: new THREE.Vector3(Math.cos(a) * 1.4, up, Math.sin(a) * 1.4), t: 0, size: sparkle ? 0.06 : 0.16 + fxRandom() * 0.12, spin: (fxRandom() - 0.5) * 8 });
    }
  }

  update(dt: number): void {
    for (const b of this.bits) {
      b.t += dt;
      const k = Math.min(1, b.t / LIFE);
      b.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.position.y += dt * 0.4;
      b.mesh.rotation.y += b.spin * dt;
      b.mesh.rotation.x += b.spin * dt * 0.5;
      b.mesh.scale.setScalar(b.size * (0.6 + k * 1.2));
      b.mat.opacity = 1 - k * k;
    }
    this.bits = this.bits.filter((b) => {
      if (b.t < LIFE) return true;
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mat.dispose();
      return false;
    });
  }
}
