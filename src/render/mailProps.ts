import * as THREE from 'three';
import { ax, OFFICE_D } from './officeModel';
import { ball, box, merge, propMaterial } from './geo';

/**
 * Everything the post is made of (#202): the three mailboxes on the front wall beside the door, the envelopes and
 * parcels in their sizes and colours, the dove that brings the letters and the drone that brings the parcels.
 * The meshes are plain; `Mail.ts` decides where they are and when.
 */

/** Outer face of the front wall (game metres); the porch starts here. */
const WALL = OFFICE_D + 0.15;
/** A Swiss steel mailbox: wide, grey, letter compartment with the slot above, a door with a handle below. */
const BOX = { w: 0.42, h: 0.32, d: 0.28, y: 1.2 };
const SHADES = ['#b4b9bf', '#aab0b7', '#bcc0c5'];

/** The mailboxes on the front wall, east of the door and clear of its swing: where each one is (centre of its front, game metres). */
export const MAILBOXES: ReadonlyArray<{ x: number; z: number }> = [0, 1, 2].map((i) => ({ x: ax(-3.3) + 1.4 + i * 0.5, z: WALL }));
/** Top of a mailbox (m above the porch). */
export const MAILBOX_TOP = BOX.y + BOX.h / 2;
/** Where whoever fetches the post stands: in front of the middle mailbox. */
export const MAIL_SPOT = { x: MAILBOXES[1].x, z: WALL + 1.3, rain: true };
/** Where a delivered parcel is put down: on the porch in front of the mailboxes. */
export const PARCEL_SPOT = { x: MAILBOXES[1].x, z: WALL + 0.8 }; // the drone's rotors (0.55 m out) stay off the wall

/** The three wall-mounted steel mailboxes: a letter flap with a slot and a lock on top, a door with a handle and a name plate below. */
export function buildMailboxes(): THREE.Group {
  const g = new THREE.Group();
  const { w, h, d } = BOX;
  MAILBOXES.forEach((m, i) => {
    const front = d / 2;
    const parts = [
      box(w, h, d, 0, 0, 0, SHADES[i]),
      box(w + 0.016, 0.014, d + 0.016, 0, h / 2 + 0.007, 0, '#a2a8ae'), // lid rim
      box(w - 0.04, h * 0.36, 0.012, 0, h * 0.27, front + 0.006, '#c6cacf'), // letter flap
      box(w - 0.14, 0.012, 0.016, -0.02, h * 0.27 + 0.025, front + 0.012, '#1b1d21'), // slot
      box(0.026, 0.026, 0.01, -(w / 2 - 0.06), h * 0.27 - 0.03, front + 0.014, '#dfe2e6'), // lock
      box(0.006, 0.014, 0.012, -(w / 2 - 0.06), h * 0.27 - 0.03, front + 0.016, '#1b1d21'),
      box(w - 0.04, h * 0.5, 0.012, 0, -h * 0.2, front + 0.006, '#c0c4c9'), // door
      box(0.055, 0.024, 0.022, -(w / 2 - 0.09), -h * 0.2 + 0.05, front + 0.02, '#e3e6ea'), // handle
      box(0.12, 0.04, 0.004, 0.07, -h * 0.2 - 0.04, front + 0.014, '#f4f1e8'), // name plate
    ];
    const mesh = new THREE.Mesh(merge(parts), propMaterial);
    mesh.castShadow = true;
    mesh.position.set(m.x, BOX.y, m.z + d / 2);
    g.add(mesh);
  });
  return g;
}

/** Where the letter of mailbox `i` sticks out of its slot (game coordinates; the envelope lies flat, half inside). */
export function slotAt(i: number): { x: number; y: number; z: number } {
  return { x: MAILBOXES[i].x - 0.02, y: BOX.y + BOX.h * 0.27 + 0.025, z: MAILBOXES[i].z + BOX.d + 0.014 };
}

/** What an item looks like: size (m) and colours. */
interface Variant {
  name: string;
  w: number;
  h: number;
  d: number;
  color: string;
  /** flap / tape / ribbon */
  trim: string;
}

export const ENVELOPES: readonly Variant[] = [
  { name: 'cream', w: 0.16, h: 0.1, d: 0.006, color: '#f3ead2', trim: '#d8c9a0' },
  { name: 'pink', w: 0.15, h: 0.11, d: 0.006, color: '#f2b8c6', trim: '#d98aa0' },
  { name: 'blue', w: 0.17, h: 0.11, d: 0.006, color: '#a9cbe8', trim: '#7ba3cc' },
  { name: 'white', w: 0.22, h: 0.11, d: 0.006, color: '#f6f6f2', trim: '#c9c9c4' },
  { name: 'kraft', w: 0.3, h: 0.22, d: 0.01, color: '#c79a62', trim: '#a87c48' },
];

