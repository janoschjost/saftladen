import * as THREE from 'three';
import type { Look } from '../data/types';
import { buildCharacter, type CharacterRig } from './characterBuilder';
import { box, merge, propMaterial } from './geo';
import { petPortrait, portraitFrames } from './petPortrait';

/**
 * Kompensiertier "Kurt", Marco's alter ego (#32): a low-poly anteater-ish critter with a spiky crest, ringed tail and
 * an olive backpack. It is a second skin on the same rig (same bones, same poses), so every animation keeps working.
 * Built in rig units like characterBuilder (the root scale turns 1.75 into the person's height); the head top sits at
 * 1.74, so on Marco (1.70 m) Kurt is about 1.69 m tall without the crest.
 */
const C = {
  orange: '#e8821e',
  orangeDark: '#c9661a',
  cream: '#f3d9a8',
  rust: '#8a3f22',
  brown: '#4a2a1c',
  olive: '#5f6b2a',
  oliveDark: '#4b5520',
  sage: '#9aa57a',
  bottle: '#a9adb2',
  bottleCap: '#6b6f75',
  nose: '#d98a5f',
  eye: '#1b1b22',
  white: '#ffffff',
  daisy: '#f6c21c',
};

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

/** Head, crest, torso, belly, spots and backpack: everything that moves with the body group. */
function bodyParts(shoulder: number): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [];
  const w = Math.max(0.5, (shoulder - 0.07) * 2); // torso reaches the shoulder pivots
  // pear-shaped torso: wide hips, narrower chest
  p.push(box(w + 0.06, 0.24, 0.4, 0, 0.86, 0, C.orange));
  p.push(box(w, 0.36, 0.36, 0, 1.08, 0, C.orange));
  p.push(box(w - 0.06, 0.18, 0.32, 0, 1.33, 0, C.orange));
  // cream belly, in two layers so it reads round from the side
  p.push(box(w - 0.18, 0.5, 0.03, 0, 1.03, 0.19, C.cream));
  p.push(box(w - 0.3, 0.36, 0.03, 0, 1.02, 0.215, C.cream));
  p.push(box(w - 0.12, 0.16, 0.03, 0, 0.84, 0.205, C.cream));
  // spots on the sides and the back
  const spots: Array<[number, number, number, number]> = [
    [0.5, 1.2, 0.08, 0.05], [0.5, 0.96, -0.06, 0.06], [0.5, 0.86, 0.1, 0.04],
    [-0.5, 1.15, 0.05, 0.06], [-0.5, 0.92, -0.08, 0.05], [-0.5, 1.28, -0.1, 0.04],
  ];
  for (const [sx, y, z, s] of spots) p.push(box(0.02, s, s * 1.3, (sx > 0 ? 1 : -1) * ((w + 0.06) / 2 - 0.005), y, z, C.orangeDark));
  // neck
  p.push(box(0.24, 0.08, 0.24, 0, 1.43, 0.01, C.orange));
  // head: orange box with a cream face plate and a long tapering snout ending in a dark nose
  p.push(box(0.38, 0.34, 0.36, 0, 1.57, 0, C.orange));
  p.push(box(0.32, 0.22, 0.04, 0, 1.54, 0.18, C.cream));
  p.push(box(0.22, 0.1, 0.03, 0, 1.68, 0.17, C.cream)); // forehead
  p.push(box(0.2, 0.15, 0.16, 0, 1.52, 0.27, C.cream));
  p.push(box(0.15, 0.12, 0.13, 0, 1.51, 0.39, C.cream));
  p.push(box(0.11, 0.09, 0.08, 0, 1.505, 0.48, C.nose));
  p.push(box(0.09, 0.08, 0.05, 0, 1.51, 0.535, C.brown)); // nose tip
  p.push(box(0.09, 0.012, 0.012, 0.08, 1.475, 0.3, C.rust)); // smile line along the snout
  p.push(box(0.012, 0.012, 0.05, 0.12, 1.485, 0.25, C.rust));
  // round eyes with a highlight
  for (const sx of [-1, 1]) {
    p.push(box(0.075, 0.085, 0.02, sx * 0.1, 1.61, 0.205, C.eye));
    p.push(box(0.025, 0.025, 0.01, sx * 0.1 + 0.018, 1.63, 0.217, C.white));
  }
  // small ears
  for (const sx of [-1, 1]) {
    p.push(box(0.09, 0.08, 0.05, sx * 0.18, 1.72, -0.03, C.orange));
    p.push(box(0.05, 0.05, 0.02, sx * 0.18, 1.715, 0.0, C.rust));
  }
  // rust patches on the head, cheeks a shade darker
  for (const sx of [-1, 1]) {
    p.push(box(0.012, 0.07, 0.1, sx * 0.192, 1.64, -0.06, C.rust));
    p.push(box(0.012, 0.05, 0.06, sx * 0.192, 1.52, -0.1, C.orangeDark));
    p.push(box(0.05, 0.05, 0.02, sx * 0.13, 1.5, 0.2, C.nose)); // cheeks
  }
  // brown stripe over the top of the head, into the crest
  p.push(box(0.14, 0.03, 0.3, 0, 1.75, -0.02, C.rust));
  // spiky crest: three rows of spikes fanning up and back
  const rows: Array<[number, number, number, number]> = [
    // z, y, tilt back, length
    [0.06, 1.8, -0.35, 0.22],
    [-0.06, 1.79, -0.75, 0.28],
    [-0.16, 1.74, -1.1, 0.26],
  ];
  rows.forEach(([z, y, tilt, len], r) => {
    for (let i = -2; i <= 2; i++) {
      const col = (i + r) % 3 === 0 ? C.rust : (i + r) % 2 ? C.orange : C.orangeDark;
      const l = len * (1 - Math.abs(i) * 0.12);
      const g = new THREE.BoxGeometry(0.06, l, 0.05);
      g.translate(0, l / 2, 0);
      g.rotateX(tilt);
      g.rotateZ(-i * 0.32);
      g.translate(i * 0.065, y, z);
      p.push(paintLike(g, col));
    }
  });
  // straps over the shoulders and a chest strap
  for (const sx of [-1, 1]) {
    p.push(box(0.05, 0.44, 0.02, sx * 0.15, 1.16, 0.2, C.brown));
    p.push(box(0.05, 0.02, 0.38, sx * 0.15, 1.39, 0.0, C.brown));
  }
  p.push(box(0.3, 0.035, 0.02, 0, 1.24, 0.215, C.brown));
  // backpack: olive bag, darker flap, front pocket, buckles, top handle
  const bz = -0.29;
  p.push(box(0.46, 0.5, 0.2, 0, 1.1, bz, C.olive));
  p.push(box(0.48, 0.16, 0.22, 0, 1.33, bz, C.oliveDark)); // flap
  p.push(box(0.3, 0.2, 0.06, 0, 0.98, bz - 0.12, C.olive)); // pocket
  p.push(box(0.3, 0.05, 0.065, 0, 1.06, bz - 0.12, C.oliveDark)); // pocket flap
  for (const sx of [-1, 1]) p.push(box(0.035, 0.18, 0.02, sx * 0.13, 1.24, bz - 0.11, C.rust)); // buckle straps
  p.push(box(0.14, 0.03, 0.03, 0, 1.43, bz, C.brown)); // handle
  p.push(box(0.5, 0.06, 0.12, 0, 0.84, bz - 0.04, C.sage)); // rolled mat under the bag
  // daisy on the flap
  const dz = bz - 0.115;
  p.push(box(0.11, 0.035, 0.012, 0.08, 1.33, dz, C.white));
  p.push(box(0.035, 0.11, 0.012, 0.08, 1.33, dz, C.white));
  p.push(box(0.04, 0.04, 0.016, 0.08, 1.33, dz - 0.004, C.daisy));
  // bottle in the side pocket
  const bx = -(0.23 + 0.05);
  p.push(box(0.09, 0.22, 0.09, bx, 1.02, bz + 0.02, C.bottle));
  p.push(box(0.05, 0.05, 0.05, bx, 1.15, bz + 0.02, C.bottleCap));
  p.push(box(0.1, 0.1, 0.1, bx, 0.96, bz + 0.02, C.oliveDark)); // side pocket
  return p;
}

