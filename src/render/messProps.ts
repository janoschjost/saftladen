import * as THREE from 'three';
import { ball, box, cyl, merge, propMaterial } from './geo';

/**
 * What people leave lying around the office (#254): to-go cups, water bottles, crumpled paper balls, chip bags,
 * dirty plates, lunchboxes, a jacket on the floor, and the paper bin by the printer with the heap that grows out of it.
 * The meshes are plain, their origin on the surface they stand on; `Mess.ts` decides where they are and when.
 */
export type MessKind = 'cup' | 'bottle' | 'paper' | 'chips' | 'plate' | 'lunchbox' | 'jacket';

const shaded = (parts: THREE.BufferGeometry[]): THREE.Mesh => {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
};

const CUPS = ['#f4f1ea', '#e9dcc4', '#2f2f33'];
const SLEEVES = ['#8a5a36', '#3b6ea5', '#c2453a'];
const BOTTLES = ['#9cc7e6', '#b8e0c8', '#d9e4ee'];
const CAPS = ['#2a62b8', '#3f9a52', '#e0e0e0'];
const BAGS = ['#e2b23a', '#c8382f', '#2f7bc1', '#4b9a3a'];
const BOXES = ['#3b8fd1', '#e86f9e', '#f2c43a', '#7f5bc4'];
const JACKETS = ['#2b2523', '#232a3a', '#33382a', '#5a5046', '#4a2a2e'];
/** The colour a forgotten lunchbox ends up with. */
export const MOULD = new THREE.Color('#6f9a3a');

/** A to-go coffee cup: paper cup, a sleeve, a lid. */
function cup(v: number): THREE.Mesh {
  return shaded([
    cyl(0.04, 0.03, 0.11, 0, 0.055, 0, CUPS[v % CUPS.length], 10),
    cyl(0.039, 0.034, 0.045, 0, 0.06, 0, SLEEVES[v % SLEEVES.length], 10),
    cyl(0.043, 0.043, 0.012, 0, 0.116, 0, '#ffffff', 10),
  ]);
}

/** A half-empty plastic water bottle. */
function bottle(v: number): THREE.Mesh {
  return shaded([
    cyl(0.035, 0.035, 0.17, 0, 0.085, 0, BOTTLES[v % BOTTLES.length], 8),
    cyl(0.018, 0.035, 0.04, 0, 0.19, 0, BOTTLES[v % BOTTLES.length], 8),
    cyl(0.018, 0.018, 0.02, 0, 0.22, 0, CAPS[v % CAPS.length], 8),
  ]);
}

/** A crumpled ball of paper (geometry), centre at x/y/z. */
function crumple(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.translate(x, y, z);
  const c = new THREE.Color(color);
  const colors = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** A crumpled ball of paper. */
function paper(v: number): THREE.Mesh {
  return shaded([crumple(0.035 + (v % 3) * 0.005, 0, 0.032, 0, v % 4 === 3 ? '#f3e7a1' : '#f4f4f0')]);
}

/** An empty bag of chips, flattened and folded over. */
function chips(v: number): THREE.Mesh {
  const c = BAGS[v % BAGS.length];
  return shaded([
    box(0.16, 0.02, 0.2, 0, 0.01, 0, c),
    box(0.15, 0.025, 0.07, 0.005, 0.028, -0.06, c, 0.25),
    box(0.06, 0.004, 0.06, 0.02, 0.022, 0.03, '#f6f1e4'), // label
    ball(0.012, -0.08, 0.008, 0.11, '#e7c26a'), // a crumb
  ]);
}

/** A dirty plate with a fork and leftovers. */
function plate(v: number): THREE.Mesh {
  return shaded([
    cyl(0.12, 0.1, 0.015, 0, 0.0075, 0, '#f7f6f2', 14),
    ball(0.035, 0.03, 0.02, -0.02, v % 2 ? '#c8813a' : '#9a3a2a', 0.35), // sauce
    ball(0.02, -0.04, 0.02, 0.03, '#e7d27a', 0.5), // a bit of pasta
    box(0.16, 0.006, 0.014, 0.0, 0.018, 0.06, '#b9bcc0', 0, 0), // fork
  ]);
}

/** A lunchbox: coloured tub, see-through lid. It gets its own material, so it can turn green (`mouldy`). */
function lunchbox(v: number): THREE.Mesh {
  const color = BOXES[v % BOXES.length];
  const g = merge([
    box(0.2, 0.07, 0.14, 0, 0.035, 0, '#ffffff'),
    box(0.21, 0.015, 0.15, 0, 0.077, 0, '#e8e8e8'),
    box(0.06, 0.012, 0.02, 0, 0.077, 0.08, '#e8e8e8'), // clip
  ]);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, color }));
  m.castShadow = true;
  m.userData.base = new THREE.Color(color);
  return m;
}

