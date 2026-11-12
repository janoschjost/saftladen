import * as THREE from 'three';
import { random } from '../game/rng';

const POOL = 8;
const SPARKS = 22;
const LIFE = 1.25; // seconds
const IN_COLOR = new THREE.Color('#f4f4f2');
const OUT_COLOR = new THREE.Color('#e4e1da');

export type SpawnKind = 'in' | 'out';

interface Fx {
  group: THREE.Group;
  column: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  seed: Float32Array; // per spark: angle, radius, speed, phase
  t: number;
  kind: SpawnKind;
  height: number;
  active: boolean;
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

function beamTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 64, 0, 0); // bottom -> top
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.3)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(c);
}

const easeOut = (k: number) => 1 - (1 - k) * (1 - k);

/**
 * Materialize / dematerialize effect: a light column, an expanding (or collapsing) floor ring and a swarm of
 * sparks. Pooled, additive and unlit, so it reads at night too.
 */
export class SpawnFx {
  private pool: Fx[] = [];
  private next = 0;

  constructor(scene: THREE.Scene) {
    const dot = dotTexture();
    const beam = beamTexture();
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;
    for (let i = 0; i < POOL; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const colGeo = new THREE.CylinderGeometry(0.42, 0.5, 1, 20, 1, true);
      colGeo.translate(0, 0.5, 0);
      const column = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ ...common, map: beam, side: THREE.DoubleSide }));
      const ringGeo = new THREE.RingGeometry(0.86, 1, 40);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ ...common, side: THREE.DoubleSide }));
      ring.position.y = 0.03;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const points = new THREE.Points(geo, new THREE.PointsMaterial({ ...common, map: dot, size: 0.11, sizeAttenuation: true }));
      points.frustumCulled = false;
      for (const o of [column, ring, points]) o.renderOrder = 6;
      group.add(column, ring, points);
      scene.add(group);
      this.pool.push({ group, column, ring, points, seed: new Float32Array(SPARKS * 4), t: 1, kind: 'in', height: 1.6, active: false });
    }
  }

  burst(x: number, z: number, kind: SpawnKind, height: number): void {
    const fx = this.pool[this.next++ % POOL];
    fx.kind = kind;
    fx.height = Math.max(1, height);
    fx.t = 0;
    fx.active = true;
    fx.group.position.set(x, 0, z);
    fx.group.visible = true;
    const color = kind === 'in' ? IN_COLOR : OUT_COLOR;
    fx.column.material.color.copy(color);
    fx.ring.material.color.copy(color);
    fx.points.material.color.copy(color);
    for (let i = 0; i < SPARKS; i++) {
      fx.seed[i * 4] = random() * Math.PI * 2;
      fx.seed[i * 4 + 1] = 0.15 + random() * 0.5;
      fx.seed[i * 4 + 2] = 0.5 + random() * 1.3;
      fx.seed[i * 4 + 3] = random() * 0.35;
    }
  }

  update(dt: number): void {
    for (const fx of this.pool) {
      if (!fx.active) continue;
      fx.t += dt / LIFE;
      if (fx.t >= 1) {
        fx.active = false;
        fx.group.visible = false;
        continue;
      }
      const t = fx.t;
      const inn = fx.kind === 'in';
      // column: arrives as a flash that drains away / builds up quickly and collapses
      const colOpacity = inn ? Math.pow(1 - t, 1.6) : Math.sin(Math.min(1, t * 1.6) * Math.PI) * (1 - t * 0.5) * (t < 0.62 ? 1 : (1 - t) / 0.38);
      fx.column.material.opacity = Math.max(0, colOpacity) * 0.75;
      const rad = inn ? 1 + t * 0.25 : 1.25 - easeOut(t) * 0.75;
      fx.column.scale.set(rad, fx.height * (inn ? 0.5 + easeOut(Math.min(1, t * 3)) * 0.9 : 1.4 - t * 0.4), rad);
      // ring
      const r = inn ? 0.35 + easeOut(t) * 1.25 : 1.6 - easeOut(t) * 1.25;
      fx.ring.scale.set(r, 1, r);
      fx.ring.material.opacity = Math.pow(1 - t, 1.3) * 0.9;
      // sparks
      const pos = fx.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < SPARKS; i++) {
        const a = fx.seed[i * 4];
        const rr = fx.seed[i * 4 + 1];
        const sp = fx.seed[i * 4 + 2];
        const delay = fx.seed[i * 4 + 3];
        const k = Math.max(0, Math.min(1, (t - delay) / (1 - delay)));
        // in: sparks drift down and in towards the body; out: they rise and spread
        const h = inn ? fx.height * (1.05 - easeOut(k)) * (0.6 + sp * 0.4) : k * sp * fx.height * 1.1;
        const spread = inn ? rr * (1 - k * 0.6) : rr * (1 + k * 0.9);
        const swirl = a + k * (inn ? -2.5 : 2.5) * sp;
        pos.setXYZ(i, Math.cos(swirl) * spread, h, Math.sin(swirl) * spread);
      }
      pos.needsUpdate = true;
      fx.points.material.opacity = Math.sin(Math.min(1, t * 1.15) * Math.PI) * 1;
    }
  }
}
