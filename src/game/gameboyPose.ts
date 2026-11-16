import * as THREE from 'three';
import type { CharacterRig } from '../render/characterBuilder';

/** The parts of the rig the handheld pose moves. */
export type GameboyRig = Pick<CharacterRig, 'body' | 'armL' | 'armR' | 'elbowL' | 'elbowR' | 'gameboy' | 'gameboyScreen'>;

/** Console position on the body: standing (and at the desk) it rides low in front of the belly, rising as it comes out. */
const LOW = { y0: 0.7, y1: 1.0, z: 0.3 };
/** On the WC the low spot is in the lap, between the thighs: the console sits up in both hands in front of the chest instead. */
const UP = { y0: 1.2, y1: 1.28, z: 0.46, arm: -0.8, armIn: 0.35, elbow: -1.2 };

/**
 * Handheld console in both hands, head bowed over it, thumbs twitching; the screen flickers.
 * `a` how far it is out (0..1), `up` how far it is held up clear of the lap (0 standing / desk, 1 seated on the WC), `t` a clock.
 */
export function poseGameboy(r: GameboyRig, a: number, up: number, t: number): void {
  r.gameboy.visible = a > 0.02;
  if (a < 0.02) return;
  const lerp = THREE.MathUtils.lerp;
  const arm = lerp(-1.05, UP.arm, up);
  const armIn = lerp(0.3, UP.armIn, up);
  const elbow = lerp(-1.35, UP.elbow, up);
  r.armL.rotation.x = lerp(r.armL.rotation.x, arm, a);
  r.armR.rotation.x = lerp(r.armR.rotation.x, arm, a);
  r.armL.rotation.z = lerp(r.armL.rotation.z, armIn, a);
  r.armR.rotation.z = lerp(r.armR.rotation.z, -armIn, a);
  r.elbowL.rotation.x = elbow * a + Math.sin(t * 23) * 0.04 * a;
  r.elbowR.rotation.x = elbow * a + Math.sin(t * 19 + 1) * 0.04 * a;
  r.body.rotation.x += 0.14 * a;
  r.gameboy.position.y = lerp(lerp(LOW.y0, LOW.y1, a), lerp(UP.y0, UP.y1, a), up);
  r.gameboy.position.z = lerp(LOW.z, UP.z, up);
  r.gameboy.rotation.x = 0.5; // screen towards his face
  r.gameboyScreen.color.setHex(Math.sin(t * 9) > 0.85 ? 0x8bac0f : 0x9bbc0f);
}
