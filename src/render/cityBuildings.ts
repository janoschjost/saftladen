import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Building, Rect } from './cityLayout';

/** A building as a plain block: its footprint extruded from the ground at its lowest corner up to its roof. Quiet: no detail, the edges are drawn separately. */
export function buildBlock(b: Building): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let k = 0; k < b.p.length; k += 2) {
    // after the turn below, shape y is -z
    if (k === 0) shape.moveTo(b.p[k], -b.p[k + 1]);
    else shape.lineTo(b.p[k], -b.p[k + 1]);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: b.h - b.base, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, b.base, 0);
  g.deleteAttribute('uv');
  return g;
}

/** A box from its corners (x0..x1, y0..y1, z0..z1). */
const slab = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry =>
  new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);

/**
 * The ground floor under the office: a plain block of its footprint from the street (`base`) up to the office's floor, with a band of
 * windows in bays along every side and an entrance with a canopy at `doorX` on the south side. All boxes, so their edges
 * draw it like a sketch.
 */
export function groundFloor(foot: Rect, base: number, doorX: number): THREE.BufferGeometry {
  const bay = 3;
  const win = { y0: base + 1, y1: base + 2.8, depth: 0.15 };
  const parts: THREE.BufferGeometry[] = [slab(foot.x0, foot.x1, base, 0, foot.z0, foot.z1)];
  const along = (from: number, to: number, put: (a: number, b: number) => THREE.BufferGeometry | null) => {
    const n = Math.floor((to - from) / bay);
    const pad = (to - from - n * bay) / 2;
    for (let i = 0; i < n; i++) {
      const part = put(from + pad + i * bay + 0.3, from + pad + (i + 1) * bay - 0.3);
      if (part) parts.push(part);
    }
  };
  for (const z of [foot.z0, foot.z1]) along(foot.x0, foot.x1, (a, b) => (z === foot.z1 && doorX > a - 1.5 && doorX < b + 1.5 ? null : slab(a, b, win.y0, win.y1, z - win.depth, z + win.depth)));
  for (const x of [foot.x0, foot.x1]) along(foot.z0, foot.z1, (a, b) => slab(x - win.depth, x + win.depth, win.y0, win.y1, a, b));
  // the entrance: a door in the south wall and a canopy over it
  parts.push(slab(doorX - 1.2, doorX + 1.2, base, base + 2.8, foot.z1 - 0.2, foot.z1 + 0.2), slab(doorX - 2.5, doorX + 2.5, base + 3, base + 3.2, foot.z1, foot.z1 + 1.6));
  const merged = mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
  for (const g of parts) g.dispose();
  merged.deleteAttribute('uv');
  return merged;
}

/**
 * A road as a flat ribbon on the ground: its centre line cut every 2 m and lifted to the terrain (`ground(x, z)`), `w` wide.
 * It stops at what `blocked(x, z)` says is built on (a building's footprint): each side is only as wide as the free ground
 * next to the centre line, and a piece whose centre line is built on is left out, so road and buildings never overlap.
 */
export function roadStrip(
  p: readonly number[],
  w: number,
  ground: (x: number, z: number) => number,
  blocked: (x: number, z: number) => boolean = () => false,
): THREE.BufferGeometry {
  const pts: Array<[number, number]> = [];
  for (let k = 0; k < p.length; k += 2) {
    const [x1, z1] = [p[k], p[k + 1]];
    if (k === 0) pts.push([x1, z1]);
    else {
      const [x0, z0] = pts[pts.length - 1];
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2));
      for (let i = 1; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, z0 + ((z1 - z0) * i) / n]);
    }
  }
  // how far the free ground reaches from the centre line towards (dx, dz), at most `w / 2`
  const reach = (x: number, z: number, dx: number, dz: number) => {
    let d = 0;
    while (d < w / 2 && !blocked(x + dx * (d + 0.25), z + dz * (d + 0.25))) d += 0.25;
    return d;
  };
  const pos: number[] = [];
  const idx: number[] = [];
  const open: boolean[] = []; // the section has a free centre
  pts.forEach(([x, z], i) => {
    const [ax, az] = pts[Math.max(0, i - 1)];
    const [bx, bz] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = -(bz - az) / len; // sideways, perpendicular to the road
    const uz = (bx - ax) / len;
    const free = !blocked(x, z);
    open.push(free);
    const l = free ? reach(x, z, ux, uz) : 0;
    const r = free ? reach(x, z, -ux, -uz) : 0;
    pos.push(x + ux * l, ground(x + ux * l, z + uz * l), z + uz * l, x - ux * r, ground(x - ux * r, z - uz * r), z - uz * r);
    if (i && open[i - 1] && free) idx.push(i * 2 - 2, i * 2, i * 2 - 1, i * 2 - 1, i * 2, i * 2 + 1);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
