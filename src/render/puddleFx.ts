import * as THREE from 'three';
import { PORCH } from './officeModel';

/** A puddle: where, how big when full, how soaked the ground must be before it shows up. */
interface Spot {
  x: number;
  z: number;
  rx: number;
  rz: number;
  from: number;
  rot: number;
}

/** The pattern of puddles of one 8 m stretch of paving (relative to the porch's west end): x, z, radii, how soaked it must be, rotation. */
const STRETCH: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
  [5.07, 2.8, 0.55, 0.38, 0, 0.3],
  [1.56, 2.9, 0.4, 0.28, 0.1, -0.5],
  [6.76, 1.6, 0.5, 0.34, 0.2, 0.8],
  [3.64, 1.3, 0.38, 0.3, 0.3, 0.1],
  [0.72, 1.2, 0.3, 0.22, 0.4, 1.2],
  [5.98, 2.2, 0.32, 0.46, 0.5, -0.2],
  [4.16, 3.1, 0.26, 0.2, 0.6, 0.9],
  [7.41, 0.7, 0.34, 0.24, 0.7, -0.7],
  [2.47, 2.1, 0.28, 0.2, 0.8, 0.4],
];
const STRETCH_W = 8;

/**
 * Fixed puddles on the porch's paving, along its whole width: the first stretch is the original pattern, every further
 * one repeats it with its z mirrored on every other stretch and turned a little, so the porch does not look tiled. The first ones to form are in the lowest
 * spots, the last ones only after a long shower.
 */
export const PUDDLE_SPOTS: Spot[] = Array.from({ length: Math.ceil(PORCH.w / STRETCH_W) }, (_, k) =>
  STRETCH.map(([x, z, rx, rz, from, rot]): Spot => ({
    x: PORCH.x + x + k * STRETCH_W,
    z: PORCH.z + (k % 2 ? PORCH.d - z : z),
    rx,
    rz,
    from: Math.min(0.95, from + k * 0.04),
    rot: rot + k,
  })),
)
  .flat()
  .filter((s) => s.x + s.rx < PORCH.x + PORCH.w - 0.1);

const LIFT = 0.015; // above the paving, clear of z-fighting
const RIPPLE = 1.1; // seconds one ripple takes

/** A soft, uneven blob: dark wet stone in the middle, a pale rim where the water is thin. */
export function blobTexture(): THREE.CanvasTexture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = size * 0.4 * (0.9 + 0.1 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2));
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.filter = 'blur(4px)';
  g.fillStyle = '#ffffff';
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function ringTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

export const smooth = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** Puddles on the porch: they form while it keeps raining (`weather.wet`), ripple under the drops and shrink away when the ground dries. */
export class PuddleFx {
  private readonly group = new THREE.Group();
  private readonly water = new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#5d7389', transparent: true, opacity: 0.62, depthWrite: false });
  private readonly shine = new THREE.MeshBasicMaterial({ map: blobTexture(), color: '#dbe8f5', transparent: true, opacity: 0.18, depthWrite: false });
  private readonly ringTex = ringTexture();
  private readonly puddles: { spot: Spot; body: THREE.Mesh; sheen: THREE.Mesh; ring: THREE.Mesh; ringMat: THREE.MeshBasicMaterial; phase: number }[] = [];

  constructor(scene: THREE.Scene) {
    const plane = new THREE.PlaneGeometry(2, 2);
    plane.rotateX(-Math.PI / 2);
    PUDDLE_SPOTS.forEach((spot, i) => {
      const body = new THREE.Mesh(plane, this.water);
      const sheen = new THREE.Mesh(plane, this.shine);
      const ringMat = new THREE.MeshBasicMaterial({ map: this.ringTex, color: '#e8f1fa', transparent: true, opacity: 0, depthWrite: false });
      const ring = new THREE.Mesh(plane, ringMat);
      for (const m of [body, sheen, ring]) {
        m.position.set(spot.x, LIFT, spot.z);
        m.rotation.y = spot.rot;
        m.renderOrder = 2;
        m.visible = false;
        this.group.add(m);
      }
      sheen.position.set(spot.x - spot.rx * 0.12, LIFT + 0.002, spot.z - spot.rz * 0.12); // a pale highlight on the sun side
      ring.position.y = LIFT + 0.004;
      this.puddles.push({ spot, body, sheen, ring, ringMat, phase: i * 0.37 });
    });
    scene.add(this.group);
  }

  /** `wet` 0..1 (weather.wet), `rain` 0..1 (weather.rain, ripples only while drops fall), `day` 0..1: dimmer at night. */
  update(dt: number, wet: number, rain: number, day: number): void {
    this.group.visible = wet > 0.01;
    if (!this.group.visible) return;
    const dim = 0.4 + 0.6 * day;
    this.water.color.setRGB(0.36 * dim, 0.45 * dim, 0.54 * dim);
    this.shine.opacity = 0.18 * dim;
    for (const p of this.puddles) {
      const size = smooth((wet - p.spot.from * 0.75) / 0.25);
      p.body.visible = p.sheen.visible = size > 0.01;
      p.body.scale.set(p.spot.rx * size, 1, p.spot.rz * size);
      p.sheen.scale.set(p.spot.rx * size * 0.7, 1, p.spot.rz * size * 0.6);
      p.phase += dt * (0.6 + 0.4 * rain);
      const k = (p.phase % RIPPLE) / RIPPLE;
      p.ring.visible = size > 0.5 && rain > 0.3;
      p.ring.scale.set(p.spot.rx * size * (0.25 + 0.7 * k), 1, p.spot.rz * size * (0.25 + 0.7 * k));
      p.ringMat.opacity = 0.5 * (1 - k) * rain;
    }
  }
}
