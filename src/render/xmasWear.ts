import * as THREE from 'three';
import { box, merge, propMaterial } from './geo';

/** Christmas mode: every character / pet carries accessories that are only shown while the mode is on. */
let on = false;
const wardrobe = new Set<WeakRef<THREE.Object3D>>();

/** Shows / hides every accessory ever built (and the ones built from now on). */
export function setChristmasWear(value: boolean): void {
  on = value;
  for (const ref of wardrobe) {
    const o = ref.deref();
    if (o) o.visible = on;
    else wardrobe.delete(ref);
  }
}

function track(group: THREE.Group): THREE.Group {
  group.visible = on;
  wardrobe.add(new WeakRef(group));
  return group;
}

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

const RED = '#c8202b';
const WHITE = '#f7f4ee';
const GREEN = '#2f7d3a';
const GOLD = '#f2c230';
const BROWN = '#6b4a2e';

/** Blocky santa hat, base centred on the origin, tip slumping backwards (character facing +z). */
function santaHat(): THREE.BufferGeometry[] {
  return [
    box(0.42, 0.08, 0.42, 0, 0, 0, WHITE),
    box(0.38, 0.1, 0.38, 0, 0.09, -0.01, RED),
    box(0.3, 0.1, 0.3, 0, 0.19, -0.04, RED),
    box(0.22, 0.1, 0.22, 0, 0.28, -0.09, RED),
    box(0.15, 0.09, 0.15, 0, 0.33, -0.16, RED),
    box(0.09, 0.09, 0.09, 0, 0.3, -0.22, WHITE),
  ];
}

function elfHat(): THREE.BufferGeometry[] {
  return [
    box(0.4, 0.07, 0.4, 0, 0, 0, RED),
    box(0.36, 0.1, 0.36, 0, 0.085, 0, GREEN),
    box(0.28, 0.1, 0.28, 0, 0.185, -0.01, GREEN),
    box(0.2, 0.1, 0.2, 0, 0.285, -0.02, GREEN),
    box(0.12, 0.1, 0.12, 0, 0.385, -0.03, GREEN),
    box(0.06, 0.06, 0.06, 0, 0.45, -0.03, GOLD),
    box(0.4, 0.02, 0.05, 0, 0.0, 0.2, GOLD),
  ];
}

function antlers(): THREE.BufferGeometry[] {
  const p: THREE.BufferGeometry[] = [box(0.4, 0.04, 0.1, 0, 0, 0, '#2a2a30')]; // head band
  for (const s of [-1, 1]) {
    p.push(box(0.04, 0.2, 0.04, s * 0.15, 0.12, 0, BROWN));
    p.push(box(0.04, 0.04, 0.12, s * 0.15, 0.17, 0.05, BROWN));
    p.push(box(0.04, 0.12, 0.04, s * 0.2, 0.26, 0, BROWN));
    p.push(box(0.04, 0.1, 0.04, s * 0.12, 0.27, 0, BROWN));
  }
  return p;
}

function scarf(build: number, color: string, stripe: string): THREE.BufferGeometry[] {
  const w = 0.3 * Math.max(1, build);
  return [
    box(w, 0.1, 0.32, 0, 1.41, 0, color),
    box(w + 0.01, 0.025, 0.325, 0, 1.43, 0, stripe),
    box(w + 0.01, 0.025, 0.325, 0, 1.38, 0, stripe),
    box(0.09, 0.3, 0.03, 0.09, 1.25, 0.165, color),
    box(0.092, 0.03, 0.032, 0.09, 1.17, 0.165, stripe),
    box(0.092, 0.03, 0.032, 0.09, 1.11, 0.165, stripe),
  ];
}

export interface WearLook {
  top: string;
  hair: string;
  cap?: string;
  style: string;
  build?: number;
}

/** A person's christmas accessories (hat variety by look, plus a scarf). Hidden unless the mode is on. */
export function buildPersonWear(look: WearLook): THREE.Group {
  const g = new THREE.Group();
  const seed = [...(look.top + look.hair)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const variant = seed % 4; // 0 santa, 1 elf, 2 antlers, 3 santa
  let y = 1.77;
  if (look.cap) y = 1.85;
  else if (look.style === 'quiff') y = 1.8;
  else if (look.style === 'curly') y = 1.83;
  const head = variant === 1 ? elfHat() : variant === 2 ? antlers() : santaHat();
  const hat = mesh(head);
  hat.position.y = y;
  if (look.style === 'bun' || look.style === 'manbun') hat.position.y += 0.02;
  g.add(hat);
  const scarfColors: Array<[string, string]> = [[RED, WHITE], [GREEN, RED], ['#2c5fa8', WHITE], [WHITE, RED]];
  const [c, s] = scarfColors[(seed >> 2) % scarfColors.length];
  g.add(mesh(scarf(look.build ?? 1, c, s)));
  return track(g);
}

/** Tiny santa hat for a pet's head. `at` = centre of the top of the head. */
export function buildPetWear(scale: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  const hat = mesh(santaHat());
  hat.scale.setScalar(scale);
  hat.position.set(0, y, z);
  hat.rotation.x = -0.2;
  g.add(hat);
  return track(g);
}
