import * as THREE from 'three';
import { ball, box, cyl, merge, propMaterial } from './geo';
import { OFFICE_D } from './officeModel';
import { WORLD } from './World';
import { TREES } from '../game/xmasTrees';

const BULB = 0.06;
const PALETTE = ['#ff3b3b', '#ffd23f', '#3fb6ff', '#5cff7a', '#ff7ad9', '#ffffff'].map((c) => new THREE.Color(c));

interface Strand {
  from: THREE.Vector3;
  to: THREE.Vector3;
  sag: number;
}

/** Christmas decorations: trees with presents, blinking light strands along the walls, wreaths. Built once, shown with `setVisible`. */
export class XmasDecor {
  readonly group = new THREE.Group();
  private bulbs: THREE.InstancedMesh;
  private count = 0;
  private lights: THREE.PointLight[] = [];
  private phase: number[] = [];
  private timer = 0;
  private step = 0;
  private level = 0;

  constructor(scene: THREE.Scene) {
    const strands = this.strands();
    const wireGeo: THREE.Vector3[] = [];
    const spots: THREE.Vector3[] = [];
    for (const s of strands) {
      const n = Math.max(8, Math.round(s.from.distanceTo(s.to) * 6));
      let prev: THREE.Vector3 | null = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const p = new THREE.Vector3().lerpVectors(s.from, s.to, t);
        p.y -= Math.sin(t * Math.PI) * s.sag;
        if (prev) wireGeo.push(prev, p);
        prev = p;
        if (i % 3 === 1) spots.push(p.clone());
      }
    }
    const wire = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wireGeo), new THREE.LineBasicMaterial({ color: '#143a1c' }));
    this.group.add(wire);

    // tree lights share the same bulb mesh
    const trees = TREES.map((t) => this.tree(t.x, t.z, t.s));
    for (const t of trees) spots.push(...t.bulbs);
    this.bulbs = new THREE.InstancedMesh(new THREE.BoxGeometry(BULB, BULB * 1.3, BULB), new THREE.MeshBasicMaterial(), spots.length);
    this.bulbs.frustumCulled = false;
    spots.forEach((p, i) => {
      this.bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
      this.phase.push(i);
    });
    this.count = spots.length;
    this.group.add(this.bulbs);
    this.paint();

    this.wreath(4.55, 2.05, OFFICE_D - 0.32);
    this.garlands();

    // warm glow around the trees (always in the scene so the shaders never recompile; intensity follows the mode)
    for (const t of TREES) {
      const l = new THREE.PointLight('#ffb35a', 0, 7, 2);
      l.position.set(t.x, 1.6 * t.s, t.z);
      scene.add(l);
      this.lights.push(l);
    }
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Light strands (game coordinates): along the window walls and the core wall. */
  private strands(): Strand[] {
    const W = WORLD.width;
    const D = OFFICE_D;
    const out: Strand[] = [];
    const run = (a: [number, number, number], b: [number, number, number], pieces: number, sag: number) => {
      for (let i = 0; i < pieces; i++) {
        const t0 = i / pieces;
        const t1 = (i + 1) / pieces;
        const at = (t: number) => new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
        out.push({ from: at(t0), to: at(t1), sag });
      }
    };
    run([0.8, 2.65, D - 0.45], [W - 0.5, 2.65, D - 0.45], 16, 0.28); // south window wall
    run([W - 0.45, 2.65, D - 0.8], [W - 0.45, 2.65, 0.8], 6, 0.28); // east window wall
    run([8.0, 3.0, 4.75], [W - 1.2, 3.0, 4.75], 12, 0.3); // hallway side of the core wall (text wall)
    return out;
  }

  /** Green garland with red bows along the south wall top. */
  private garlands(): void {
    const D = OFFICE_D;
    const parts: THREE.BufferGeometry[] = [];
    for (let x = 1.5; x < WORLD.width - 1; x += 2.7) {
      for (let i = 0; i < 4; i++) parts.push(ball(0.11, x + (i - 1.5) * 0.35, 2.9 - Math.sin(((i + 0.5) / 4) * Math.PI) * -0.0, D - 0.4, '#2c7a3a', 0.8));
      parts.push(box(0.18, 0.12, 0.05, x, 2.86, D - 0.34, '#c8202b'));
      parts.push(ball(0.05, x, 2.86, D - 0.31, '#f2c230'));
    }
    const m = new THREE.Mesh(merge(parts), propMaterial);
    this.group.add(m);
  }

  private wreath(x: number, y: number, z: number): void {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 6, 16), new THREE.MeshLambertMaterial({ color: '#2a7a3a' }));
    ring.position.set(x, y, z);
    const bow = new THREE.Mesh(merge([box(0.12, 0.1, 0.05, -0.08, 0, 0, '#c8202b', 0, 0.5), box(0.12, 0.1, 0.05, 0.08, 0, 0, '#c8202b', 0, -0.5), box(0.06, 0.06, 0.06, 0, 0, 0.01, '#8d1119')]), propMaterial);
    bow.position.set(x, y - 0.3, z - 0.04);
    const berries = new THREE.Mesh(merge([ball(0.045, -0.2, 0.2, 0.0, '#c8202b'), ball(0.045, 0.22, 0.17, 0, '#c8202b'), ball(0.045, 0.02, 0.3, 0, '#c8202b'), ball(0.045, 0.25, -0.12, 0, '#c8202b')]), propMaterial);
    berries.position.set(x, y, z - 0.05);
    this.group.add(ring, bow, berries);
  }

  /** A tree with ornaments, a star, presents. Returns the positions of its light bulbs. */
  private tree(x: number, z: number, s: number): { bulbs: THREE.Vector3[] } {
    const parts: THREE.BufferGeometry[] = [];
    parts.push(cyl(0.1, 0.13, 0.35, 0, 0.17, 0, '#5a3a22'));
    const tiers: Array<[number, number, number]> = [[0.95, 0.35, 0.8], [0.75, 0.9, 0.75], [0.55, 1.4, 0.7], [0.36, 1.85, 0.6]]; // radius, centre y, height
    tiers.forEach(([r, y, h], i) => parts.push(cyl(0.02, r, h, 0, y, 0, i % 2 ? '#2f8a43' : '#277a3a', 9)));
    // snow on the tips
    parts.push(cyl(0.01, 0.22, 0.2, 0, 2.3, 0, '#f4f8ff', 9));
    const bulbs: THREE.Vector3[] = [];
    // ornaments + light spirals
    const ornaments = ['#d9232d', '#f2c230', '#3b7ddd', '#d9232d', '#c9ced6'];
    tiers.forEach(([r, y, h], ti) => {
      for (let k = 0; k < 6; k++) {
        const a = k * 1.1 + ti * 0.7;
        const t = 0.25 + ((k * 0.37 + ti * 0.2) % 0.6);
        const rr = r * (1 - t) + 0.04;
        parts.push(ball(0.065, Math.cos(a) * rr, y + h / 2 - t * h, Math.sin(a) * rr, ornaments[(k + ti) % ornaments.length]));
      }
      for (let k = 0; k < 9; k++) {
        const a = k * 0.7 + ti * 1.3;
        const t = 0.15 + ((k * 0.13 + ti * 0.11) % 0.75);
        const rr = r * (1 - t) + 0.06;
        bulbs.push(new THREE.Vector3(x + Math.cos(a) * rr * s, (y + h / 2 - t * h) * s, z + Math.sin(a) * rr * s));
      }
    });
    const tree = new THREE.Mesh(merge(parts), propMaterial);
    tree.castShadow = true;
    tree.position.set(x, 0, z);
    tree.scale.setScalar(s);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), new THREE.MeshBasicMaterial({ color: '#ffd84a' }));
    star.scale.set(1, 1, 0.5);
    star.position.set(x, 2.55 * s, z);
    this.group.add(tree, star);

    // presents around the foot
    const gifts: THREE.BufferGeometry[] = [];
    const wrap: Array<[string, string]> = [['#c8202b', '#f2c230'], ['#2c5fa8', '#f7f4ee'], ['#2f8a43', '#c8202b'], ['#f2c230', '#c8202b']];
    [[-0.9, 0.55, 0.35], [0.95, 0.4, 0.28], [0.6, -0.9, 0.3], [-0.55, -0.85, 0.4], [1.1, -0.35, 0.22]].forEach(([gx, gz, gs], i) => {
      const [c, ribbon] = wrap[i % wrap.length];
      const h = gs * (0.8 + (i % 3) * 0.15);
      gifts.push(box(gs, h, gs, gx, h / 2, gz, c));
      gifts.push(box(gs + 0.01, h + 0.01, gs * 0.18, gx, h / 2, gz, ribbon));
      gifts.push(box(gs * 0.18, h + 0.012, gs + 0.01, gx, h / 2, gz, ribbon));
      gifts.push(box(gs * 0.3, 0.06, gs * 0.3, gx, h + 0.03, gz, ribbon));
    });
    const giftMesh = new THREE.Mesh(merge(gifts), propMaterial);
    giftMesh.position.set(x, 0, z);
    giftMesh.scale.setScalar(s);
    giftMesh.castShadow = true;
    this.group.add(giftMesh);
    return { bulbs };
  }

  private paint(): void {
    for (let i = 0; i < this.count; i++) {
      const c = PALETTE[(i + this.step * (i % 2 ? 1 : 2)) % PALETTE.length];
      const lit = (i + this.step) % 5 === 0 ? 0.35 : 1;
      this.bulbs.setColorAt(i, new THREE.Color().copy(c).multiplyScalar(lit));
    }
    this.bulbs.instanceColor!.needsUpdate = true;
  }

  setVisible(on: boolean): void {
    this.group.visible = on;
  }

  update(dt: number, on: boolean): void {
    this.level += ((on ? 1 : 0) - this.level) * Math.min(1, dt * 3);
    for (const l of this.lights) l.intensity = this.level * (5 + Math.sin(performance.now() / 400) * 0.6);
    if (!on) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0.45;
      this.step++;
      this.paint();
    }
  }
}
