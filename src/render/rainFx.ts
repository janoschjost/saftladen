import * as THREE from 'three';
import { WORLD } from './World';
import { fxRandom } from '../game/rng';

const DROPS = 1400;
const TOP = 16;
const ROOF_Y = 3.3; // drops that fall over the building stop at roof height
const MARGIN = 7;
const FALL = 17; // m/s
const LENGTH = 0.55;
const SLANT = 0.12; // sideways drift per metre of fall

/** Rain streaks over the whole scene. Over the building they end at roof height (the roof is often hidden). */
export class RainFx {
  readonly object: THREE.LineSegments;
  private pos = new Float32Array(DROPS * 6);
  private x = new Float32Array(DROPS);
  private y = new Float32Array(DROPS);
  private z = new Float32Array(DROPS);
  private floor = new Float32Array(DROPS);
  private material = new THREE.LineBasicMaterial({ color: '#b9d0ee', transparent: true, opacity: 0, depthWrite: false });

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.LineSegments(geo, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.renderOrder = 5;
    for (let i = 0; i < DROPS; i++) this.respawn(i, true);
    scene.add(this.object);
  }

  private respawn(i: number, scatter: boolean): void {
    const x = -MARGIN + fxRandom() * (WORLD.width + MARGIN * 2);
    const z = -MARGIN + fxRandom() * (WORLD.depth + MARGIN * 2);
    const inside = x > 0 && x < WORLD.width && z > 0 && z < WORLD.depth;
    this.x[i] = x;
    this.z[i] = z;
    this.floor[i] = inside ? ROOF_Y : 0;
    this.y[i] = scatter ? this.floor[i] + fxRandom() * (TOP - this.floor[i]) : TOP + fxRandom() * 2;
  }

  /** `amount` 0..1 (weather.rain), `storm` 0..1 (weather.storm: heavier, faster, steeper). Hidden entirely while dry. */
  update(dt: number, amount: number, night: number, storm = 0): void {
    this.object.visible = amount > 0.01;
    if (!this.object.visible) return;
    this.material.opacity = (0.5 + 0.25 * storm) * amount * (0.55 + 0.45 * night);
    const live = Math.ceil(DROPS * Math.min(1, 0.25 + amount));
    this.object.geometry.setDrawRange(0, live * 2);
    const fall = FALL * (1 + 0.35 * storm);
    for (let i = 0; i < live; i++) {
      this.y[i] -= fall * dt;
      this.x[i] -= fall * dt * SLANT * (1 + storm);
      const inside = this.x[i] > 0 && this.x[i] < WORLD.width && this.z[i] > 0 && this.z[i] < WORLD.depth;
      this.floor[i] = inside ? ROOF_Y : 0;
      if (this.y[i] < this.floor[i]) this.respawn(i, false);
      const o = i * 6;
      this.pos[o] = this.x[i];
      this.pos[o + 1] = this.y[i];
      this.pos[o + 2] = this.z[i];
      this.pos[o + 3] = this.x[i] + LENGTH * SLANT;
      this.pos[o + 4] = this.y[i] + LENGTH;
      this.pos[o + 5] = this.z[i];
    }
    this.object.geometry.attributes.position.needsUpdate = true;
  }
}
