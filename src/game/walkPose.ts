import type { CharacterRig } from '../render/characterBuilder';
import { HIP_HEIGHT } from './petPose';

/** Walk-cycle radians per metre walked: what `Person` uses (`phase += dt * speed * 4.2`). */
export const WALK_PHASE_PER_M = 4.2;

/** How far a leg reaches down for hip angle `a` and knee bend `k` (m): the planted foot sets the pelvis height. */
const depth = (a: number, k: number) => 0.4 * Math.cos(a) + 0.4 * Math.cos(a + k);

/**
 * The walk cycle of everybody else (`Game.ts`) for a rig that is not a `Person`: same swing, knee bend, arm swing and
 * weight shift. Keep it in step with the walk block of `pose()` in `Game.ts` (a `Person` has more terms there: sitting, dangling, a tail). `ph` is the cycle phase; `moving` (0..1) blends from standing (0) to the full walk (1).
 */
export function walkPose(r: CharacterRig, ph: number, moving = 1): void {
  const swing = Math.sin(ph) * 0.42 * moving;
  const c = Math.cos(ph);
  r.legL.rotation.x = swing;
  r.legR.rotation.x = -swing;
  r.kneeL.rotation.x = (Math.max(0, -c) * 1.1 + 0.06) * moving;
  r.kneeR.rotation.x = (Math.max(0, c) * 1.1 + 0.06) * moving;
  // the pelvis rides on the planted foot, so the feet touch the floor
  const hip = HIP_HEIGHT + (Math.max(depth(swing, r.kneeL.rotation.x), depth(-swing, r.kneeR.rotation.x)) - HIP_HEIGHT) * 0.5;
  r.legL.position.y = r.legR.position.y = hip;
  r.armL.rotation.x = -swing * 0.8;
  r.armR.rotation.x = swing * 0.8;
  r.body.position.y = hip - HIP_HEIGHT;
  r.body.rotation.z = c * 0.035 * moving;
  r.body.position.x = Math.sin(ph) * 0.02 * moving;
}
