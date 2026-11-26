import * as THREE from 'three';

/** Seat height drop of a sitting person (hip goes from 0.8 down to 0.4). */
export const SIT_DROP = 0.4;

export interface DeskRig {
  root: THREE.Group;
  screen: THREE.Mesh;
  /** the swivel chair, pivoting on its own base: the office turns it with whoever sits on it (`Desk.turnChair`) */
  chair: THREE.Object3D;
  /** coffee mug standing on the desk (hidden while nobody has a coffee) and its dark coffee surface */
  mug: THREE.Object3D;
  coffee: THREE.Object3D;
  /** desk-local spots on the top where mess can be put down (#254, see `messSpots`) */
  messSpots: Array<{ x: number; z: number }>;
}

let screenOff: THREE.MeshBasicMaterial | null = null;

/** Dark (idle) screen material. */
export function screenOffMaterial(): THREE.MeshBasicMaterial {
  screenOff ??= new THREE.MeshBasicMaterial({ color: '#1b212c' });
  return screenOff;
}