/** A jacket that fell off a coat stand: lying flat and crumpled, sleeves spread. */
function jacket(v: number): THREE.Mesh {
  const c = JACKETS[v % JACKETS.length];
  const d = new THREE.Color(c).offsetHSL(0, 0, -0.05).getStyle();
  return shaded([
    box(0.5, 0.06, 0.62, 0, 0.03, 0, c),
    box(0.3, 0.05, 0.12, -0.05, 0.075, -0.24, d), // collar slumped over
    box(0.16, 0.05, 0.45, -0.34, 0.025, 0.05, d, 0, 0), // sleeves
    box(0.42, 0.05, 0.14, 0.2, 0.025, 0.36, d),
    box(0.04, 0.02, 0.4, 0.02, 0.07, 0.06, '#1b1b1d'), // zip
  ]);
}

const BUILD: Record<MessKind, (v: number) => THREE.Mesh> = { cup, bottle, paper, chips, plate, lunchbox, jacket };

/** One piece of mess of `kind`, look `variant`; its origin is where it touches the surface. */
export function buildMess(kind: MessKind, variant: number): THREE.Mesh {
  const m = BUILD[kind](Math.abs(Math.floor(variant)));
  m.userData.nonav = true;
  m.name = `mess:${kind}`;
  return m;
}

/** How far a lunchbox has turned green (0 fresh .. 1 mouldy): its colour follows. */
export function mouldy(m: THREE.Mesh, amount: number): void {
  const base = m.userData.base as THREE.Color | undefined;
  if (!base) return;
  (m.material as THREE.MeshLambertMaterial).color.copy(base).lerp(MOULD, Math.min(1, Math.max(0, amount)) * 0.85);
}

/** Footprint radius (m) of each kind, for keeping them off each other. */
export const MESS_RADIUS: Record<MessKind, number> = {
  cup: 0.05,
  bottle: 0.045,
  paper: 0.045,
  chips: 0.13,
  plate: 0.13,
  lunchbox: 0.13,
  jacket: 0.42,
};

/**
 * The paper bin by the printer (origin on the floor): a grey mesh bin, and the heap of crumpled paper that grows out
 * of it once it overflows (hidden until then).
 */
export function buildPaperBin(): { root: THREE.Group; heap: THREE.Object3D } {
  const root = new THREE.Group();
  const bin = shaded([
    cyl(0.14, 0.11, 0.34, 0, 0.17, 0, '#5d6268', 10),
    cyl(0.145, 0.145, 0.015, 0, 0.34, 0, '#43474c', 10),
    cyl(0.12, 0.12, 0.004, 0, 0.32, 0, '#e9e7e0', 10), // paper inside
  ]);
  const spots = [
    [0, 0.4, 0, 0.07],
    [0.07, 0.37, 0.05, 0.05],
    [-0.06, 0.38, -0.04, 0.055],
    [0.04, 0.45, -0.05, 0.045],
    [-0.05, 0.44, 0.06, 0.045],
    [0.0, 0.5, 0.01, 0.04],
  ];
  const heap = shaded(spots.map(([x, y, z, r]) => crumple(r, x, y, z, '#f2f2f2')));
  heap.visible = false;
  root.add(bin, heap);
  root.traverse((o) => (o.userData.nonav = true));
  return { root, heap };
}