export const PARCELS: readonly Variant[] = [
  { name: 'small', w: 0.2, h: 0.12, d: 0.15, color: '#b98a55', trim: '#e8d9b5' },
  { name: 'medium', w: 0.32, h: 0.2, d: 0.24, color: '#c49560', trim: '#e8d9b5' },
  { name: 'large', w: 0.46, h: 0.3, d: 0.34, color: '#a97b47', trim: '#e8d9b5' },
  { name: 'blue', w: 0.3, h: 0.16, d: 0.22, color: '#e6edf6', trim: '#3b6fb6' },
  { name: 'gift', w: 0.26, h: 0.26, d: 0.26, color: '#c8453f', trim: '#e3b341' },
];

/** An envelope standing upright (its front towards +z, origin at the centre); `size` is what it measures. */
export function buildEnvelope(variant: number): THREE.Mesh {
  const v = ENVELOPES[variant % ENVELOPES.length];
  const f = v.d / 2;
  const parts = [
    box(v.w, v.h, v.d, 0, 0, 0, v.color),
    box(v.w * 0.62, 0.006, 0.004, -v.w * 0.19, v.h * 0.08, f + 0.002, v.trim, 0, 0.45), // flap
    box(v.w * 0.62, 0.006, 0.004, v.w * 0.19, v.h * 0.08, f + 0.002, v.trim, 0, -0.45),
    box(v.w * 0.14, v.h * 0.2, 0.004, v.w * 0.38, v.h * 0.3, f + 0.002, '#d94a38'), // stamp
    box(v.w * 0.4, 0.006, 0.004, -v.w * 0.1, -v.h * 0.22, f + 0.002, '#7a7a82'), // address
    box(v.w * 0.3, 0.006, 0.004, -v.w * 0.15, -v.h * 0.34, f + 0.002, '#7a7a82'),
  ];
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.userData.size = { w: v.w, h: v.h, d: v.d };
  return m;
}

/** A parcel with tape and a label (origin at the centre; the gift one has a ribbon instead of tape). */
export function buildParcel(variant: number): THREE.Mesh {
  const v = PARCELS[variant % PARCELS.length];
  const gift = v.name === 'gift';
  const parts = [
    box(v.w, v.h, v.d, 0, 0, 0, v.color),
    box(0.04, v.h + 0.006, v.d + 0.006, 0, 0, 0, v.trim), // tape / ribbon around the middle
    box(v.w + 0.006, v.h + 0.006, 0.04, 0, 0, 0, v.trim),
  ];
  if (!gift) parts.push(box(0.09, 0.06, 0.004, v.w * 0.22, 0, v.d / 2 + 0.003, '#f4f1e8')); // label
  else parts.push(box(0.1, 0.05, 0.05, 0, v.h / 2 + 0.025, 0, v.trim), box(0.05, 0.1, 0.05, 0, v.h / 2 + 0.025, 0, v.trim)); // bow
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.userData.size = { w: v.w, h: v.h, d: v.d };
  return m;
}

/** The size (m) a mesh of `buildEnvelope` / `buildParcel` measures. */
export const sizeOf = (m: THREE.Object3D): { w: number; h: number; d: number } => m.userData.size;

