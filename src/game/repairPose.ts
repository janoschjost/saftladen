import * as THREE from 'three';
import type { CharacterRig } from '../render/characterBuilder';

/** The parts of the rig the repair pose moves. */
export type RepairRig = Pick<CharacterRig, 'body' | 'armL' | 'armR' | 'elbowL' | 'elbowR'>;

/**
 * Fixing the server rack the way people do: leaning in, the left hand fiddling at the front, the right fist banging
 * on the case, the whole body shaking with anger. `a` how far into the pose (0..1), `hit` 1 when the fist just
 * landed, fading out fast, `t` a clock.
 */
export function poseRepair(r: RepairRig, a: number, hit: number, t: number): void {
  if (a < 0.02) return;
  const lerp = THREE.MathUtils.lerp;
  r.armR.rotation.x = lerp(r.armR.rotation.x, -0.85 - 0.6 * hit, a); // fist cocked, then forward at the bang
  r.armR.rotation.z = lerp(r.armR.rotation.z, -0.18, a);
  r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, -0.5 - 0.5 * (1 - hit), a);
  r.armL.rotation.x = lerp(r.armL.rotation.x, -1.25 + Math.sin(t * 7) * 0.12, a); // fiddling at the rack
  r.armL.rotation.z = lerp(r.armL.rotation.z, 0.2, a);
  r.elbowL.rotation.x = lerp(r.elbowL.rotation.x, -0.9 + Math.sin(t * 9) * 0.15, a);
  r.body.rotation.x += (0.1 + 0.08 * hit) * a; // leans in, rocks with the bang
  r.body.rotation.y += Math.sin(t * 6.5) * 0.07 * a; // shakes with anger
}
