/** Back height of a pet in metres (where the hand strokes): a cat is lower than a dog. */
export const PET_HEIGHT = { cat: 0.28, dog: 0.5 };

/** Seconds to ease into / out of the kneel. */
export const CROUCH_SECONDS = 0.4;

/** Pets lower than this (rig units) get both knees, taller ones one knee. */
const BOTH_KNEES_BELOW = 0.4;
const SEG = 0.4; // thigh and shin length of the rig (hip pivot at 0.8, sole at 0)
export const KNEE_PAD = 0.1; // half the shin's thickness: how high the knee pivot sits when the knee rests on the floor

/** One leg of the rig: hip pivot `rx` (negative = forward) and `ry` (turned out about the vertical, applied last: Euler order YXZ), knee `knee` (positive = shin back). */
export interface LegPose {
  rx: number;
  ry: number;
  knee: number;
}

/** Euler order of the hip pivots while kneeling: the leg swings forward first, then turns out, so a vertical shin keeps the sole flat. */
export const LEG_ORDER = 'YXZ';

export interface PetPose {
  /** hips sink by this much (rig units), so the lowest foot or knee just touches the floor */
  drop: number;
  /** the forward leg (on one knee its foot is planted, the leg turned out so it stays clear of the pet) */
  legL: LegPose;
  /** the kneeling leg (knee on the floor, shin flat behind) */
  legR: LegPose;
  /** true when kneeling on both knees (low pets) */
  both: boolean;
  /** upper body pitch forward (rad) */
  spine: number;
  /** stroking arm / free arm (rad) */
  armStroke: number;
  armRest: number;
}

type V = [number, number, number];

export const smooth = (t: number): number => t * t * (3 - 2 * t);

const rotX = (v: V, a: number): V => [v[0], v[1] * Math.cos(a) - v[2] * Math.sin(a), v[1] * Math.sin(a) + v[2] * Math.cos(a)];
const rotY = (v: V, a: number): V => [v[0] * Math.cos(a) + v[2] * Math.sin(a), v[1], -v[0] * Math.sin(a) + v[2] * Math.cos(a)];

/** Knee and sole relative to the hip pivot (rig units, +z forward), for Euler order YXZ (`LEG_ORDER`) and a knee hinge on the thigh's x axis. */
export function legPoints(l: LegPose): { knee: V; foot: V } {
  const knee = rotY(rotX([0, -SEG, 0], l.rx), l.ry);
  const shin = rotY(rotX([0, -SEG, 0], l.rx + l.knee), l.ry);
  return { knee, foot: [knee[0] + shin[0], knee[1] + shin[1], knee[2] + shin[2]] };
}

/** How far below the hip pivot the leg reaches: its sole, or its knee once the shin lies flat. */
export function legDepth(l: LegPose): number {
  const { knee, foot } = legPoints(l);
  return Math.max(-foot[1], -knee[1] + KNEE_PAD);
}

const scaleLeg = (to: LegPose, k: number): LegPose => ({ rx: to.rx * k, ry: to.ry * k, knee: to.knee * k });

/** Kneeling pose at eased amount `amt` (0..1) at time `t` seconds, for a pet `petHeight` metres high and a person scaled `scale` (1 = rig size).
 *  Taller pets (dogs): down on one knee, the other foot planted forward, the leg turned out to the side. Low pets (cats): both knees, sitting back a little.
 *  The hips sink just as far as the legs reach, so a foot or knee always meets the floor while easing in and out. */
export function petPose(amt: number, petHeight: number, t: number, scale = 1): PetPose {
  const both = petHeight / scale < BOTH_KNEES_BELOW;
  const flat = Math.PI / 2 + 0.1; // shin a bit past horizontal behind the knee: the toes rest on the floor
  let legL: LegPose;
  let legR: LegPose;
  if (both) {
    const sitBack = 0.55; // thighs tip forward: the hips sink back towards the heels
    legL = legR = { rx: -sitBack, ry: 0, knee: sitBack + flat };
  } else {
    legR = { rx: 0.05, ry: 0, knee: flat - 0.05 };
    // front leg: shin vertical, sole flat on the floor at the kneeling hip height, the leg turned out (legL sits at -x) so knee and foot stay clear of the pet's head
    const rx = -Math.acos((legDepth(legR) - SEG) / SEG);
    legL = { rx, ry: -0.9, knee: -rx };
  }
  legL = scaleLeg(legL, amt);
  legR = scaleLeg(legR, amt);
  return {
    drop: 0.8 - Math.max(legDepth(legL), legDepth(legR)),
    legL,
    legR,
    both,
    spine: (both ? 0.4 : 0.3) * amt,
    armStroke: -0.95 * amt + Math.sin(t * 7) * 0.2 * amt,
    armRest: -0.25 * amt,
  };
}
