import * as THREE from 'three';
import { ball, box, merge, propMaterial } from './geo';

export interface DogRig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[]; // FL, FR, BL, BR
  tail: THREE.Object3D;
  headHeight: number;
  /** head centre (z = forward) and radius to frame, in the root's unscaled units */
  face: { y: number; z: number; r: number };
}

const DOGS = {
  shiba: { coat: '#d8a066', light: '#f4ead8', dark: '#2a2420', ear: '#d8a066', floppy: false, patch: false, fluffy: false, size: 1 },
  puppy: { coat: '#f6efe4', light: '#fbf7f0', dark: '#2a2420', ear: '#d98a3d', floppy: true, patch: true, fluffy: false, size: 0.75 },
  doodle: { coat: '#e8c88c', light: '#f3dfb6', dark: '#2a2420', ear: '#dcb67a', floppy: true, patch: false, fluffy: true, size: 0.8 },
} as const;

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

export function buildDog(kind: keyof typeof DOGS): DogRig {
  const d = DOGS[kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const parts: THREE.BufferGeometry[] = [];
  if (d.fluffy) {
    // goldendoodle puppy: a cloud of small curls (apricot, lighter muzzle/chest, darker curly ears), red collar
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const palette = ['#e2b878', '#ecc88c', '#d9ab68', '#e8c283'];
    /** scatter curls over an ellipsoid; `keep` can veto spots (e.g. the face) */
    const curls = (cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, n: number, r: number, cols: readonly string[], keep: (x: number, y: number, z: number) => boolean = () => true) => {
      for (let i = 0; i < n; i++) {
        const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, q = Math.sqrt(1 - u * u), k = 0.92 + rnd() * 0.16;
        const x = cx + Math.cos(th) * q * rx * k, y = cy + u * ry * k, z = cz + Math.sin(th) * q * rz * k;
        if (keep(x, y, z)) parts.push(ball(r * (0.8 + rnd() * 0.4), x, y, z, cols[Math.floor(rnd() * cols.length)]));
      }
    };
    // bare cores under the curls
    for (const [z, r] of [[-0.2, 0.18], [-0.03, 0.2], [0.13, 0.19]] as const) parts.push(ball(r, 0, 0.47, z, d.coat));
    parts.push(ball(0.16, 0, 0.47, 0.24, d.light)); // chest
    parts.push(ball(0.17, 0, 0.7, 0.36, d.coat)); // head core
    parts.push(box(0.23, 0.04, 0.23, 0, 0.57, 0.3, '#c0392b')); // collar
    curls(0, 0.47, 0.02, 0.22, 0.22, 0.4, 46, 0.075, palette); // body
    curls(0, 0.45, 0.25, 0.15, 0.15, 0.1, 10, 0.06, ['#f3dfb6', '#ecd3a0']); // chest
    curls(0, 0.5, -0.38, 0.12, 0.12, 0.08, 8, 0.07, palette); // rump
    curls(0, 0.72, 0.34, 0.21, 0.2, 0.2, 34, 0.07, palette, (x, y, z) => !(z > 0.44 && Math.abs(x) < 0.14 && y < 0.8)); // fluffy mop, face left open
    curls(0, 0.86, 0.32, 0.14, 0.07, 0.14, 10, 0.07, palette); // top-knot
    curls(0, 0.58, 0.47, 0.12, 0.08, 0.08, 10, 0.05, ['#f3dfb6', '#ecd3a0'], (x, y) => !(Math.abs(x) < 0.06 && y > 0.6)); // beard
    for (const sd of [-1, 1]) {
      curls(sd * 0.2, 0.6, 0.35, 0.06, 0.15, 0.1, 14, 0.065, ['#d29a58', '#c98d4c', '#dba768']); // curly ears
      parts.push(ball(0.02, sd * 0.065, 0.73, 0.5, d.dark)); // eyes
      parts.push(ball(0.045, sd * 0.07, 0.755, 0.49, '#c99a58', 0.6)); // brows
    }
    parts.push(ball(0.085, 0, 0.635, 0.5, d.light)); // muzzle
    parts.push(ball(0.032, 0, 0.665, 0.586, d.dark)); // nose
  } else {
    parts.push(box(0.3, 0.28, 0.6, 0, 0.44, 0, d.coat)); // torso
    parts.push(box(0.24, 0.12, 0.22, 0, 0.4, 0.25, d.light)); // chest
    parts.push(box(0.26, 0.24, 0.26, 0, 0.66, 0.36, d.coat)); // head
    parts.push(box(0.14, 0.11, 0.14, 0, 0.6, 0.52, d.light)); // snout
    parts.push(box(0.05, 0.05, 0.03, 0, 0.64, 0.6, d.dark)); // nose
    const eyeZ = d.patch ? 0.52 : 0.495; // in front of the eye patch so both eyes stay visible
    parts.push(box(0.04, 0.05, 0.02, -0.07, 0.7, eyeZ, d.dark)); // eyes
    parts.push(box(0.04, 0.05, 0.02, 0.07, 0.7, eyeZ, d.dark));
    if (d.floppy) {
      parts.push(box(0.05, 0.16, 0.1, -0.15, 0.62, 0.36, d.ear));
      parts.push(box(0.05, 0.16, 0.1, 0.15, 0.62, 0.36, d.ear));
      if (d.patch) parts.push(box(0.14, 0.14, 0.02, -0.04, 0.72, 0.505, d.ear)); // eye patch
    } else {
      parts.push(box(0.07, 0.12, 0.05, -0.08, 0.84, 0.32, d.ear));
      parts.push(box(0.07, 0.12, 0.05, 0.08, 0.84, 0.32, d.ear));
    }
  }
  body.add(mesh(parts));

  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.32, z);
    pivot.add(mesh(d.fluffy ? [box(0.11, 0.3, 0.11, 0, -0.15, 0, d.coat), ball(0.075, 0, -0.06, 0, d.coat), ball(0.07, 0.02, -0.14, 0.03, '#ecc88c'), ball(0.07, 0, -0.29, 0.015, d.light, 0.6)] : [box(0.09, 0.3, 0.09, 0, -0.15, 0, d.coat), box(0.1, 0.04, 0.12, 0, -0.3, 0.01, d.light)]));
    root.add(pivot);
    legs.push(pivot);
  }

  const tail = new THREE.Group();
  tail.position.set(0, 0.54, -0.3);
  tail.add(mesh([box(0.07, 0.07, 0.24, 0, 0.1, -0.08, d.light, -0.7)]));
  body.add(tail);

  root.scale.setScalar(d.size);
  return { root, body, legs, tail, headHeight: 1.0 * d.size, face: { y: 0.68, z: 0.42, r: 0.3 } };
}
