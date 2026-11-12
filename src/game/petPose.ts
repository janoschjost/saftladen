/** Back height of a pet in metres (where the hand strokes): a cat is lower than a dog. */
export const PET_HEIGHT = { cat: 0.28, dog: 0.5 };

/** Seconds to ease into / out of the crouch. */
export const CROUCH_SECONDS = 0.4;

const HIP = 0.8; // hip height of the rig
const MAX_DROP = 0.45;

export interface PetPose {
  /** hips sink by this much (rig units) */
  drop: number;
  /** thigh swings forward by this angle (rad) */
  thigh: number;
  /** knee bends by this angle (rad); twice the thigh keeps the shin vertical, so the feet stay planted */
  knee: number;
  /** upper body pitch forward (rad) */
  spine: number;
  /** stroking arm / free arm (rad) */
  armStroke: number;
  armRest: number;
}

export const smooth = (t: number): number => t * t * (3 - 2 * t);

/** How far the hips sink to bring the hand to a pet of `petHeight` metres, for a person scaled `scale` (1 = rig size). */
export function crouchDrop(petHeight: number, scale = 1): number {
  return Math.min(MAX_DROP, Math.max(0, 0.85 * (0.9 - petHeight / scale)));
}

/** Crouch pose at eased amount `amt` (0..1) at time `t` seconds: squat with legs + hips, spine only leans the rest of the way. */
export function petPose(amt: number, petHeight: number, t: number, scale = 1): PetPose {
  const drop = crouchDrop(petHeight, scale) * amt;
  const thigh = Math.acos(1 - drop / HIP);
  return {
    drop,
    thigh,
    knee: 2 * thigh,
    spine: 0.3 * amt,
    armStroke: -0.95 * amt + Math.sin(t * 7) * 0.2 * amt,
    armRest: -0.25 * amt,
  };
}
