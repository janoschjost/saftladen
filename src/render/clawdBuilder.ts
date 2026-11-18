import * as THREE from 'three';
import { box, merge } from './geo';

/**
 * Clawd, Claude's mascot (#232): a wide orange block with two stub arms, two tall dark eyes and four short legs, in
 * metres (about 0.24 m tall, front is +z). It is its own little voxel build, not a copy of anybody's logo.
 */
const C = { orange: '#ff9a68', shade: '#e0764a', eye: '#1b1b22' };

/** a little self-lit, so he stays orange in the dark credits room */
const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#6b3418' });

export interface ClawdRig {
  root: THREE.Group;
  /** everything but the legs: bobs and squashes */
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** front left, front right, back left, back right */
  legs: THREE.Group[];
  eyes: THREE.Group;
  /** bigger than he looks, so a tap finds him (never drawn) */
  hit: THREE.Mesh;
}

const part = (geos: THREE.BufferGeometry[]): THREE.Mesh => {
  const m = new THREE.Mesh(merge(geos), material);
  m.castShadow = true;
  return m;
};

export function buildClawd(): ClawdRig {
  const root = new THREE.Group();
  const LEG = 0.09;

  const body = new THREE.Group();
  body.position.y = LEG;
  body.add(part([box(0.34, 0.2, 0.2, 0, 0.1, 0, C.orange), box(0.34, 0.03, 0.2, 0, 0.015, 0, C.shade)]));

  const eyes = new THREE.Group();
  eyes.position.set(0, 0.12, 0.101);
  for (const sx of [-1, 1]) eyes.add(part([box(0.04, 0.07, 0.01, sx * 0.075, 0, 0, C.eye)]));
  body.add(eyes);

  const arm = (sx: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(sx * 0.17, 0.15, 0); // the shoulder, on the body's side
    g.add(part([box(0.07, 0.07, 0.07, sx * 0.035, -0.03, 0, C.orange)]));
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);

  const legs = [
    [-0.12, 0.05],
    [0.12, 0.05],
    [-0.12, -0.05],
    [0.12, -0.05],
  ].map(([x, z]) => {
    const g = new THREE.Group();
    g.position.set(x, LEG, z); // the hip
    g.add(part([box(0.05, LEG, 0.05, 0, -LEG / 2, 0, C.shade)]));
    root.add(g);
    return g;
  });

  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.22;
  root.add(body, hit);
  root.scale.setScalar(0.8);
  return { root, body, armL, armR, legs, eyes, hit };
}
