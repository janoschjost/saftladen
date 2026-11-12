import * as THREE from 'three';
import type { TeamMember } from '../data/types';
import { box, merge, propMaterial } from './geo';

export type CoatStyle = 'wool' | 'quilted' | 'puffer' | 'parka';

/** Winter coats of people whose look has no outerwear of its own: mostly dark, heavy colours. */
const STYLES: CoatStyle[] = ['quilted', 'quilted', 'puffer', 'parka', 'wool'];
const COLORS = ['#2b2523', '#3a2a26', '#1c1c20', '#232a3a', '#33382a', '#2e2e33', '#40302a', '#1f2a2e', '#4a2a2e', '#5a5046', '#6b5a3c'];

/** Stable number in 0..1 from a string (the same person always owns the same coat). */
function seed(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const shade = (color: string, l: number): THREE.Color => new THREE.Color(color).offsetHSL(0, 0, l);

/**
 * What this person wears outside: a long coat in the colour of their blazer or waistcoat if the look has one, else a
 * dark winter coat of their own.
 */
export function jacketOf(member: TeamMember): { style: CoatStyle; color: string } {
  const { look, id } = member;
  if (look.blazer) return { style: 'wool', color: look.blazer };
  if (look.vest) return { style: 'quilted', color: look.vest };
  return { style: STYLES[Math.floor(seed(id, 1) * STYLES.length)], color: COLORS[Math.floor(seed(id, 2) * COLORS.length)] };
}

/**
 * The person's coat draped over a hook of a coat stand: the origin is the hook, the coat faces +z (away from the
 * pole). A bulky long coat: collar / hood slumped over the hook, heavy body hanging almost to the floor, sleeves
 * dangling at the sides.
 */
export function buildJacket(member: TeamMember): THREE.Mesh {
  const { style, color } = jacketOf(member);
  const r = (n: number) => seed(member.id, n);
  const main = shade(color, 0);
  const dark = shade(color, -0.05);
  const seam = shade(color, -0.09);
  const light = shade(color, 0.06);
  const len = 1.0 + r(3) * 0.25; // hook to hem
  const w = 0.36 + r(7) * 0.06;
  const d = style === 'wool' ? 0.13 : 0.17;
  const parts: THREE.BufferGeometry[] = [];

  // collar / hood slumped over the hook, then the shoulders
  if (style === 'wool') parts.push(box(0.2, 0.1, 0.13, 0, -0.01, -0.01, dark));
  else parts.push(box(0.24, 0.17, 0.19, 0, -0.03, -0.01, dark));
  if (style === 'parka') parts.push(box(0.26, 0.045, 0.2, 0, 0.065, -0.005, '#b9ab94')); // fur trim
  parts.push(box(w * 0.8, 0.1, d, 0, -0.14, 0, main));
  // body: widens a little towards the hem, the lower half sags outwards
  const top = -0.18;
  const upper = (len - 0.18) * 0.45;
  const lower = len - 0.18 - upper;
  parts.push(box(w, upper, d, 0, top - upper / 2, 0, main));
  parts.push(box(w + 0.04, lower, d + 0.02, 0, top - upper - lower / 2, 0.01, main));
  // open front: a dark slit down the middle, one side hanging lower
  parts.push(box(0.025, len - 0.22, 0.012, (r(8) - 0.5) * 0.06, top - (len - 0.22) / 2, d / 2 + 0.012, seam));
  const drop = 0.03 + r(4) * 0.05;
  parts.push(box(w / 2 + 0.02, drop, d + 0.02, (r(9) < 0.5 ? -1 : 1) * (w / 4 + 0.01), -len - drop / 2, 0.01, main));
  // sleeves dangling at the sides
  const sl = 0.55 + r(10) * 0.1;
  for (const s of [-1, 1]) {
    parts.push(box(0.11, sl, 0.13, s * (w / 2 + 0.035), -0.2 - sl / 2, 0.01, dark, 0, s * 0.05));
    parts.push(box(0.115, 0.05, 0.135, s * (w / 2 + 0.035 + sl * 0.05), -0.2 - sl + 0.02, 0.01, seam)); // cuff
  }
  const front = d / 2 + 0.011;
  switch (style) {
    case 'quilted': {
      // quilting: a grid of seams over the whole coat
      for (let y = top - 0.1; y > -len + 0.05; y -= 0.11) parts.push(box(w + 0.05, 0.012, d + 0.035, 0, y, 0.005, seam));
      for (const s of [-1, 1]) for (const k of [0.33, 0.8]) parts.push(box(0.012, len - 0.24, 0.012, (s * k * w) / 2, top - (len - 0.24) / 2, front + 0.008, seam));
      break;
    }
    case 'puffer':
      // fat horizontal chambers
      for (let y = top - 0.14; y > -len + 0.06; y -= 0.16) parts.push(box(w + 0.05, 0.02, d + 0.035, 0, y, 0.005, seam));
      break;
    case 'parka':
      for (const s of [-1, 1]) parts.push(box(0.12, 0.11, 0.014, s * 0.11, -len + 0.3, front + 0.012, dark)); // pockets
      parts.push(box(w + 0.045, 0.02, d + 0.03, 0, top - upper, 0.005, seam)); // drawstring waist
      break;
    case 'wool':
      for (const s of [-1, 1]) parts.push(box(0.06, 0.26, 0.014, s * 0.06, top - 0.1, front, light, 0, s * 0.2)); // lapels
      break;
  }

  const mesh = new THREE.Mesh(merge(parts), propMaterial);
  mesh.castShadow = true;
  // it never hangs straight: turned and tilted a little, each one differently
  mesh.rotation.set(-0.02 - r(11) * 0.03, (r(5) - 0.5) * 0.5, (r(6) - 0.5) * 0.1);
  return mesh;
}
