import * as THREE from 'three';
import type { CharacterRig } from '../render/characterBuilder';

/** The parts of the rig the camera pose moves. */
export type CameraRig = Pick<CharacterRig, 'body' | 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'camera' | 'cameraFlash'>;

/** Camera at rest (low in front of the belly, as it comes up) and held to the face; arm angles that put both fists on its sides. */
export const CAMERA = { low: { y: 0.9, z: 0.3 }, up: { y: 1.58, z: 0.28 }, arm: -1.3, armIn: 0.72, elbow: -1.7 };

/**
 * A camera in both hands at the face, elbows out, lens forward; the flash head and a glow around it light up for a shot.
 * `a` how far it is up (0..1), `flash` how hard the flash just went off (1 = at once, fading), `t` a clock.
 */
export function poseCamera(r: CameraRig, a: number, flash: number, t: number): void {
  r.camera.visible = a > 0.02;
  if (a < 0.02) return;
  const lerp = THREE.MathUtils.lerp;
  const sway = Math.sin(t * 1.7) * 0.012 * a; // a hand is never quite still
  r.armL.rotation.x = lerp(r.armL.rotation.x, CAMERA.arm, a);
  r.armR.rotation.x = lerp(r.armR.rotation.x, CAMERA.arm, a);
  r.armL.rotation.z = lerp(r.armL.rotation.z, CAMERA.armIn, a);
  r.armR.rotation.z = lerp(r.armR.rotation.z, -CAMERA.armIn, a);
  r.elbowL.rotation.x = CAMERA.elbow * a;
  r.elbowR.rotation.x = CAMERA.elbow * a;
  r.body.rotation.x += (0.04 - 0.05 * flash) * a; // a shot rocks them back a touch
  r.camera.position.set(0, lerp(CAMERA.low.y, CAMERA.up.y, a) + sway, lerp(CAMERA.low.z, CAMERA.up.z, a));
  r.camera.rotation.x = 0;
  r.cameraFlash.head.color.setHex(flash > 0.05 ? 0xffffff : 0x4a4d55);
  const glow = r.cameraFlash.glow;
  glow.visible = flash > 0.02;
  (glow.material as THREE.MeshBasicMaterial).opacity = 0.75 * flash * a;
}
