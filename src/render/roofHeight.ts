/** Roof underside of the office, shared by the roof geometry and the things that hang from it (pendant cords). */
export const H_LOW = 2.8; // flat ceiling along window walls
export const H_CORE = 3.3; // top of core box / text wall
export const BAND = 6.7; // z where the high folded roof ends and the low window band begins
export const CZ = -1.0; // z of the core's south wall
export const TEETH = [-5, 1.3, 7.9, 14.5, 21.1, 27.7]; // sawtooth roof fold lines (x)
export const ROOF_LO = 3.8; // sawtooth: height at the low end of a tooth
export const ROOF_HI = 5.5; // sawtooth: height at the high end of a tooth

/** Height of the roof underside above plan position (x, z): sawtooth over the open office, flat ceilings elsewhere. */
export function roofHeightAt(x: number, z: number): number {
  const first = TEETH[0];
  const last = TEETH[TEETH.length - 1];
  if (z >= BAND || x < first || x >= last) return H_LOW;
  if (z < CZ && x < 26) return H_CORE;
  let i = 0;
  while (i < TEETH.length - 2 && x >= TEETH[i + 1]) i++;
  const t = (x - TEETH[i]) / (TEETH[i + 1] - TEETH[i]);
  return ROOF_LO + (ROOF_HI - ROOF_LO) * t;
}
