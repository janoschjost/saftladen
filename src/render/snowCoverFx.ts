import * as THREE from 'three';
import { PORCH } from './officeModel';
import { blobTexture, smooth } from './puddleFx';

const LIFT = 0.02; // above the paving (and the puddles), clear of z-fighting
const STEP = 0.8; // metres between two patches
const MAX = 1.0; // radius (m) of a full patch, they overlap when the porch is white

interface Patch {
  x: number;
  z: number;
  r: number;
  /** how white the porch must be before this patch shows up (0..0.7) */
  from: number;
  rot: number;
}

/** A fixed scatter of patches over the porch (no random: the same porch every time). */
const PATCHES: Patch[] = [];
for (let ix = 0; ix * STEP <= PORCH.w; ix++) {
  for (let iz = 0; iz * STEP <= PORCH.d; iz++) {
    const h = Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453;
    const k = h - Math.floor(h);
    PATCHES.push({
      x: PORCH.x + Math.min(PORCH.w - 0.3, Math.max(0.3, ix * STEP + (k - 0.5) * 0.4)),
      z: PORCH.z + Math.min(PORCH.d - 0.3, Math.max(0.3, iz * STEP + (((k * 7) % 1) - 0.5) * 0.4)),
      r: MAX * (0.75 + 0.25 * ((k * 13) % 1)),
      from: 0.7 * ((k * 31) % 1),
      rot: k * Math.PI * 2,
    });
  }
}

/** Snow on the porch's paving: patches grow while it keeps snowing (`weather.cover`) and shrink away when it has melted. */
export class SnowCoverFx {
  private readonly group = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#f3f7fb', transparent: true, opacity: 0.95, depthWrite: false });
  private readonly meshes: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    const plane = new THREE.PlaneGeometry(2, 2);
    plane.rotateX(-Math.PI / 2);
    for (const p of PATCHES) {
      const m = new THREE.Mesh(plane, this.material);
      m.position.set(p.x, LIFT, p.z);
      m.rotation.y = p.rot;
      m.renderOrder = 3;
      m.visible = false;
      this.group.add(m);
      this.meshes.push(m);
    }
    scene.add(this.group);
  }

  /** `cover` 0..1 (weather.cover), `day` 0..1: dimmer at night. */
  update(cover: number, day: number): void {
    this.group.visible = cover > 0.01;
    if (!this.group.visible) return;
    const dim = 0.45 + 0.55 * day;
    this.material.color.setRGB(0.95 * dim, 0.97 * dim, 0.99 * dim);
    for (let i = 0; i < PATCHES.length; i++) {
      const p = PATCHES[i];
      const size = smooth((cover - p.from) / 0.3);
      const m = this.meshes[i];
      m.visible = size > 0.01;
      m.scale.set(p.r * size, 1, p.r * size);
    }
  }
}
