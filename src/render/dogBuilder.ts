import * as THREE from 'three';
import { box, merge, propMaterial } from './geo';

export interface DogRig {
  root: THREE.Group;
  body: THREE.Group;
  legs: THREE.Object3D[]; // FL, FR, BL, BR
  tail: THREE.Object3D;
  headHeight: number;
  /** head centre (z = forward) and radius to frame, in the root's unscaled units */
  face: { y: number; z: number; r: number };
}

interface DogLook {
  coat: string; light: string; dark: string; ear: string;
  floppy: boolean; patch: boolean; fluffy: boolean; size: number; shaggy?: boolean; head?: string;
}

const DOGS: Record<string, DogLook> = {
  shiba: { coat: '#d8a066', light: '#f4ead8', dark: '#2a2420', ear: '#d8a066', floppy: false, patch: false, fluffy: false, size: 1 },
  puppy: { coat: '#f6efe4', light: '#fbf7f0', dark: '#2a2420', ear: '#d98a3d', floppy: true, patch: true, fluffy: false, size: 0.75 },
  doodle: { coat: '#f0d9ae', light: '#f8ecd2', dark: '#2a2420', ear: '#f0d9ae', floppy: true, patch: false, fluffy: false, size: 0.8 },
  // small shaggy terrier mix: cream body, tan head and ears, pale muzzle, dark grey ear tips
  terrier: { coat: '#e9dcc0', light: '#f7f0e2', dark: '#2a2420', ear: '#d29c5f', head: '#d9a566', floppy: true, patch: false, fluffy: false, size: 0.58, shaggy: true },
};

export type DogKind = 'shiba' | 'puppy' | 'doodle' | 'terrier';

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

export function buildDog(kind: DogKind): DogRig {
  const d = DOGS[kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.3, 0.28, 0.6, 0, 0.44, 0, d.coat)); // torso
  parts.push(box(0.24, 0.12, 0.22, 0, 0.4, 0.25, d.light)); // chest
  parts.push(box(0.26, 0.24, 0.26, 0, 0.66, 0.36, d.head ?? d.coat)); // head
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
  if (d.fluffy) {
    parts.push(box(0.34, 0.32, 0.64, 0, 0.45, 0, d.coat)); // curly coat
    parts.push(box(0.32, 0.12, 0.3, 0, 0.82, 0.35, d.coat)); // top-knot
    parts.push(box(0.24, 0.14, 0.14, 0, 0.5, 0.5, d.light)); // chin fluff
    parts.push(box(0.07, 0.22, 0.14, -0.17, 0.58, 0.36, d.ear)); // big fluffy ears
    parts.push(box(0.07, 0.22, 0.14, 0.17, 0.58, 0.36, d.ear));
  }
  if (d.shaggy) {
    parts.push(box(0.34, 0.3, 0.62, 0, 0.45, 0, d.coat)); // long coat
    parts.push(box(0.3, 0.09, 0.28, 0, 0.775, 0.35, d.head!)); // tan fringe over the brow
    parts.push(box(0.2, 0.1, 0.1, 0, 0.5, 0.5, '#d8cbb0')); // short beard, flush with the muzzle
    parts.push(box(0.16, 0.2, 0.14, 0, 0.58, 0.25, '#8a8076')); // grey patch on the neck
    // long ears: tan on top, dark grey tips
    for (const x of [-0.17, 0.17]) {
      parts.push(box(0.06, 0.16, 0.15, x, 0.6, 0.36, d.ear));
      parts.push(box(0.065, 0.09, 0.16, x, 0.47, 0.36, '#4a443e'));
    }
  }
  body.add(mesh(parts));

  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.32, z);
    pivot.add(mesh([box(0.09, 0.3, 0.09, 0, -0.15, 0, d.coat), box(0.1, 0.04, 0.12, 0, -0.3, 0.01, d.light)]));
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
