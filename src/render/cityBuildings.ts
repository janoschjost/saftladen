import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CITY, type Kind } from './cityLayout';

const NOMINAL_DEPTH = 13;

/**
 * Near-neutral parts, tinted per building by its wall tone (the instance colour multiplies these), so the whole city
 * stays a dimmed grey next to the office's own colours: white walls, glass a shade bluer, dark slits, a lighter roof.
 */
const WALL = '#ffffff';
const SLAB = '#f4f4f2';
const GLASS = '#b4bec7';
const DARK = '#9ea2a8';
const ROOF = '#e2e2df';

/** The nominal footprint of a building: both sizes are scaled per instance to the cell it stands in. */
export const NOMINAL_W = 12;
export const NOMINAL_D = NOMINAL_DEPTH;

const F = CITY.floor;
const D = NOMINAL_D;

type Part = THREE.BufferGeometry;

/** A box standing on `y`, painted one colour (vertex colours, so a whole building is one geometry). */
function box(w: number, h: number, d: number, x: number, y: number, z: number, color: string): Part {
  return paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), color);
}

function paint(g: Part, color: string): Part {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/** A saw-tooth roof like the office's: `n` right-angled prisms along x, rising from `y`. */
function sawtooth(w: number, d: number, n: number, rise: number, y: number, color: string): Part[] {
  const tw = w / n;
  const out: Part[] = [];
  for (let k = 0; k < n; k++) {
    const x0 = -w / 2 + k * tw;
    const x1 = x0 + tw;
    const a = [x0, y, -d / 2], b = [x1, y, -d / 2], c = [x1, y + rise, -d / 2];
    const a2 = [x0, y, d / 2], b2 = [x1, y, d / 2], c2 = [x1, y + rise, d / 2];
    const pos = [
      ...a, ...c, ...b, // front face
      ...a2, ...b2, ...c2, // back face
      ...a, ...a2, ...c2, ...a, ...c2, ...c, // slope
      ...b, ...c, ...c2, ...b, ...c2, ...b2, // tall end
      ...a, ...b2, ...a2, ...a, ...b, ...b2, // underside
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    out.push(paint(g, color));
  }
  return out;
}

/** Glass ribbons: a core, a band of glass on every floor, light slab edges, a parapet. It sits flush with its neighbours. */
function ribbon(floors: number): Part[] {
  const h = floors * F;
  const out: Part[] = [box(NOMINAL_W, h, D, 0, 0, 0, WALL)];
  for (let f = 0; f < floors; f++) {
    out.push(box(NOMINAL_W + 0.02, 1.9, D + 0.3, 0, f * F + 0.9, 0, GLASS)); // front and back faces: the sides touch the neighbours
    out.push(box(NOMINAL_W + 0.02, 0.35, D + 0.45, 0, f * F, 0, SLAB));
  }
  // vertical fins on the long faces: a rhythm to the front
  for (let k = 0; k < 4; k++) {
    const x = -NOMINAL_W / 2 + ((k + 0.5) * NOMINAL_W) / 4;
    out.push(box(0.35, h, 0.35, x, 0, D / 2 + 0.25, SLAB), box(0.35, h, 0.35, x, 0, -D / 2 - 0.25, SLAB));
  }
  out.push(box(NOMINAL_W + 0.02, 0.6, D + 0.45, 0, h, 0, SLAB));
  out.push(box(NOMINAL_W * 0.4, 1.4, D * 0.4, 1, h + 0.6, -1, ROOF)); // a plant room
  if (floors >= 12) out.push(box(NOMINAL_W * 0.7, 2.6, D * 0.7, 0, h + 0.6, 0, ROOF)); // a crown on the towers
  return out;
}

/** A concrete front with slit windows. */
function slit(floors: number): Part[] {
  const h = floors * F;
  const out: Part[] = [box(NOMINAL_W, h, D, 0, 0, 0, WALL)];
  for (let f = 0; f < floors; f++) out.push(box(NOMINAL_W + 0.02, 0.6, D + 0.3, 0, f * F + 1.5, 0, DARK));
  out.push(box(NOMINAL_W + 0.02, 0.55, D + 0.4, 0, h, 0, SLAB), box(NOMINAL_W * 0.3, 1.3, D * 0.5, -2, h + 0.55, 0, ROOF));
  return out;
}

/** The office's own hall: white walls, a clerestory band of glass and a saw-tooth roof. */
function saw(): Part[] {
  const out: Part[] = [box(NOMINAL_W, 3.2, D, 0, 0, 0, WALL), box(NOMINAL_W + 0.02, 1.5, D + 0.3, 0, 1.0, 0, GLASS), box(NOMINAL_W + 0.02, 0.3, D + 0.4, 0, 3.2, 0, SLAB)];
  out.push(...sawtooth(NOMINAL_W, D, 3, 1.9, 3.5, ROOF));
  return out;
}

/** The geometry of one kind of building, centred on its footprint and standing on y = 0. */
export function buildKind(k: Kind): THREE.BufferGeometry {
  const parts = k.style === 'saw' ? saw() : k.style === 'slit' ? slit(k.floors) : ribbon(k.floors);
  // every part brings position and normal (and uv, for a box): keep what all share
  for (const p of parts) p.deleteAttribute('uv');
  const merged = mergeGeometries(
    parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    false,
  );
  parts.forEach((p) => p.dispose());
  return merged;
}
