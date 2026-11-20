import * as THREE from 'three';
import { fxRandom } from '../game/rng';
import { box, cyl, merge, propMaterial } from './geo';

/** Seconds a charred spot stays on the floor after the fire is out, fading as it goes. */
export const CHAR_LIFE = 20;

const SMOKE_GAP = 0.22; // seconds between two smoke puffs of a full fire
const SPARK_GAP = 0.16;
const FOAM_GAP = 0.04;
const PUFF_GEO = new THREE.SphereGeometry(1, 7, 5);
const SPARK_GEO = new THREE.BoxGeometry(1, 1, 1);
const SMOKE_MATS = [new THREE.MeshBasicMaterial({ color: '#8b8b90' }), new THREE.MeshBasicMaterial({ color: '#6f6f75' })];
const FOAM_MAT = new THREE.MeshBasicMaterial({ color: '#fbfbff' });
const SPARK_MATS = [new THREE.MeshBasicMaterial({ color: '#ffd45a' }), new THREE.MeshBasicMaterial({ color: '#ff8a2a' })];

type PuffKind = 'smoke' | 'spark' | 'foam';
interface Puff {
  mesh: THREE.Mesh;
  kind: PuffKind;
  age: number;
  life: number;
  size: number;
  vel: THREE.Vector3;
}

/** The ring of stones and the logs (a small camping fire: a spare teepee of four logs on a pad of ash). */
function buildHearth(): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [cyl(0.27, 0.3, 0.02, 0, 0.01, 0, '#2c2724', 10)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const g = box(0.13, 0.1, 0.17, 0, 0.05, 0, i % 2 ? '#8d8f94' : '#a3a5aa').rotateY(a + Math.PI / 2);
    g.translate(Math.sin(a) * 0.32, 0, Math.cos(a) * 0.32);
    parts.push(g);
  }
  // two logs lying crossed, two leaning on them
  parts.push(box(0.55, 0.07, 0.07, 0, 0.065, 0, '#5a3c24').rotateY(0.5));
  parts.push(box(0.55, 0.07, 0.07, 0, 0.13, 0, '#6b4a2e').rotateY(-0.9));
  for (const a of [0.3, 2.4]) {
    const g = box(0.06, 0.5, 0.06, 0, 0.25, 0.1, '#4f3320', -0.45);
    g.rotateY(a);
    parts.push(g);
  }
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.userData.nonav = true;
  return m;
}

/**
 * A small camping bonfire (#251): ring of stones with logs, flickering flame cones, rising sparks and smoke, a foam
 * cloud while it is put out, and a charred spot that fades afterwards. Visual only: `Bonfire` runs the scene and says
 * how big the flames are (`level`, 0..1) and whether it is being sprayed.
 */
export class Campfire {
  readonly group = new THREE.Group();
  /** flame size, 0 (none) .. 1 (full): the scene sets it */
  level = 0;
  /** the stones and logs are there */
  private readonly hearth = buildHearth();
  private readonly flames: Array<{ mesh: THREE.Mesh; h: number; phase: number }> = [];
  private readonly glow: THREE.Mesh;
  private readonly char: THREE.Mesh;
  private readonly charMat = new THREE.MeshBasicMaterial({ color: '#171412', transparent: true, opacity: 0 });
  private puffs: Puff[] = [];
  private charLeft = 0;
  private smokeIn = 0;
  private sparkIn = 0;
  private foamIn = 0;
  private time = 0;
  /** being sprayed: foam puffs come out */
  foaming = false;

