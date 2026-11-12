import * as THREE from 'three';
import type { DogRig } from './dogBuilder';
import { box, merge, propMaterial } from './geo';
import { buildPetWear } from './xmasWear';

export type CatKind = 'tabby' | 'tortie';

/** Two real cats: a brown tabby with white bib + white paws, and a dark tortoiseshell with faint brown patches. */
const CATS = {
  tabby: { fur: '#7b6a53', stripe: '#3f3428', chest: '#f4f1ec', paw: '#f4f1ec', tailTip: '#17171a', eye: '#b9c46a', nose: '#c98a86', stripes: true },
  tortie: { fur: '#1a181b', stripe: '#4b3527', chest: '#1a181b', paw: '#1a181b', tailTip: '#1a181b', eye: '#d3e06e', nose: '#3a2a2c', stripes: false },
} as const;

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

/** Little cat. Same rig shape as a dog (4 legs + tail), so Dog/Game animate it as is. */
export function buildCat(kind: CatKind = 'tabby'): DogRig {
  const c = CATS[kind];
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const parts: THREE.BufferGeometry[] = [];
  parts.push(box(0.17, 0.17, 0.4, 0, 0.27, 0, c.fur)); // torso
  parts.push(box(0.14, 0.11, 0.13, 0, 0.26, 0.17, c.chest)); // chest / bib
  parts.push(box(0.17, 0.15, 0.15, 0, 0.4, 0.26, c.fur)); // head
  parts.push(box(0.07, 0.045, 0.04, 0, 0.37, 0.345, c.chest)); // muzzle
  parts.push(box(0.025, 0.02, 0.02, 0, 0.385, 0.372, c.nose)); // nose
  parts.push(box(0.04, 0.035, 0.02, -0.04, 0.42, 0.338, c.eye)); // eyes
  parts.push(box(0.04, 0.035, 0.02, 0.04, 0.42, 0.338, c.eye));
  parts.push(box(0.05, 0.075, 0.04, -0.055, 0.52, 0.24, c.fur)); // pointy ears
  parts.push(box(0.05, 0.075, 0.04, 0.055, 0.52, 0.24, c.fur));
  if (c.stripes) {
    for (const z of [-0.12, -0.04, 0.04, 0.12]) parts.push(box(0.175, 0.012, 0.025, 0, 0.358, z, c.stripe)); // back stripes
    parts.push(box(0.03, 0.05, 0.012, 0, 0.47, 0.337, c.stripe)); // forehead M
    parts.push(box(0.03, 0.03, 0.012, -0.065, 0.39, 0.337, c.stripe)); // cheek lines
    parts.push(box(0.03, 0.03, 0.012, 0.065, 0.39, 0.337, c.stripe));
  } else {
    parts.push(box(0.1, 0.1, 0.012, -0.03, 0.39, 0.337, c.stripe)); // brown patch on the cheek
    parts.push(box(0.012, 0.12, 0.2, 0.087, 0.28, -0.05, c.stripe)); // faint flank patches
    parts.push(box(0.012, 0.1, 0.16, -0.087, 0.27, 0.04, c.stripe));
  }
  body.add(mesh(parts));
  body.add(buildPetWear(0.38, 0.47, 0.25));

  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.05, 0.15], [0.05, 0.15], [-0.05, -0.15], [0.05, -0.15]] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.2, z);
    const leg = [box(0.055, 0.2, 0.055, 0, -0.1, 0, c.fur), box(0.06, 0.035, 0.08, 0, -0.19, 0.01, c.paw)];
    if (c.stripes) leg.push(box(0.058, 0.015, 0.058, 0, -0.07, 0, c.stripe));
    pivot.add(mesh(leg));
    root.add(pivot);
    legs.push(pivot);
  }

  // tail sticks up and curls a bit; the wag (rotation.y) is driven by Game.pose
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, -0.2);
  const t = [box(0.045, 0.3, 0.045, 0, 0.14, -0.04, c.fur, -0.25), box(0.047, 0.08, 0.047, 0, 0.3, -0.1, c.tailTip, -0.9)];
  if (c.stripes) for (const y of [0.05, 0.13, 0.21]) t.push(box(0.049, 0.03, 0.049, 0, y, -0.015 - y * 0.25, c.stripe, -0.25));
  tail.add(mesh(t));
  body.add(tail);

  return { root, body, legs, tail, headHeight: 0.62, face: { y: 0.43, z: 0.28, r: 0.15 } };
}