/** The dove: a white body with two wings that flap (`flap`). It looks along +z. */
export interface Dove {
  root: THREE.Group;
  wings: [THREE.Group, THREE.Group];
}
export const DOVE_SCALE = 1.8;
export function buildDove(): Dove {
  const root = new THREE.Group();
  const grey = '#8d9298';
  const pale = '#b3b8bd';
  const dark = '#737880';
  const body = new THREE.Mesh(
    merge([
      box(0.12, 0.09, 0.2, 0, 0.0, -0.02, grey), // back and flanks
      box(0.1, 0.07, 0.12, 0, -0.025, 0.07, pale), // plump breast
      box(0.08, 0.06, 0.07, 0, 0.045, 0.1, grey), // shoulders
      box(0.07, 0.03, 0.05, 0, 0.065, 0.135, '#7da396'), // iridescent neck patch
      box(0.07, 0.07, 0.07, 0, 0.1, 0.16, '#9aa0a6'), // head
      box(0.075, 0.02, 0.05, 0, 0.075, 0.16, pale), // cheeks
      box(0.03, 0.02, 0.03, 0, 0.1, 0.215, '#c9ccd0'), // cere
      box(0.022, 0.016, 0.035, 0, 0.092, 0.24, '#3a3d42'), // beak
      box(0.016, 0.022, 0.012, 0.037, 0.11, 0.195, '#d9822b'), // eyes: orange ring, black pupil
      box(0.016, 0.022, 0.012, -0.037, 0.11, 0.195, '#d9822b'),
      box(0.01, 0.014, 0.014, 0.041, 0.11, 0.2, '#16171b'),
      box(0.01, 0.014, 0.014, -0.041, 0.11, 0.2, '#16171b'),
      box(0.07, 0.025, 0.1, 0, 0.015, -0.16, dark, 0.12), // tail: three feathers
      box(0.035, 0.02, 0.1, 0.035, 0.012, -0.17, '#6a6f76', 0.12),
      box(0.035, 0.02, 0.1, -0.035, 0.012, -0.17, '#6a6f76', 0.12),
      box(0.07, 0.012, 0.03, 0, 0.0, -0.225, '#e6e8ea'), // pale tail tip
      box(0.012, 0.045, 0.012, 0.03, -0.075, 0.03, '#c4586b'), // legs and feet
      box(0.012, 0.045, 0.012, -0.03, -0.075, 0.03, '#c4586b'),
      box(0.03, 0.01, 0.045, 0.03, -0.1, 0.045, '#c4586b'),
      box(0.03, 0.01, 0.045, -0.03, -0.1, 0.045, '#c4586b'),
    ]),
    propMaterial,
  );
  body.castShadow = true;
  root.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.06, 0.05, 0.03);
    // coverts near the body, then the long primaries with pale tips
    const wing = new THREE.Mesh(
      merge([
        box(0.1, 0.014, 0.14, side * 0.05, 0.004, -0.03, '#80858b'),
        box(0.12, 0.012, 0.16, side * 0.14, 0, -0.05, '#7b8086'),
        box(0.1, 0.012, 0.15, side * 0.24, -0.002, -0.07, '#6f747a'),
        box(0.05, 0.012, 0.12, side * 0.31, -0.004, -0.08, '#a2a7ad'),
      ]),
      propMaterial,
    );
    pivot.add(wing);
    root.add(pivot);
    return pivot;
  }) as [THREE.Group, THREE.Group];
  root.scale.setScalar(DOVE_SCALE);
  return { root, wings };
}

/** Flaps the wings: `t` seconds, `rate` flaps a second; `fold` 0..1 lays them back along the body (perched). */
export function flap(d: Dove, t: number, rate: number, fold = 0): void {
  const a = rate > 0 ? Math.sin(t * rate * Math.PI * 2) * 0.7 : 0;
  d.wings.forEach((w, i) => {
    const side = i === 0 ? -1 : 1;
    w.rotation.set(0, side * 1.45 * fold, side * a * (1 - fold) * -1);
  });
}

/** The delivery drone: a dark body with four arms and rotors, ropes to hang a parcel from. */
export interface Drone {
  root: THREE.Group;
  rotors: THREE.Mesh[];
  /** the ropes the parcel hangs from, visible while it is carried */
  ropes: THREE.Mesh;
}
/** How far (m) a hanging parcel's top is below the drone's centre. */
export const HANG = 0.4;
export function buildDrone(): Drone {
  const root = new THREE.Group();
  const parts = [box(0.32, 0.09, 0.32, 0, 0, 0, '#2e3238'), box(0.22, 0.03, 0.22, 0, 0.06, 0, '#e8523f'), ball(0.03, 0, -0.06, 0.14, '#9fd3ff')];
  for (const turn of [1, -1]) parts.push(box(0.9, 0.025, 0.025, 0, 0.03, 0, '#4a4f58').rotateY((turn * Math.PI) / 4)); // the two crossing arms
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.04, 0.05, 0.04, sx * 0.32, 0.04, sz * 0.32, '#4a4f58')); // motors
  const body = new THREE.Mesh(merge(parts), propMaterial);
  body.castShadow = true;
  root.add(body);
  const rotorGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.008, 18);
  const rotorMat = new THREE.MeshBasicMaterial({ color: '#d8dde4', transparent: true, opacity: 0.45 });
  const rotors: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(sx * 0.32, 0.075, sz * 0.32);
      root.add(r);
      rotors.push(r);
    }
  }
  const ropeParts = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(0.01, HANG, 0.01, sx * 0.1, -HANG / 2 - 0.04, sz * 0.1, '#222226')));
  const ropes = new THREE.Mesh(merge(ropeParts), propMaterial);
  root.add(ropes);
  return { root, rotors, ropes };
}

/** Spins the rotors: `t` seconds. */
export function spin(d: Drone, t: number): void {
  d.rotors.forEach((r, i) => (r.rotation.y = t * 40 * (i % 2 ? 1 : -1)));
}
