import * as THREE from 'three';

/** Seat height drop of a sitting person (hip goes from 0.8 down to 0.4). */
export const SIT_DROP = 0.4;

export interface DeskRig {
  root: THREE.Group;
  screen: THREE.Mesh;
}

let screenOff: THREE.MeshBasicMaterial | null = null;

/** Dark (idle) screen material. */
export function screenOffMaterial(): THREE.MeshBasicMaterial {
  screenOff ??= new THREE.MeshBasicMaterial({ color: '#1b212c' });
  return screenOff;
}