/** Vertex-colours a geometry the same way `box` does (for the hand-rotated crest spikes). */
function paintLike(g: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Big ringed tail: alternating rust and cream rings, orange tip; hangs back and down from the hips. */
function tail(): THREE.Object3D {
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.82, -0.2);
  const p: THREE.BufferGeometry[] = [];
  const rings = [C.rust, C.cream, C.rust, C.cream, C.rust, C.cream, C.orange];
  const sizes = [0.16, 0.2, 0.23, 0.24, 0.23, 0.2, 0.15];
  let y = 0;
  let z = 0;
  rings.forEach((col, i) => {
    const s = sizes[i];
    p.push(box(s, s, 0.12, 0, y, z - 0.06, col));
    z -= 0.11;
    y -= 0.06 + i * 0.012; // curves down towards the floor
  });
  pivot.add(mesh(p));
  return pivot;
}

/** Arm: orange upper arm on the shoulder pivot, orange forearm and dark brown paw on the elbow pivot. */
function upperArm(): THREE.BufferGeometry[] {
  return [box(0.16, 0.32, 0.17, 0, -0.15, 0, C.orange)];
}
function foreArm(): THREE.BufferGeometry[] {
  return [
    box(0.15, 0.2, 0.16, 0, -0.1, 0, C.orange),
    box(0.04, 0.06, 0.05, 0.06, -0.06, 0.06, C.orangeDark), // a spot
    box(0.16, 0.11, 0.17, 0, -0.25, 0.01, C.brown), // paw
  ];
}

