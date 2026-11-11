import * as THREE from 'three';
import type { Look } from '../data/types';
import { box, frame, merge, propMaterial } from './geo';

export interface CharacterRig {
  root: THREE.Group;
  body: THREE.Group; // bobbing group (head, torso, arms)
  legL: THREE.Object3D; // hip pivot
  legR: THREE.Object3D;
  kneeL: THREE.Object3D; // knee pivot (child of the hip pivot)
  kneeR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  headHeight: number;
  /** only on `moody` looks: true = very happy face, false = very serious */
  setMood?: (happy: boolean) => void;
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

export function buildCharacter(look: Look): CharacterRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const build = look.build ?? 1;
  const skin = look.skin;
  const sleeveColor = look.sleeve ?? look.blazer ?? look.top; // vest keeps the shirt's sleeves
  const ar = look.strong ? 1.3 : 1; // arm thickness

  // ---- torso + head + hair + face (one merged mesh)
  const torso: THREE.BufferGeometry[] = [];
  torso.push(box(0.46 * build, 0.6, 0.26, 0, 1.1, 0, look.top));
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
  } else if (look.beard === 'mustache' || look.beard === 'goatee') {
    torso.push(box(0.18, 0.04, 0.03, 0, 1.53, 0.195, bc));
    if (look.beard === 'goatee') torso.push(box(0.1, 0.09, 0.04, 0, 1.44, 0.19, bc)); // chin beard
  } else if (look.beard === 'stubble') {
    torso.push(box(0.37, 0.13, 0.02, 0, 1.46, 0.18, mix(skin, bc, 0.4)));
  }

  // necklace (bead string in a V on the chest)
  if (look.necklace) {
    const beads: Array<[number, number]> = [[-0.1, 1.385], [-0.075, 1.35], [-0.045, 1.32], [0, 1.3], [0.045, 1.32], [0.075, 1.35], [0.1, 1.385]];
    beads.forEach(([x, y], i) => torso.push(box(0.035, 0.035, 0.03, x, y, 0.14, look.necklace![i % look.necklace!.length])));
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
  const torsoMesh = mesh(torso);
  body.add(torsoMesh);

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
    body.add(happyMesh, seriousMesh);
    setMood = (isHappy) => {
      happyMesh.visible = isHappy;
      seriousMesh.visible = !isHappy;
    };
    setMood(true);
  }

  // ---- arms (pivot at shoulder)
  const armLen = look.tee ? 0.26 : 0.46;
  const mkArm = (side: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * (0.23 * build + 0.085 + (ar - 1) * 0.07), 1.4, 0);
    const foreLen = 0.6 - armLen;
    const parts = [
      box(0.14 * ar, armLen, 0.16 * ar, 0, -armLen / 2, 0, sleeveColor),
      box(0.115 * ar, foreLen, 0.13 * ar, 0, -armLen - foreLen / 2, 0, skin),
    ];
    // anatomical left arm is +x because the character faces +z
    if (look.tattoo === 'both' || (look.tattoo === 'left' && side === 1) || (look.tattoo === 'right' && side === -1)) {
      for (const [at, len] of [[0.12, 0.1], [0.35, 0.06], [0.58, 0.12], [0.84, 0.05]] as const) {
        parts.push(box(0.123 * ar, foreLen * len, 0.138 * ar, 0, -armLen - foreLen * at, 0, '#34495e'));
      }
    }
    if (look.wristbands && side === -1) {
      look.wristbands.forEach((col, i) => parts.push(box(0.125 * ar, 0.024, 0.14 * ar, 0, -0.575 + i * 0.03, 0, col)));
    }
    pivot.add(mesh(parts));
    body.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // ---- legs (pivot at hip)
  const shoe = new THREE.Color(look.bottom).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6 ? SHOE_DARK : SHOE_LIGHT;
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
    pivot.add(mesh(thigh));
    const knee = new THREE.Group();
    knee.position.y = -0.4;
    knee.add(mesh(shin));
    pivot.add(knee);
    root.add(pivot);
    return { pivot, knee };
  };
  const { pivot: legL, knee: kneeL } = mkLeg(-1);
  const { pivot: legR, knee: kneeR } = mkLeg(1);

  const h = look.heightM ? look.heightM / REF_HEIGHT_M : look.height ?? 1;
  root.scale.setScalar(h);

  return { root, body, legL, legR, kneeL, kneeR, armL, armR, headHeight: 1.95 * h, setMood };
}
