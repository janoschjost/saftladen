import * as THREE from 'three';
import { screenSeed } from '../data/screens';
import { seeded } from '../game/rng';
import type { CharacterRig } from './characterBuilder';
import { box, merge, propMaterial } from './geo';
import { armFK, solveArm, type ArmPose } from './homeOffice';

/*
 * Smoke breaks and rain (#169): the cigarette in a smoker's right hand and everybody's umbrella in the left. All
 * coordinates are in the body group (head centre at y 1.58, face front at z 0.18); the whole body scales with the
 * person's height, so poses solved here fit every height. Shoulders differ per build: solved per rig, cached.
 */

/** The right corner of the mouth, where the cigarette sits. */
export const MOUTH = new THREE.Vector3(0.09, 1.495, 0.205);
/** The cigarette at the lips points forward, out to the right and a little down. */
const CIG_DIR = new THREE.Vector3(0.5, -0.15, 0.85).normalize();
const CIG_LEN = 0.085;
/** Where the fingers pinch it (forearm frame: elbow at 0, the end of the hand 0.3 below), and how far from the lips. */
export const PINCH = new THREE.Vector3(0, -0.3, 0);
const PINCH_FROM_LIPS = 0.04;
/** Between drags the hand rests a little lower, in front of the chest. */
const LOW = new THREE.Vector3(0.2, 1.15, 0.35);
/** On the way up the cigarette passes this far in front of the lips (a straight blend from low would clip the chin). */
const NEAR = 0.06;
/** The umbrella's grip: left hand in front of the chest, the shaft straight up from there. */
const GRIP = new THREE.Vector3(-0.14, 1.15, 0.3);
/** Top of the shaft (body units): the canopy hangs from here, above the head. */
const SHAFT_TOP = 2.2;

export interface SmokePoses {
  /** right arm: the filter at the lips */
  drag: ArmPose;
  /** right arm: a little lower, in front of the chest */
  low: ArmPose;
  /** right arm: the cigarette just in front of the lips, on the way between the two */
  near: ArmPose;
  /** left arm: holding the umbrella up */
  umbrella: ArmPose;
  /** the cigarette in the forearm frame: where the filter is, which way it points */
  filter: THREE.Vector3;
  dir: THREE.Vector3;
}

const cache = new Map<string, SmokePoses>();

/** Forearm frame -> body frame rotation of an arm in pose `p` (`side` = which shoulder: +1 right, -1 left). */
function forearmRotation(p: ArmPose, side: number): THREE.Quaternion {
  const qa = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.x, 0, p.z * side));
  const qe = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.e, 0, p.ez * side));
  return qa.multiply(qe);
}

/** The arm poses of a smoke break and the rain for this rig's shoulders (solved once per build). */
export function smokePoses(rig: Pick<CharacterRig, 'armL' | 'armR'>): SmokePoses {
  let poses = ofRig.get(rig);
  if (!poses) ofRig.set(rig, (poses = solvePoses(rig)));
  return poses;
}
/** per rig, so the view looks them up without building a key every frame */
const ofRig = new WeakMap<object, SmokePoses>();

