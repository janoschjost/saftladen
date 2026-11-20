import * as THREE from 'three';
import type { Look } from '../data/types';
import { tattooOverlay, type TattooKind } from './tattoo';
import { box, frame, merge, propMaterial } from './geo';
import { buildPersonWear } from './xmasWear';

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group; // bobbing group (head, torso, arms)
  legL: THREE.Object3D; // hip pivot
  legR: THREE.Object3D;
  kneeL: THREE.Object3D; // knee pivot (child of the hip pivot)
  kneeR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  /** elbow pivots (children of the arm pivots), bend with negative x */
  elbowL: THREE.Object3D;
  elbowR: THREE.Object3D;
  headHeight: number;
  /** 0 = fresh .. 1 = exhausted: heavy eyelids and dark eye bags */
  setTired: (amount: number) => void;
  /** only on `moody` looks: true = very happy face, false = very serious */
  setMood?: (happy: boolean) => void;
  /** only on `vape` looks: the bendable forearm of the right arm, the glowing tip and the vapour puffs */
  vape?: { elbow: THREE.Object3D; device: THREE.Object3D; led: THREE.MeshBasicMaterial; puffs: THREE.Mesh[] };
  /** only on smokers (`addCigarette`, smokeProps.ts): the cigarette in the right hand (shown while lit), its glowing tip and the exhaled puffs */
  cigarette?: { stick: THREE.Object3D; ember: THREE.MeshBasicMaterial; puffs: THREE.Mesh[] };
  /** the person's own umbrella (`addUmbrella`, smokeProps.ts): in the left hand, open while outdoors in the rain; `canopy` folds shut */
  umbrella?: { root: THREE.Object3D; canopy: THREE.Object3D };
  /** only on `phone` looks: the bendable forearm of the right arm and the phone in its hand (shown during calls) */
  phone?: { elbow: THREE.Object3D; device: THREE.Object3D };
  /** only on `nerf` looks: the foam dart gun in the right fist (shown while aiming; held forward it points along the forearm) */
  gun?: THREE.Object3D;
  /** everybody's phone, in the right fist (hidden until they take a call); `phone` looks use the same one */
  handset: THREE.Object3D;
  /** coffee cup in the left hand (hidden until a coffee break), kept upright by the game while the arm moves */
  cup: THREE.Object3D;
  /** bag of chips in the left hand (hidden until a snack run), kept upright like the cup */
  chips: THREE.Object3D;
  /** the chip on its way from the bag to the mouth (right hand) */
  chip: THREE.Object3D;
  /** handheld console held in both hands in front of the chest (hidden until a day task plays it); `screen` is its lit display */
  gameboy: THREE.Object3D;
  gameboyScreen: THREE.MeshBasicMaterial;
  /** camera held up to the face in both hands, lens forward (hidden until a photo shoot); `flash` is its flash head and the glow around it */
  camera: THREE.Object3D;
  cameraFlash: { head: THREE.MeshBasicMaterial; glow: THREE.Mesh };
  /** the person's own look, one group per bone; an alter ego (see kurtBuilder.ts) hides them and shows its own */
  skin: THREE.Object3D[];
  /** only with an alter-ego skin added: shows it (true) or the person's own look (false) */
  setAlter?: (on: boolean) => void;
  /** only with an alter-ego skin added: the tail, swayed while walking */
  tail?: THREE.Object3D;
}

