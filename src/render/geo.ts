import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Coloured box (vertex colours) positioned at x/y/z, optionally rotated around X first. */
export function box(
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
  rotX = 0,
  rotZ = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Upright cylinder / cone frustum (vertex colours), centre at x/y/z. */
export function cyl(
  rTop: number, rBot: number, h: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
  seg = 8,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg);
  g.translate(x, y, z);
  return paint(g, color);
}

/** Low-poly ball (vertex colours), centre at x/y/z. */
export function ball(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, sy = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(r, 12, 8);
  g.scale(1, sy, 1);
  g.translate(x, y, z);
  return paint(g, color);
}

function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Flat rectangular frame in the XY plane (used for glasses). */
export function frame(
  w: number, h: number, t: number,
  x: number, y: number, z: number,
  color: THREE.ColorRepresentation,
): THREE.BufferGeometry[] {
  return [
    box(w, t, t, x, y + h / 2, z, color),
    box(w, t, t, x, y - h / 2, z, color),
    box(t, h, t, x - w / 2, y, z, color),
    box(t, h, t, x + w / 2, y, z, color),
  ];
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return m;
}

/** One shared material for all vertex-coloured low-poly parts. */
export const propMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
