import * as THREE from 'three';
import { WORLD } from './World';
import { fxRandom } from '../game/rng';

const FLAKES = 2600;
const TOP = 14;
const ROOF_Y = 3.3; // flakes that fall over the building stop at roof height (like the rain)
const MARGIN = 8;
const FALL = 1.15; // m/s

function flakeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Soft snowflakes drifting down over the whole scene. */
export class SnowFx {
  readonly object: THREE.Points;
  private pos = new Float32Array(FLAKES * 3);
  private phase = new Float32Array(FLAKES);
  private speed = new Float32Array(FLAKES);
  private floor = new Float32Array(FLAKES);
  private time = 0;
  private material = new THREE.PointsMaterial({
    map: flakeTexture(),
    color: '#ffffff',
    size: 0.14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.object = new THREE.Points(geo, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
    this.object.renderOrder = 5;
    for (let i = 0; i < FLAKES; i++) this.respawn(i, true);
    scene.add(this.object);
  }

  private respawn(i: number, scatter: boolean): void {
    const x = -MARGIN + fxRandom() * (WORLD.width + MARGIN * 2);
    const z = -MARGIN + fxRandom() * (WORLD.depth + MARGIN * 2);
    const inside = x > 0 && x < WORLD.width && z > 0 && z < WORLD.depth;
    this.floor[i] = inside ? ROOF_Y : 0;
    this.phase[i] = fxRandom() * Math.PI * 2;
    this.speed[i] = 0.6 + fxRandom() * 0.8;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = scatter ? this.floor[i] + fxRandom() * (TOP - this.floor[i]) : TOP + fxRandom() * 2;
    this.pos[i * 3 + 2] = z;
  }

  /** `amount` 0..1. Hidden entirely when 0. */
  update(dt: number, amount: number, night: number): void {
    this.object.visible = amount > 0.01;
    if (!this.object.visible) return;
    this.time += dt;
    this.material.opacity = 0.9 * amount * (0.75 + 0.25 * night);
    const live = Math.ceil(FLAKES * Math.min(1, amount));
    this.object.geometry.setDrawRange(0, live);
    for (let i = 0; i < live; i++) {
      const o = i * 3;
      this.pos[o + 1] -= FALL * this.speed[i] * dt;
      this.pos[o] += Math.sin(this.time * 0.8 + this.phase[i]) * 0.35 * dt + 0.08 * dt;
      this.pos[o + 2] += Math.cos(this.time * 0.6 + this.phase[i] * 1.7) * 0.3 * dt;
      const x = this.pos[o];
      const z = this.pos[o + 2];
      const inside = x > 0 && x < WORLD.width && z > 0 && z < WORLD.depth;
      this.floor[i] = inside ? ROOF_Y : 0;
      if (this.pos[o + 1] < this.floor[i]) this.respawn(i, false);
    }
    this.object.geometry.attributes.position.needsUpdate = true;
  }
}