/** A scale of 1 is this tall; `heightM` on a Look is converted relative to it. */
const REF_HEIGHT_M = 1.75;
const EYE = '#1b1b22';
const SHOE_DARK = '#2a2d34';
const SHOE_LIGHT = '#ececea';

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  return m;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function mix(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function hairParts(look: Look): THREE.BufferGeometry[] {
  const c = look.hair;
  const p: THREE.BufferGeometry[] = [];
  const top = (w = 0.4, h = 0.08, d = 0.4, y = 1.78) => p.push(box(w, h, d, 0, y, 0, c));
  const back = (h: number, y: number) => p.push(box(0.4, h, 0.08, 0, y, -0.17, c));
  const sides = (h: number, y: number, d = 0.3, x = 0.2) => {
    p.push(box(0.05, h, d, -x, y, -0.02, c));
    p.push(box(0.05, h, d, x, y, -0.02, c));
    if (look.sideColor) {
      // greying temples
      p.push(box(0.056, h * 0.7, 0.1, -x, y - h * 0.1, 0.1, look.sideColor));
      p.push(box(0.056, h * 0.7, 0.1, x, y - h * 0.1, 0.1, look.sideColor));
    }
  };

  switch (look.style) {
    case 'none':
      break;
    case 'buzz': {
      // close-cropped: thin shells hugging the skull
      if (!look.cap) p.push(box(0.4, 0.03, 0.4, 0, 1.76, 0, c));
      p.push(box(0.4, 0.26, 0.03, 0, 1.64, -0.19, c));
      p.push(box(0.02, 0.12, 0.3, -0.2, 1.69, -0.02, c));
      p.push(box(0.02, 0.12, 0.3, 0.2, 1.69, -0.02, c));
      break;
    }
    case 'short':
      if (!look.cap) top();
      back(0.3, 1.62);
      sides(0.14, 1.68);
      break;
    case 'quiff':
      top();
      back(0.3, 1.62);
      sides(0.14, 1.68);
      p.push(box(0.3, 0.1, 0.16, 0, 1.86, 0.1, c));
      break;
    case 'long':
      top();
      back(0.62, 1.45);
      sides(0.5, 1.5, 0.22, 0.215);
      break;
    case 'bob':
      top();
      back(0.38, 1.57);
      sides(0.32, 1.6, 0.26, 0.215);
      break;
    case 'bun':
      top();
      back(0.3, 1.62);
      sides(0.14, 1.68);
      p.push(box(0.16, 0.16, 0.16, 0, 1.88, -0.05, c)); // overlaps the top hair so it sits on the head
      break;
    case 'manbun':
      top();
      back(0.3, 1.62);
      sides(0.14, 1.68);
      p.push(box(0.2, 0.2, 0.2, 0, 1.73, -0.29, c)); // the bun, low on the back of the head
      p.push(box(0.14, 0.14, 0.04, 0, 1.73, -0.215, mix(c, '#000000', 0.45))); // hair tie
      break;
    case 'pony':
      top();
      back(0.3, 1.62);
      sides(0.14, 1.68);
      p.push(box(0.1, 0.34, 0.1, 0, 1.52, -0.26, c));
      break;
    case 'curly':
      top(0.44, 0.14, 0.44, 1.8);
      back(0.26, 1.64);
      sides(0.2, 1.68, 0.36, 0.22);
      break;
  }
  if (look.bangs) p.push(box(0.38, 0.1, 0.05, 0, 1.72, 0.2, c));
  return p;
}

/** Lettering on the shirt front: a canvas texture on a thin plane just in front of the chest. */
function chestPrint(text: string, color: string, build: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 96;
  do g.font = `800 ${size}px "Avenir Next", "Helvetica Neue", Arial, sans-serif`;
  while (g.measureText(text).width > c.width * 0.92 && (size -= 4) > 20);
  g.fillText(text, c.width / 2, c.height / 2 + 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const w = 0.36 * build;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
  m.position.set(0, 1.2, 0.132);
  return m;
}

/** A pixel star (5 wide, 4 tall) of gold blocks across the front of the cap's crown. */
function starBadge(gold: string): THREE.BufferGeometry[] {
  const rows = ['..X..', 'XXXXX', '.XXX.', '.X.X.'];
  const cell = 0.026;
  const out: THREE.BufferGeometry[] = [];
  rows.forEach((row, r) => {
    [...row].forEach((c, i) => {
      if (c === 'X') out.push(box(cell, cell, 0.02, (i - 2) * cell, 1.8 + (1.5 - r) * cell, 0.21, gold));
    });
  });
  return out;
}

/** Police cap: dark crown with a band, wider flat top, black visor and a gold star badge on the front. Sits on the 0.36 m head, so it follows every pose. */
function policeCap(): THREE.BufferGeometry[] {
  const navy = '#1c2540';
  const gold = '#e6b830';
  return [
    box(0.4, 0.1, 0.4, 0, 1.8, 0, navy), // crown
    box(0.42, 0.05, 0.42, 0, 1.755, 0, '#10162a'), // band
    box(0.46, 0.035, 0.46, 0, 1.87, 0.01, navy), // wide flat top
    box(0.3, 0.025, 0.14, 0, 1.745, 0.27, '#0b0b0e'), // visor
    ...starBadge(gold),
  ];
}

export function buildCharacter(look: Look): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  // the look goes into one group per bone, so an alter ego can swap it out and keep every prop and pose
  const skinGroups: THREE.Object3D[] = [];
  const skinOf = (bone: THREE.Object3D): THREE.Group => {
    const g = new THREE.Group();
    bone.add(g);
    skinGroups.push(g);
    return g;
  };
  const bodySkin = skinOf(body);

  const build = look.build ?? 1;
  const skin = look.skin;
  const sleeveColor = look.sleeve ?? look.blazer ?? look.top; // vest keeps the shirt's sleeves
  const ar = look.strong ? 1.3 : 1; // arm thickness

  // ---- torso + head + hair + face (one merged mesh)
  const torso: THREE.BufferGeometry[] = [];
  torso.push(box(0.46 * build, 0.6, 0.26, 0, 1.1, 0, look.top));
  if (look.tank) {
    // bare shoulders either side of the straps, scoop neckline front and back
    for (const sx of [-1, 1]) torso.push(box(0.12 * build, 0.035, 0.265, sx * 0.17 * build, 1.385, 0, skin));
    torso.push(box(0.14, 0.09, 0.265, 0, 1.36, 0, skin));
  }
  if (look.blazer) {
    const lapel = mix(look.blazer, '#000000', 0.25);
    torso.push(box(0.5 * build, 0.64, 0.29, 0, 1.09, 0, look.blazer));
    torso.push(box(0.1, 0.36, 0.02, 0, 1.21, 0.146, look.top)); // shirt showing in the V
    torso.push(box(0.06, 0.34, 0.025, -0.08, 1.22, 0.15, lapel));
    torso.push(box(0.06, 0.34, 0.025, 0.08, 1.22, 0.15, lapel));
    torso.push(box(0.03, 0.03, 0.02, 0, 0.98, 0.15, lapel)); // button
  }
  if (look.vest) {
    const vd = mix(look.vest, '#000000', 0.25);
    torso.push(box(0.5 * build, 0.56, 0.29, 0, 1.12, 0, look.vest));
    torso.push(box(0.13, 0.34, 0.02, 0, 1.22, 0.146, look.top)); // shirt showing in the V
    torso.push(box(0.05, 0.34, 0.025, -0.085, 1.22, 0.15, vd));
    torso.push(box(0.05, 0.34, 0.025, 0.085, 1.22, 0.15, vd));
    for (const y of [1.0, 0.9, 0.8]) torso.push(box(0.025, 0.025, 0.02, 0, y, 0.15, vd)); // buttons
  }
  if (look.buttonShirt) {
    const dark = mix(look.top, '#000000', 0.18);
    torso.push(box(0.1, 0.06, 0.03, -0.06, 1.39, 0.12, mix(look.top, '#ffffff', 0.15))); // collar
    torso.push(box(0.1, 0.06, 0.03, 0.06, 1.39, 0.12, mix(look.top, '#ffffff', 0.15)));
    torso.push(box(0.03, 0.58, 0.012, 0, 1.1, 0.133, dark)); // placket
    for (const y of [1.3, 1.18, 1.06, 0.94]) torso.push(box(0.02, 0.02, 0.016, 0, y, 0.135, '#e8e8e8'));
    torso.push(box(0.12, 0.12, 0.012, -0.12, 1.25, 0.133, dark)); // chest pockets
    torso.push(box(0.12, 0.12, 0.012, 0.12, 1.25, 0.133, dark));
  }
  if (look.logo) {
    // small, simple tree on the wearer's left chest
    const [lx, ly, lz] = [0.1, 1.27, 0.133];
    torso.push(box(0.1, 0.022, 0.012, lx, ly - 0.02, lz, look.logo));
    torso.push(box(0.07, 0.022, 0.012, lx, ly, lz, look.logo));
    torso.push(box(0.04, 0.022, 0.012, lx, ly + 0.02, lz, look.logo));
    torso.push(box(0.018, 0.035, 0.012, lx, ly - 0.05, lz, look.logo));
  }
  if (look.flowers) {
    const spots: Array<[number, number]> = [[-0.14, 1.3], [0.05, 1.27], [0.15, 1.12], [-0.06, 1.12], [-0.15, 0.96], [0.08, 0.93], [-0.1, 0.86]];
    spots.forEach(([x, y], i) => {
      const col = look.flowers![i % look.flowers!.length];
      for (const [z, dir] of [[0.135, 1], [-0.135, -1]] as const) {
        const fx = x * dir;
        torso.push(box(0.075, 0.03, 0.012, fx, y, z, col));
        torso.push(box(0.03, 0.075, 0.012, fx, y, z, col));
        torso.push(box(0.03, 0.03, 0.016, fx, y, z * 1.04, '#f4e27a'));
      }
    });
  }
  torso.push(box(0.2, 0.06, 0.2, 0, 1.43, 0, skin)); // neck
  torso.push(box(0.36, 0.36, 0.36, 0, 1.58, 0, skin)); // head
  torso.push(...hairParts(look));

  // eyes
  const narrow = look.eyes === 'narrow';
  torso.push(box(narrow ? 0.06 : 0.05, narrow ? 0.03 : 0.06, 0.02, -0.09, 1.6, 0.185, EYE));
  torso.push(box(narrow ? 0.06 : 0.05, narrow ? 0.03 : 0.06, 0.02, 0.09, 1.6, 0.185, EYE));
  if (look.eyebrows) {
    const thick = look.eyebrows === 'thick';
    const browColor = mix(look.hair, '#000000', 0.35);
    const by = look.glasses ? 1.69 : 1.675;
    torso.push(box(thick ? 0.12 : 0.1, thick ? 0.04 : 0.025, 0.02, -0.09, by, 0.185, browColor));
    torso.push(box(thick ? 0.12 : 0.1, thick ? 0.04 : 0.025, 0.02, 0.09, by, 0.185, browColor));
  }
  // mouth (moody looks get two swappable faces instead, see below)
  const lip = '#b0605a';
  if (look.moody) {
    // handled by the mood meshes
  } else if (look.mouth === 'full') {
    torso.push(box(0.15, 0.045, 0.025, 0, 1.495, 0.19, '#b8485a'));
  } else if (look.smile) {
    torso.push(box(0.1, 0.022, 0.02, 0, 1.495, 0.185, lip));
    torso.push(box(0.03, 0.03, 0.02, -0.065, 1.515, 0.185, lip));
    torso.push(box(0.03, 0.03, 0.02, 0.065, 1.515, 0.185, lip));
  } else if (look.beard !== 'full') {
    torso.push(box(0.1, 0.022, 0.02, 0, 1.5, 0.185, lip));
  }

  // beard
  const bc = look.beardColor ?? look.hair;
  if (look.beard === 'full') {
    torso.push(box(0.38, 0.15, 0.06, 0, 1.47, 0.17, bc));
    torso.push(box(0.04, 0.15, 0.22, -0.19, 1.48, 0.07, bc));
    torso.push(box(0.04, 0.15, 0.22, 0.19, 1.48, 0.07, bc));
    torso.push(box(0.1, 0.022, 0.02, 0, 1.5, 0.205, '#b0605a'));
  } else if (look.beard === 'mustache' || look.beard === 'goatee' || look.beard === 'trimmed') {
    torso.push(box(0.18, 0.04, 0.03, 0, 1.53, 0.195, bc)); // moustache
    if (look.beard === 'goatee') torso.push(box(0.1, 0.09, 0.04, 0, 1.44, 0.19, bc)); // chin beard
    if (look.beard === 'trimmed') {
      torso.push(box(0.19, 0.08, 0.04, 0, 1.445, 0.19, bc)); // chin
      torso.push(box(0.03, 0.07, 0.1, -0.182, 1.455, 0.12, bc)); // a thin line along the jaw, both sides
      torso.push(box(0.03, 0.07, 0.1, 0.182, 1.455, 0.12, bc));
    }
  } else if (look.beard === 'stubble') {
    torso.push(box(0.37, 0.13, 0.02, 0, 1.46, 0.18, mix(skin, bc, 0.4)));
  }

  // necklace (bead string in a V on the chest)
  if (look.necklace) {
    const beads: Array<[number, number]> = [[-0.1, 1.385], [-0.075, 1.35], [-0.045, 1.32], [0, 1.3], [0.045, 1.32], [0.075, 1.35], [0.1, 1.385]];
    beads.forEach(([x, y], i) => torso.push(box(0.035, 0.035, 0.03, x, y, 0.14, look.necklace![i % look.necklace!.length])));
  }

  // scout neckerchief: rolled to a tube that lies round the neck and hangs down the chest in a V to a knot below the
  // throat, the border wound round it as a spiral stripe, two short tails below the knot
  if (look.neckerchief) {
    const { body, edge } = look.neckerchief;
    /** one piece of the tube from a to b (x/y in the chest plane, z the depth), with a slanted slab of the border across it */
    const piece = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
      const len = Math.hypot(bx - ax, by - ay);
      for (const g of [box(len + 0.015, 0.065, 0.065, 0, 0, 0, body), box(0.028, 0.07, 0.07, 0, 0, 0, edge, 0, 0.7)]) {
        g.rotateZ(Math.atan2(by - ay, bx - ax));
        g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
        torso.push(g);
      }
    };
    // behind and beside the neck: a ring of short pieces
    const SEG = 10;
    for (let i = 0; i < SEG; i++) {
      const a = Math.PI * (0.45 + (i / (SEG - 1)) * 1.1);
      const g = [box(0.115, 0.065, 0.065, 0, 0, 0, body), box(0.028, 0.07, 0.07, 0, 0, 0, edge, 0, 0.7)];
      for (const m of g) {
        m.rotateY(a);
        m.translate(Math.sin(a) * 0.17, 1.375, Math.cos(a) * 0.145);
        torso.push(m);
      }
    }
    // the two ends hang down the chest from either side of the neck
    for (const side of [-1, 1]) {
      const from = { x: side * 0.15, y: 1.37 };
      const to = { x: side * 0.03, y: 1.21 };
      for (let k = 0; k < 4; k++) {
        const t0 = k / 4;
        const t1 = (k + 1) / 4;
        piece(from.x + (to.x - from.x) * t0, from.y + (to.y - from.y) * t0, 0.115 + 0.06 * t0, from.x + (to.x - from.x) * t1, from.y + (to.y - from.y) * t1, 0.115 + 0.06 * t1);
      }
    }
    torso.push(box(0.1, 0.085, 0.08, 0, 1.2, 0.185, body)); // the knot
    torso.push(box(0.022, 0.088, 0.082, 0, 1.2, 0.185, edge));
    torso.push(box(0.055, 0.15, 0.028, -0.045, 1.115, 0.2, body, 0, 0.25)); // the two tails
    torso.push(box(0.055, 0.15, 0.028, 0.045, 1.115, 0.2, edge, 0, -0.25));
    torso.push(box(0.055, 0.05, 0.03, -0.055, 1.05, 0.201, edge, 0, 0.25));
    torso.push(box(0.055, 0.05, 0.03, 0.055, 1.05, 0.201, body, 0, -0.25));
  }

  // glasses
  if (look.glasses) {
    const fc = typeof look.glasses === 'string' ? look.glasses : '#1c1c22';
    const ft = look.thinGlasses ? 0.01 : 0.018;
    torso.push(...frame(0.14, 0.11, ft, -0.09, 1.6, 0.2, fc));
    torso.push(...frame(0.14, 0.11, ft, 0.09, 1.6, 0.2, fc));
    torso.push(box(0.05, ft, ft, 0, 1.62, 0.2, fc));
  }

  // cap
  if (look.cap) {
    torso.push(box(0.42, 0.12, 0.42, 0, 1.79, 0, look.cap));
    torso.push(box(0.3, 0.025, 0.2, 0, 1.75, look.capBack ? -0.3 : 0.3, look.cap));
  }
  if (look.policeCap) torso.push(...policeCap());
  const torsoMesh = mesh(torso);
  bodySkin.add(torsoMesh);
  bodySkin.add(buildPersonWear(look)); // christmas hat + scarf (hidden unless christmas mode is on)
  if (look.print) bodySkin.add(chestPrint(look.print.text, look.print.color, build));

  // tired face: dark bags under the eyes, eyelids that sag over the top of the eyes
  const skinDark = mix(skin, '#4a3040', 0.28);
  const bagMat = propMaterial.clone();
  bagMat.transparent = true;
  bagMat.opacity = 0;
  const bags = new THREE.Mesh(
    merge([box(0.075, 0.022, 0.012, -0.09, 1.552, 0.19, mix(skin, '#5b3f6a', 0.55)), box(0.075, 0.022, 0.012, 0.09, 1.552, 0.19, mix(skin, '#5b3f6a', 0.55))]),
    bagMat,
  );
  bags.visible = false;
  bodySkin.add(bags);
  const lids = [-0.09, 0.09].map((x) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 1.632, 0.206);
    const m = new THREE.Mesh(merge([box(0.082, 0.036, 0.012, 0, -0.018, 0, skinDark)]), propMaterial);
    pivot.add(m);
    pivot.visible = false;
    bodySkin.add(pivot);
    return pivot;
  });
  const setTired = (amount: number) => {
    const t = clamp01(amount);
    bags.visible = t > 0.12;
    bagMat.opacity = clamp01((t - 0.1) * 1.3);
    for (const l of lids) {
      l.visible = t > 0.08;
      l.scale.y = Math.max(0.01, t);
    }
  };

  // two faces for moody looks: very happy (wide open smile, raised brows) and very serious (flat mouth, low heavy brows)
  let setMood: CharacterRig['setMood'];
  if (look.moody) {
    const brow = mix(look.hair, '#000000', 0.35);
    const by = look.glasses ? 1.69 : 1.675;
    const happy: THREE.BufferGeometry[] = [
      box(0.16, 0.05, 0.02, 0, 1.505, 0.19, '#7a2f36'), // open mouth
      box(0.12, 0.02, 0.022, 0, 1.52, 0.19, '#f6f2ea'), // teeth
      box(0.04, 0.04, 0.02, -0.1, 1.53, 0.19, lip), // cheeks pushed up
      box(0.04, 0.04, 0.02, 0.1, 1.53, 0.19, lip),
      box(0.1, 0.025, 0.02, -0.09, by + 0.03, 0.185, brow), // raised brows
      box(0.1, 0.025, 0.02, 0.09, by + 0.03, 0.185, brow),
    ];
    const serious: THREE.BufferGeometry[] = [
      box(0.1, 0.02, 0.02, 0, 1.49, 0.19, '#7a4a46'), // tight flat mouth
      box(0.04, 0.025, 0.02, -0.07, 1.475, 0.19, '#7a4a46'), // slight downturn
      box(0.04, 0.025, 0.02, 0.07, 1.475, 0.19, '#7a4a46'),
      box(0.13, 0.045, 0.02, -0.085, by - 0.005, 0.19, brow), // low heavy brows
      box(0.13, 0.045, 0.02, 0.085, by - 0.005, 0.19, brow),
    ];
    const happyMesh = mesh(happy);
    const seriousMesh = mesh(serious);
    bodySkin.add(happyMesh, seriousMesh);
    setMood = (isHappy) => {
      happyMesh.visible = isHappy;
      seriousMesh.visible = !isHappy;
    };
    setMood(true);
  }

  // ---- arms: upper arm on a shoulder pivot, forearm on an elbow pivot 0.3 below (bends forward with negative x)
  const armLen = look.tank ? 0 : look.tee ? 0.26 : 0.46; // sleeve length, the rest down to 0.6 is skin
  const ELBOW = 0.3;
  const mkArm = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (0.23 * build + 0.085 + (ar - 1) * 0.07), 1.4, 0);
    const upper: THREE.BufferGeometry[] = [];
    const fore: THREE.BufferGeometry[] = []; // origin = elbow
    /** A box spanning d0..d1 below the shoulder, split at the elbow. */
    const span = (d0: number, d1: number, w: number, d: number, c: string) => {
      if (d1 <= d0) return;
      if (d0 < ELBOW) upper.push(box(w, Math.min(d1, ELBOW) - d0, d, 0, -(d0 + Math.min(d1, ELBOW)) / 2, 0, c));
      if (d1 > ELBOW) fore.push(box(w, d1 - Math.max(d0, ELBOW), d, 0, -((Math.max(d0, ELBOW) + d1) / 2 - ELBOW), 0, c));
    };
    span(0, armLen, 0.14 * ar, 0.16 * ar, sleeveColor);
    span(armLen, 0.6, 0.115 * ar, 0.13 * ar, skin);
    // anatomical left arm is +x because the character faces +z
    let tattoo: TattooKind | null = null;
    if (look.tattoo === 'both' || (look.tattoo === 'left' && side === 1) || (look.tattoo === 'right' && side === -1)) {
      tattoo = look.tattooDark ? 'dark' : look.tattoo === 'both' ? 'script' : 'vine';
    }
    if (look.wristbands && side === -1) look.wristbands.forEach((col, i) => span(0.563 - i * 0.03, 0.587 - i * 0.03, 0.125 * ar, 0.14 * ar, col));
    skinOf(pivot).add(mesh(upper));
    const elbow = new THREE.Group();
    elbow.position.y = -ELBOW;
    const foreSkin = skinOf(elbow);
    foreSkin.add(mesh(fore));
    if (tattoo) {
      // on the bare forearm below the elbow, so it bends along
      const len = 0.6 - Math.max(armLen, ELBOW);
      const ov = tattooOverlay(0.115 * ar, len, 0.13 * ar, side, tattoo);
      ov.position.y = -(0.6 - len / 2 - ELBOW);
      foreSkin.add(ov);
    }
    pivot.add(elbow);
    body.add(pivot);
    return { pivot, elbow };
  };
  const { pivot: armL, elbow: elbowL } = mkArm(-1);
  const cup = new THREE.Group();
  cup.position.y = -0.58;
  cup.visible = false;
  cup.add(
    mesh([
      box(0.13, 0.14, 0.13, 0, 0, 0, '#e8553d'), // mug, bold colour so it reads against skin and sleeves
      box(0.138, 0.02, 0.138, 0, 0.07, 0, '#fff6e8'), // pale rim
      box(0.1, 0.008, 0.1, 0, 0.078, 0, '#3b2415'), // coffee
      box(0.03, 0.09, 0.06, -0.085, 0, 0, '#e8553d'), // handle
      box(0.012, 0.05, 0.012, 0.02, 0.12, 0, '#ffffff'), // steam
      box(0.012, 0.05, 0.012, -0.02, 0.15, 0.02, '#ffffff'),
    ]),
  );
  armL.add(cup);
  // bag of chips in the left hand (hidden until a snack run)
  const chips = new THREE.Group();
  chips.position.y = -0.56;
  chips.visible = false;
  chips.add(
    mesh([
      box(0.13, 0.19, 0.05, 0, 0, 0, '#d9342b'), // bag
      box(0.134, 0.07, 0.052, 0, -0.01, 0, '#f5c518'), // yellow label band
      box(0.138, 0.025, 0.04, 0, 0.105, 0, '#f2d37a'), // crimped top
    ]),
  );
  armL.add(chips);
  const { pivot: armR, elbow: elbowR } = mkArm(1);
  // the right hand may hold a vape or a phone (posed by bending the right elbow)
  let vape: CharacterRig['vape'];
  let phone: CharacterRig['phone'];
  if (look.vape) {
    // the vape (with its glowing tip) only shows while it is in use
    const device = mesh([
      box(0.04, 0.13, 0.04, 0, -0.32, 0, '#23262b'), // body
      box(0.042, 0.03, 0.042, 0, -0.285, 0, '#c9a24a'), // gold ring
      box(0.025, 0.04, 0.025, 0, -0.395, 0, '#d8d8d4'), // mouthpiece
    ]);
    const led = new THREE.MeshBasicMaterial({ color: 0x3a1a10 });
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), led);
    tip.position.set(0, -0.345, 0.023);
    device.add(tip);
    device.visible = false;
    elbowR.add(device);
    const puffs: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xf2f2f4, transparent: true, opacity: 0, depthWrite: false }));
      m.visible = false;
      m.userData.nonav = true;
      root.add(m);
      puffs.push(m);
    }
    vape = { elbow: elbowR, device, led, puffs };
  }
  // everybody has a phone; the people who are often on a call in the office (`phone` looks) get posed with it there
  const handset = mesh([
    box(0.03, 0.15, 0.075, -0.045, -0.3, 0, '#1d1f24'), // phone, held in the fist
    box(0.006, 0.13, 0.06, -0.062, -0.3, 0, '#7fb2e0'), // lit screen on the side facing the head
  ]);
  handset.visible = false;
  elbowR.add(handset);
  if (look.phone) phone = { elbow: elbowR, device: handset };
  // devs own a Nerf gun: grip in the fist, body and barrel along the forearm (which points forward while aiming)
  let gun: THREE.Object3D | undefined;
  if (look.nerf) {
    gun = mesh([
      box(0.09, 0.28, 0.1, -0.03, -0.4, 0.0, '#ff7a1a'), // chunky body
      box(0.06, 0.22, 0.06, -0.03, -0.66, 0.02, '#ffd81f'), // barrel
      box(0.07, 0.04, 0.07, -0.03, -0.79, 0.02, '#e8302d'), // muzzle
      box(0.065, 0.12, 0.05, -0.03, -0.42, 0.09, '#1f7fe0'), // magazine
      box(0.05, 0.09, 0.07, -0.03, -0.33, -0.08, '#2a2c33'), // grip
    ]);
    gun.visible = false;
    elbowR.add(gun);
  }
  // a chip between the fingers on the way to the mouth
  const chip = mesh([box(0.05, 0.015, 0.05, -0.03, -0.34, 0.01, '#f0c64a')]);
  chip.visible = false;
  elbowR.add(chip);

  // handheld console in both hands, screen towards the player's own face (hidden until a day task plays it)
  const gameboy = new THREE.Group();
  gameboy.visible = false;
  gameboy.add(
    mesh([
      box(0.22, 0.34, 0.07, 0, 0, 0, '#d4d2c8'), // case
      box(0.18, 0.15, 0.012, 0, 0.07, -0.036, '#5a5d6a'), // dark bezel
      box(0.05, 0.016, 0.012, -0.055, -0.07, -0.038, '#2b2d33'), // d-pad
      box(0.016, 0.05, 0.012, -0.055, -0.07, -0.038, '#2b2d33'),
      box(0.032, 0.032, 0.014, 0.075, -0.06, -0.038, '#8a1f4a'), // A / B
      box(0.032, 0.032, 0.014, 0.035, -0.09, -0.038, '#8a1f4a'),
      box(0.04, 0.012, 0.01, -0.03, -0.14, -0.037, '#8f8d84'), // select / start
      box(0.04, 0.012, 0.01, 0.03, -0.14, -0.037, '#8f8d84'),
    ]),
  );
  const gameboyScreen = new THREE.MeshBasicMaterial({ color: 0x9bbc0f });
  const lcd = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.006), gameboyScreen);
  lcd.position.set(0, 0.075, -0.044);
  gameboy.add(lcd);
  gameboy.position.set(0, 1.0, 0.3);
  body.add(gameboy);

  // camera for the photo shoot: held at the face in both hands, lens forward, a flash on top (hidden until somebody shoots)
  const camera = new THREE.Group();
  camera.visible = false;
  camera.add(
    mesh([
      box(0.26, 0.15, 0.1, 0, 0, 0, '#2b2d33'), // body
      box(0.07, 0.17, 0.11, 0.08, -0.01, 0.01, '#202228'), // grip
      box(0.1, 0.1, 0.12, 0, 0, 0.11, '#1b1c20'), // lens
      box(0.12, 0.12, 0.03, 0, 0, 0.19, '#3a3d45'), // lens ring
      box(0.08, 0.04, 0.07, 0, 0.095, -0.005, '#202228'), // prism
      box(0.06, 0.04, 0.05, 0, 0.135, -0.005, '#1b1c20'), // hot shoe
    ]),
  );
  const flashHead = new THREE.MeshBasicMaterial({ color: 0x4a4d55 });
  const flashLamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.055, 0.025), flashHead);
  flashLamp.position.set(0, 0.18, 0.02);
  camera.add(flashLamp);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  glow.position.set(0, 0.18, 0.06);
  glow.visible = false;
  camera.add(glow);
  camera.position.set(0, 0.9, 0.3);
  body.add(camera);

  // ---- legs (pivot at hip)
  const shoe = look.shoeColor ?? (new THREE.Color(look.bottom).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? SHOE_DARK : SHOE_LIGHT);
  const mkLeg = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.115 * build, 0.8, 0);
    // thigh reaches a little past the knee so the joint stays closed when bent
    const thigh: THREE.BufferGeometry[] = [];
    const shin: THREE.BufferGeometry[] = []; // origin = knee, 0.4 below the hip
    if (look.shorts) {
      thigh.push(box(0.19, 0.34, 0.22, 0, -0.17, 0, look.bottom));
      thigh.push(box(0.14, 0.12, 0.16, 0, -0.4, 0, skin));
      shin.push(box(0.14, 0.3, 0.16, 0, -0.15, 0, skin));
    } else {
      thigh.push(box(0.19, 0.46, 0.22, 0, -0.23, 0, look.bottom));
      shin.push(box(0.19, 0.3, 0.22, 0, -0.15, 0, look.bottom));
    }
    if (look.flipflops) {
      const sole = '#2f6fb0';
      shin.push(box(0.17, 0.07, 0.28, 0, -0.34, 0.05, skin)); // bare foot
      shin.push(box(0.19, 0.025, 0.31, 0, -0.3875, 0.05, sole));
      shin.push(box(0.19, 0.016, 0.05, 0, -0.305, 0.08, sole)); // strap
    } else {
      shin.push(box(0.2, 0.1, 0.32, 0, -0.35, 0.05, shoe));
    }
    skinOf(pivot).add(mesh(thigh));
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    skinOf(knee).add(mesh(shin));
    pivot.add(knee);
    root.add(pivot);
    return { pivot, knee };
  };
  const { pivot: legL, knee: kneeL } = mkLeg(-1);
  const { pivot: legR, knee: kneeR } = mkLeg(1);

  const h = look.heightM ? look.heightM / REF_HEIGHT_M : look.height ?? 1;
  root.scale.setScalar(h);

  return { root, body, legL, legR, kneeL, kneeR, armL, armR, elbowL, elbowR, handset, gun, headHeight: 1.95 * h, setTired, setMood, vape, phone, cup, chips, chip, gameboy, gameboyScreen, camera, cameraFlash: { head: flashHead, glow }, skin: skinGroups };
}