/** Leg: short orange thigh, shin with a spot, big dark brown foot. */
function thigh(): THREE.BufferGeometry[] {
  return [box(0.25, 0.46, 0.27, 0, -0.23, 0, C.orange), box(0.05, 0.06, 0.06, 0.1, -0.15, 0.1, C.orangeDark)];
}
function shin(): THREE.BufferGeometry[] {
  return [
    box(0.23, 0.26, 0.25, 0, -0.13, 0, C.orange),
    box(0.04, 0.05, 0.05, 0.115, -0.1, 0.03, C.orangeDark),
    box(0.25, 0.12, 0.36, 0, -0.34, 0.05, C.brown),
    box(0.05, 0.04, 0.04, -0.06, -0.33, 0.235, C.rust), // toes
    box(0.05, 0.04, 0.04, 0.06, -0.33, 0.235, C.rust),
  ];
}

/**
 * Adds the Kurt skin to a character rig (hidden at first) and sets `rig.setAlter` / `rig.tail`.
 * `setAlter(true)` hides the person's own look and shows Kurt; held props (cup, phone, ...) stay as they are.
 */
export function addKurt(rig: CharacterRig): void {
  const parts: THREE.Object3D[] = [];
  const add = (bone: THREE.Object3D, geo: THREE.BufferGeometry[]) => {
    const m = mesh(geo);
    m.visible = false;
    bone.add(m);
    parts.push(m);
    return m;
  };
  add(rig.body, bodyParts(Math.abs(rig.armL.position.x)));
  const t = tail();
  t.visible = false;
  rig.body.add(t);
  parts.push(t);
  add(rig.armL, upperArm());
  add(rig.armR, upperArm());
  add(rig.elbowL, foreArm());
  add(rig.elbowR, foreArm());
  add(rig.legL, thigh());
  add(rig.legR, thigh());
  add(rig.kneeL, shin());
  add(rig.kneeR, shin());
  rig.tail = t;
  rig.setAlter = (on) => {
    for (const s of rig.skin) s.visible = !on;
    for (const p of parts) p.visible = on;
  };
}

/** Kurt's profile picture (tooltip, roster, his office monitor), rendered once on the given person's rig. */
export function kurtPortrait(look: Look): string | null {
  return petPortrait('kurt', () => {
    const rig = buildCharacter(look);
    addKurt(rig);
    rig.setAlter!(true);
    return { root: rig.root, face: { r: 0.4, y: 1.62, z: 0.12 } };
  });
}

/** Frames of the waving loop on Marco's monitor (#32). */
export const KURT_WAVE_FRAMES = 12;
let wave: HTMLCanvasElement[] | null | undefined;

/**
 * Kurt waving into the camera, rendered once from the 3D model: the forearm waves from the elbow (the home office
 * wave pose), he bobs a little and the tail swings. Played in a loop on his office monitor.
 */
export function kurtWave(look: Look): HTMLCanvasElement[] | null {
  if (wave !== undefined) return wave;
  wave = portraitFrames(
    () => {
      const rig = buildCharacter(look);
      addKurt(rig);
      rig.setAlter!(true);
      return Object.assign(rig, { face: { r: 0.62, y: 1.4, z: 0.1 } });
    },
    KURT_WAVE_FRAMES,
    (rig, i) => {
      const a = (i / KURT_WAVE_FRAMES) * Math.PI * 2;
      rig.armR.rotation.set(-0.3, 0, 1.2);
      rig.elbowR.rotation.set(0, 0, 1.5 + Math.sin(a * 2) * 0.4);
      rig.armL.rotation.set(0, 0, -0.08);
      rig.body.position.y = Math.abs(Math.sin(a)) * 0.03;
      rig.body.rotation.z = Math.sin(a) * 0.04;
      if (rig.tail) rig.tail.rotation.y = Math.sin(a) * 0.4;
    },
  );
  return wave;
}
