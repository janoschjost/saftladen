import * as THREE from 'three';
import { box, merge, propMaterial } from './geo';

/** Mop length (rig units), the handle bottom sits at the group's origin. */
const MOP_LENGTH = 1.5;

/**
 * Christian's mop (#255): a wooden handle with a flat grey holder and a bushy head of light yarn, standing up from the
 * origin (+y). The ghost holds it in front of the body, tilted, and sweeps the floor with it.
 */
export function buildMop(): THREE.Group {
  const g = new THREE.Group();
  const parts = [
    box(0.03, MOP_LENGTH, 0.03, 0, MOP_LENGTH / 2 + 0.06, 0, '#8a6a44'), // handle
    box(0.3, 0.04, 0.1, 0, 0.06, 0, '#6b7078'), // holder
    box(0.32, 0.07, 0.14, 0, 0.015, 0, '#e8e2d2'), // yarn
    box(0.34, 0.03, 0.16, 0, -0.01, 0, '#cfc7b4'), // yarn, the dirty end
  ];
  g.add(new THREE.Mesh(merge(parts), propMaterial));
  return g;
}
