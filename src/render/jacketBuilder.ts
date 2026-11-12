import * as THREE from 'three';
import type { TeamMember } from '../data/types';
import { box, merge, propMaterial } from './geo';

export type JacketStyle = 'blazer' | 'vest' | 'parka' | 'puffer' | 'bomber' | 'denim' | 'rain';

interface Cut {
  /** collar to hem (m) */
  length: number;
  hood?: boolean;
  sleeves?: boolean;
}

const CUTS: Record<JacketStyle, Cut> = {
  blazer: { length: 0.64, sleeves: true },
  vest: { length: 0.52 },
  parka: { length: 0.82, hood: true, sleeves: true },
  puffer: { length: 0.6, hood: true, sleeves: true },
  bomber: { length: 0.5, sleeves: true },
  denim: { length: 0.52, sleeves: true },
  rain: { length: 0.72, hood: true, sleeves: true },
};

/** Jackets of people whose look has no outerwear of its own: style + colours to pick from. */
const STREET: Array<{ style: JacketStyle; colors: string[] }> = [
  { style: 'parka', colors: ['#5a6b3c', '#2f3a4f', '#8a6a3c', '#3a3d42'] },
  { style: 'puffer', colors: ['#1f1f24', '#8a2f2f', '#3f6f8f', '#d9d2c4', '#4a7d5a'] },
  { style: 'bomber', colors: ['#4a5a3a', '#1f1f24', '#6e1f2e', '#27375e'] },
  { style: 'denim', colors: ['#5f86b8', '#2c3f66', '#8fb0d8'] },
  { style: 'rain', colors: ['#e0b13a', '#d86f2f', '#c8323a', '#2f8f8a'] },
];

/** Stable number in 0..1 from a string (the same person always owns the same jacket). */
function seed(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

const shade = (color: string, l: number): THREE.Color => new THREE.Color(color).offsetHSL(0, 0, l);

/** What this person wears outside: their blazer or waistcoat if the look has one, else a street jacket of their own. */
export function jacketOf(member: TeamMember): { style: JacketStyle; color: string } {
  const { look, id } = member;
  if (look.blazer) return { style: 'blazer', color: look.blazer };
  if (look.vest) return { style: 'vest', color: look.vest };
  const kind = STREET[Math.floor(seed(id, 1) * STREET.length)];
  return { style: kind.style, color: kind.colors[Math.floor(seed(id, 2) * kind.colors.length)] };
}

/**
 * The person's jacket hanging on a peg by its collar loop: the origin is the hang point, the jacket faces +z (away
 * from the wall). Collar bunched up at the peg, shoulders drooping, front open, sleeves dangling.
 */
export function buildJacket(member: TeamMember): THREE.Mesh {
  const { style, color } = jacketOf(member);
  const cut = CUTS[style];
  const r = (n: number) => seed(member.id, n);
  const main = shade(color, 0);
  const dark = shade(color, -0.08);
  const light = shade(color, 0.07);
  const lining = shade(color, -0.2);
  const len = cut.length * (0.94 + r(3) * 0.12);
  const w = 0.25;
  const parts: THREE.BufferGeometry[] = [];

  // collar on the peg, then the shoulders sagging to the full width
  parts.push(box(0.12, 0.07, 0.1, 0, -0.025, 0, dark));
  parts.push(box(0.18, 0.07, 0.11, 0, -0.085, 0, main));
  parts.push(box(0.23, 0.07, 0.115, 0, -0.15, 0, main));
  // back + the two front panels with the lining showing in the gap
  const bodyTop = -0.18;
  const bodyH = len - 0.18;
  const mid = bodyTop - bodyH / 2;
  parts.push(box(w, bodyH, 0.07, 0, mid, -0.02, lining));
  for (const s of [-1, 1]) {
    // one side hangs a little lower (it never hangs straight)
    const drop = s > 0 ? r(4) * 0.04 : 0;
    parts.push(box(w / 2 - 0.012, bodyH + drop, 0.06, s * (w / 4 + 0.006), mid - drop / 2, 0.035, main));
  }
  if (cut.sleeves) {
    const sl = len * 0.8;
    for (const s of [-1, 1]) {
      parts.push(box(0.065, sl, 0.085, s * (w / 2 + 0.03), -0.13 - sl / 2, 0, dark, 0, s * 0.07));
      if (style === 'bomber') parts.push(box(0.07, 0.05, 0.09, s * (w / 2 + 0.03 + sl * 0.07), -0.13 - sl + 0.02, 0, lining));
    }
  }
  if (cut.hood) {
    parts.push(box(0.21, 0.13, 0.15, 0, -0.07, 0.005, dark));
    if (style === 'parka') parts.push(box(0.22, 0.035, 0.16, 0, -0.005, 0.01, '#d8cdb8')); // fur trim
  }
  switch (style) {
    case 'puffer':
      // quilting seams
      for (let y = bodyTop - 0.1; y > bodyTop - bodyH + 0.04; y -= 0.11) parts.push(box(w + 0.006, 0.014, 0.135, 0, y, 0.005, dark));
      break;
    case 'bomber':
      parts.push(box(w + 0.004, 0.05, 0.135, 0, bodyTop - bodyH + 0.025, 0.005, lining)); // rib hem
      break;
    case 'blazer':
      // lapels
      for (const s of [-1, 1]) parts.push(box(0.045, 0.2, 0.012, s * 0.04, bodyTop - 0.09, 0.071, light, 0, s * 0.18));
      break;
    case 'denim':
      parts.push(box(0.16, 0.035, 0.115, 0, -0.045, 0.004, light)); // collar
      for (const s of [-1, 1]) parts.push(box(0.07, 0.06, 0.012, s * 0.065, bodyTop - 0.1, 0.071, light)); // chest pockets
      break;
    case 'rain':
      for (const s of [-1, 1]) parts.push(box(0.012, bodyH, 0.012, s * 0.016, mid, 0.07, '#f2efe6')); // zip tape
      break;
    case 'parka':
      for (const s of [-1, 1]) parts.push(box(0.08, 0.07, 0.012, s * 0.065, bodyTop - bodyH + 0.16, 0.071, dark)); // pockets
      break;
    case 'vest':
      break;
  }

  const mesh = new THREE.Mesh(merge(parts), propMaterial);
  mesh.castShadow = true;
  // it hangs a little askew, each one differently
  mesh.rotation.set(0, (r(5) - 0.5) * 0.3, (r(6) - 0.5) * 0.09);
  return mesh;
}