  constructor(world: THREE.Object3D) {
    this.group.visible = false;
    this.group.add(this.hearth);
    const cones: Array<[number, number, string, number, number]> = [
      [0.16, 0.6, '#ffe27a', 0, 0],
      [0.15, 0.44, '#ffb02e', 0.1, 0.05],
      [0.15, 0.4, '#ff7a1a', -0.09, 0.07],
      [0.13, 0.36, '#ff5a1a', 0.02, -0.1],
    ];
    cones.forEach(([r, h, color, x, z], i) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), new THREE.MeshBasicMaterial({ color }));
      m.userData.nonav = true;
      m.position.set(x, 0.12, z);
      this.group.add(m);
      this.flames.push({ mesh: m, h, phase: i * 1.7 });
    });
    this.glow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 9), new THREE.MeshBasicMaterial({ color: '#ff4a1a' }));
    this.glow.position.y = 0.04;
    this.glow.userData.nonav = true;
    this.group.add(this.glow);
    this.char = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.01, 12), this.charMat);
    this.char.position.y = 0.006;
    this.char.userData.nonav = true;
    this.group.add(this.char);
    world.add(this.group);
  }

  /** Something is on the floor: the fire burns, is being put out, or the charred spot is still there. */
  get shown(): boolean {
    return this.group.visible;
  }

  /** The charred spot is still on the floor. */
  get charred(): boolean {
    return this.charLeft > 0;
  }

  /** Builds the hearth at a floor point; the flames start from nothing. */
  place(x: number, z: number): void {
    this.clear();
    this.group.position.set(x, 0, z);
    this.group.visible = true;
    this.hearth.visible = true;
    this.level = 0;
  }

  /** The fire is out: stones and logs are cleared away, the foam settles, the charred spot stays a while. */
  out(): void {
    this.level = 0;
    this.hearth.visible = false;
    this.charLeft = CHAR_LIFE;
    this.charMat.opacity = 0.85;
    this.char.visible = true;
    this.foaming = false;
    this.paintFlames();
  }

  /** Everything gone at once (the scene was ended, a new one starts). */
  clear(): void {
    this.level = 0;
    this.foaming = false;
    this.charLeft = 0;
    this.char.visible = false;
    this.hearth.visible = false;
    this.group.visible = false;
    for (const p of this.puffs) p.mesh.removeFromParent();
    this.puffs.length = 0;
    this.paintFlames();
  }

  update(dt: number): void {
    this.time += dt;
    if (!this.group.visible) return;
    this.paintFlames();
    if (this.level > 0.15 && this.hearth.visible) {
      if ((this.smokeIn -= dt) <= 0) {
        this.smokeIn = SMOKE_GAP / this.level;
        this.spawn('smoke', 0.07, 1.8 + fxRandom() * 0.8, 0.35 + fxRandom() * 0.25);
      }
      if ((this.sparkIn -= dt) <= 0) {
        this.sparkIn = SPARK_GAP / this.level;
        this.spawn('spark', 0.012 + fxRandom() * 0.012, 0.7 + fxRandom() * 0.7, 0.5 + fxRandom() * 0.5);
      }
    }
    if (this.foaming && (this.foamIn -= dt) <= 0) {
      this.foamIn = FOAM_GAP;
      this.spawn('foam', 0.12 + fxRandom() * 0.1, 1.1 + fxRandom() * 0.5, 0.5);
    }
    this.stepPuffs(dt);
    if (this.charLeft > 0) {
      this.charLeft -= dt;
      this.charMat.opacity = 0.85 * Math.max(0, Math.min(1, this.charLeft / (CHAR_LIFE * 0.4)));
      if (this.charLeft <= 0) {
        this.char.visible = false;
        if (!this.puffs.length) this.group.visible = false;
      }
    }
    if (!this.hearth.visible && !this.puffs.length && this.charLeft <= 0) this.group.visible = false;
  }

  private paintFlames(): void {
    const on = this.level > 0.02 && this.hearth.visible;
    this.glow.visible = on;
    for (const f of this.flames) {
      f.mesh.visible = on;
      if (!on) continue;
      const t = this.time * 9 + f.phase;
      const flick = 0.82 + 0.18 * Math.sin(t) + 0.08 * Math.sin(t * 2.3 + 1);
      const s = this.level * flick;
      f.mesh.scale.set(0.5 + 0.5 * s, s, 0.5 + 0.5 * s);
      f.mesh.position.y = 0.12 + (f.h * s) / 2;
      f.mesh.rotation.y = this.time * 2 + f.phase;
      f.mesh.rotation.z = Math.sin(t * 0.7) * 0.08;
    }
  }

  private spawn(kind: PuffKind, size: number, life: number, rise: number): void {
    const mesh = new THREE.Mesh(kind === 'spark' ? SPARK_GEO : PUFF_GEO, kind === 'smoke' ? SMOKE_MATS[Math.floor(fxRandom() * 2)] : kind === 'foam' ? FOAM_MAT : SPARK_MATS[Math.floor(fxRandom() * 2)]);
    mesh.userData.nonav = true;
    const a = fxRandom() * Math.PI * 2;
    const r = kind === 'foam' ? 0.05 + fxRandom() * 0.3 : fxRandom() * 0.1;
    mesh.position.set(Math.sin(a) * r, kind === 'foam' ? 0.1 + fxRandom() * 0.4 : kind === 'smoke' ? 0.45 * this.level + 0.15 : 0.3, Math.cos(a) * r);
    mesh.scale.setScalar(0.001);
    this.group.add(mesh);
    const drift = kind === 'foam' ? 0.35 : 0.12;
    this.puffs.push({ mesh, kind, age: 0, life, size, vel: new THREE.Vector3((fxRandom() - 0.5) * drift, kind === 'foam' ? 0.1 + fxRandom() * 0.15 : rise, (fxRandom() - 0.5) * drift) });
  }

  private stepPuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        p.mesh.removeFromParent();
        this.puffs.splice(i, 1);
        continue;
      }
      const k = p.age / p.life;
      p.mesh.position.addScaledVector(p.vel, dt);
      // smoke and foam swell then thin out, sparks only shrink
      const grow = p.kind === 'spark' ? 1 - k : Math.min(1, p.age / 0.25) * (1 - Math.max(0, (k - 0.6) / 0.4)) * (p.kind === 'smoke' ? 1 + k * 1.6 : 1 + k * 0.8);
      p.mesh.scale.setScalar(Math.max(0.001, p.size * grow));
    }
  }
}

/** A red fire extinguisher, upright, its base at the origin: body, silver head, black hose; the nozzle points to +z. */
export function buildExtinguisher(): THREE.Mesh {
  const parts = [
    cyl(0.06, 0.06, 0.34, 0, 0.17, 0, '#c8202b', 10),
    cyl(0.062, 0.062, 0.04, 0, 0.12, 0, '#1c1c22', 10),
    cyl(0.045, 0.06, 0.05, 0, 0.365, 0, '#c8ccd2', 10),
    box(0.03, 0.03, 0.12, 0, 0.41, 0.015, '#9aa0aa'),
    box(0.022, 0.02, 0.1, 0, 0.36, 0.085, '#1c1c22', 0.5),
    box(0.03, 0.03, 0.04, 0, 0.3, 0.12, '#1c1c22'),
  ];
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.userData.nonav = true;
  return m;
}