function solvePoses(rig: Pick<CharacterRig, 'armL' | 'armR'>): SmokePoses {
  const sl = rig.armL.position;
  const sr = rig.armR.position;
  const key = `${sl.x.toFixed(3)}|${sr.x.toFixed(3)}|${sl.y.toFixed(3)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pinchAt = MOUTH.clone().addScaledVector(CIG_DIR, PINCH_FROM_LIPS);
  // the elbow may swing sideways: the hand comes up to the corner of the mouth from the side, not through the chin
  const right = (to: THREE.Vector3) => solveArm(sr.clone(), PINCH, to, true, [-1.2, 1.2]);
  const drag = right(pinchAt);
  const low = right(LOW);
  const near = right(pinchAt.clone().addScaledVector(CIG_DIR, NEAR));
  const umbrella = solveArm(sl.clone(), PINCH, GRIP);
  // the cigarette's direction in the forearm frame, so it points away from the face at the lips
  const dir = CIG_DIR.clone().applyQuaternion(forearmRotation(drag, Math.sign(sr.x) || 1).invert());
  const filter = PINCH.clone().addScaledVector(dir, -PINCH_FROM_LIPS);
  const poses = { drag, low, near, umbrella, filter, dir };
  cache.set(key, poses);
  return poses;
}

/** The right arm `k` of the way from the low rest (0) up to the lips (1), by way of `near`. */
export function smokeArmPose(p: SmokePoses, k: number): ArmPose {
  const [a, b, t] = k < 0.5 ? [p.low, p.near, k * 2] : [p.near, p.drag, k * 2 - 1];
  const lerp = (u: number, v: number) => u + (v - u) * t;
  return { x: lerp(a.x, b.x), z: lerp(a.z, b.z), e: lerp(a.e, b.e), ez: lerp(a.ez, b.ez) };
}

/** Where the filter end of the cigarette is (body frame) with the right arm in pose `p`, and the hand, mid forearm and elbow on the way. */
export function cigaretteAt(rig: Pick<CharacterRig, 'armL' | 'armR'>, p: ArmPose) {
  const sr = rig.armR.position.clone();
  const side = Math.sign(sr.x) || 1;
  return armFK(sr, p.x, p.z * side, p.e, p.ez * side, smokePoses(rig).filter);
}

/** Puts a cigarette (hidden until lit) into a smoker's right hand, and the smoke puffs they exhale. */
export function addCigarette(rig: CharacterRig): void {
  const { filter, dir } = smokePoses(rig);
  const stick = new THREE.Group();
  stick.add(
    new THREE.Mesh(
      merge([
        box(0.016, 0.022, 0.016, 0, 0.011, 0, '#d98a3a'), // filter
        box(0.015, CIG_LEN - 0.022, 0.015, 0, 0.022 + (CIG_LEN - 0.022) / 2, 0, '#f4f2ec'), // paper
      ]),
      propMaterial,
    ),
  );
  const ember = new THREE.MeshBasicMaterial({ color: 0xc0401a });
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.012, 0.017), ember);
  tip.position.y = CIG_LEN + 0.006;
  stick.add(tip);
  stick.position.copy(filter);
  stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  stick.visible = false;
  rig.elbowR.add(stick);
  const puffs: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xe6e6e8, transparent: true, opacity: 0, depthWrite: false }));
    m.visible = false;
    m.userData.nonav = true;
    rig.root.add(m);
    puffs.push(m);
  }
  rig.cigarette = { stick, ember, puffs };
}

/** Exhaled smoke (vape or cigarette): `t` seconds since the exhale began (-1: none), puffs drift up and fade from in front of the mouth. */
export function posePuffs(puffs: readonly THREE.Mesh[], t: number, x = 0.12): void {
  puffs.forEach((m, i) => {
    const k = t - i * 0.18; // each puff leaves a little later
    const on = t >= 0 && k >= 0 && k < 1.8;
    m.visible = on;
    if (!on) return;
    const u = k / 1.8;
    const s = 0.08 + u * 0.22;
    m.scale.set(s, s * 0.8, s);
    m.position.set(x + Math.sin(i * 2.3 + u * 3) * 0.08 * u, 1.5 + u * 0.55, 0.25 + u * 0.3 + i * 0.03);
    (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u) * Math.min(1, k * 6);
  });
}

export type UmbrellaShape = 'dome' | 'pagoda' | 'bubble' | 'dog';
/** Umbrella colours; the last one is patterned (red and white panels). */
const COLOURS = ['#d6342b', '#1f5fbf', '#2c8a4b', '#f2c230', '#25272c', '#7a3fa0', 'pattern'] as const;
const SHAPES: UmbrellaShape[] = ['dome', 'pagoda', 'bubble'];
/** Only Delya has the kids' umbrella shaped like a dog's head. */
const DOG_UMBRELLA = 'delya-kohler';

/** Everybody's own umbrella, the same every day: a colour and a shape rolled from their id. */
export function umbrellaOf(id: string): { shape: UmbrellaShape; colour: (typeof COLOURS)[number] } {
  const rnd = seeded(screenSeed({ id }));
  const colour = COLOURS[Math.floor(rnd() * COLOURS.length)];
  const shape = SHAPES[Math.floor(rnd() * SHAPES.length)];
  return { shape: id === DOG_UMBRELLA ? 'dog' : shape, colour };
}

/** Canopy profiles (radius, height from the shaft top), rim first; the widest is 0.44 (0.96 m on the tallest person). */
const PROFILES: Record<UmbrellaShape, Array<[number, number]>> = {
  dome: [[0.42, -0.14], [0.37, -0.02], [0.26, 0.07], [0.12, 0.11], [0, 0.12]],
  pagoda: [[0.44, -0.05], [0.3, -0.01], [0.17, 0.05], [0.16, 0.09], [0.08, 0.11], [0, 0.17]],
  bubble: [[0.38, -0.4], [0.42, -0.22], [0.39, -0.04], [0.27, 0.09], [0, 0.14]],
  dog: [[0.42, -0.18], [0.4, -0.04], [0.3, 0.08], [0.15, 0.14], [0, 0.15]],
};

/** Canopy materials, shared by everybody's umbrella: the colours are in the vertices. */
const CANOPY = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
const CLEAR_CANOPY = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false });

/** A low-poly lathe canopy, its panels coloured one after the other from `colours`. */
function canopy(profile: Array<[number, number]>, colours: string[], clear = false): THREE.Mesh {
  const g = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)),
    8,
  ).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    const panel = Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 8;
    c.set(colours[panel % colours.length]);
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, clear ? CLEAR_CANOPY : CANOPY);
  m.castShadow = !clear;
  return m;
}

/** Gives the person their umbrella (hidden until it rains on them outdoors), in the left hand, the shaft straight up. */
export function addUmbrella(rig: CharacterRig, id: string): void {
  const { shape, colour } = umbrellaOf(id);
  const shaftLen = SHAFT_TOP - GRIP.y;
  const root = new THREE.Group();
  root.position.copy(PINCH);
  const dark = colour === 'pattern' ? '#d6342b' : colour;
  const grip = shape === 'dog' ? '#f2c230' : '#2a2420';
  root.add(
    new THREE.Mesh(
      merge([
        box(0.018, shaftLen, 0.018, 0, shaftLen / 2, 0, '#3b3d42'), // shaft
        box(0.03, 0.12, 0.03, 0, -0.02, 0, grip), // grip in the fist
        box(0.03, 0.03, 0.06, 0, -0.08, 0.02, grip), // its hook
      ]),
      propMaterial,
    ),
  );
  const top = new THREE.Group();
  top.position.y = shaftLen;
  const panels = colour === 'pattern' ? ['#d6342b', '#f4f2ec'] : [shape === 'dog' ? '#a5703f' : colour];
  if (shape === 'bubble') {
    top.add(canopy(PROFILES.bubble, ['#dfeef8'], true));
    // the coloured rim and ribs show what is whose
    top.add(new THREE.Mesh(merge([box(0.05, 0.03, 0.05, 0, 0.15, 0, dark)]), propMaterial));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.012, 4, 8), new THREE.MeshLambertMaterial({ color: dark }));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.4;
    top.add(rim);
  } else {
    top.add(canopy(PROFILES[shape], panels));
    top.add(new THREE.Mesh(merge([box(0.025, 0.06, 0.025, 0, PROFILES[shape].at(-1)![1] + 0.03, 0, '#3b3d42')]), propMaterial)); // ferrule
  }
  if (shape === 'dog') {
    // a puppy's head: floppy ears at the sides, snout, nose and eyes at the front (+z, where the person looks)
    top.add(
      new THREE.Mesh(
        merge([
          box(0.1, 0.26, 0.16, -0.43, -0.16, 0, '#6e4527', 0, -0.25), // ears
          box(0.1, 0.26, 0.16, 0.43, -0.16, 0, '#6e4527', 0, 0.25),
          box(0.2, 0.12, 0.14, 0, -0.08, 0.43, '#c89a6a'), // snout
          box(0.08, 0.05, 0.04, 0, -0.04, 0.51, '#1b1b22'), // nose
          box(0.06, 0.06, 0.04, -0.12, 0.05, 0.33, '#1b1b22'), // eyes
          box(0.06, 0.06, 0.04, 0.12, 0.05, 0.33, '#1b1b22'),
          box(0.022, 0.022, 0.012, -0.11, 0.065, 0.352, '#ffffff'), // glints
          box(0.022, 0.022, 0.012, 0.13, 0.065, 0.352, '#ffffff'),
        ]),
        propMaterial,
      ),
    );
  }
  root.add(top);
  root.visible = false;
  rig.elbowL.add(root);
  rig.umbrella = { root, canopy: top };
}
