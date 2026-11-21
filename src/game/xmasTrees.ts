import * as THREE from 'three';

/** Where the christmas trees stand (game coordinates, x / z) and their scale. */
export const TREES: ReadonlyArray<{ x: number; z: number; s: number }> = [
  { x: 5.4, z: 12.6, s: 1.15 },
  { x: 37.6, z: 11.6, s: 0.9 },
];

/** How far (m, at scale 1) a tree's trunk and lowest branches reach: what nobody walks through. */
const REACH = 0.5;

/** The footprints of the trees (game space), which block walking while Christmas mode is on (#288). */
export function treeBlockers(): THREE.Box3[] {
  return TREES.map((t) => new THREE.Box3(new THREE.Vector3(t.x - REACH * t.s, 0, t.z - REACH * t.s), new THREE.Vector3(t.x + REACH * t.s, 2, t.z + REACH * t.s)));
}
