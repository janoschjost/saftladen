import * as THREE from 'three';
import type { Look } from '../data/types';
import { team } from '../data/team';
import { fxRandom } from '../game/rng';
import { buildCharacter, type CharacterRig } from '../render/characterBuilder';
import { buildDog, type DogRig } from '../render/dogBuilder';
import { solveArm, type ArmPose } from '../render/homeOffice';
import { box, cyl, merge, propMaterial } from '../render/geo';
import { addKurt } from '../render/kurtBuilder';
import { SIT_DROP } from '../render/officeBuilder';
import { buildClawdDesk, poseClawd, type ClawdDesk } from '../render/clawdBuilder';
import { clawdScreenMaterial, screenMaterial, tickScreens, useScreen } from '../render/screens';
import { BlueprintOffice } from './BlueprintOffice';
import { planTrip, type DogStep, type Vec2 } from './behaviors';
import { ClawdRoutine, Path } from './clawdRoutine';

/** Same bounds as the home office desks (metres): the desk top and the laptop hinge, in front of the chair. */
const DESK_TOP = 0.74;
const DESK_W = 1.7;
const BG = '#0d0f13';
/** Kurt is a miniature, a scaled copy of a person: about as big as Ellie. */
const MINI = 0.34;

const member = (id: string) => {
  const m = team.find((p) => p.id === id);
  if (!m) throw new Error(`no team member ${id}`);
  return m;
};

/** Box standing on `y` (bottom edge), like the home office pieces. */
const bx = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => box(w, h, d, x, y + h / 2, z, color);

function mesh(parts: THREE.BufferGeometry[]): THREE.Mesh {
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** Swivel chair, the way the home offices have it (the person sits at the origin). */
function chair(color: string): THREE.Object3D {
  return mesh([
    bx(0.5, 0.08, 0.5, 0, 0.32, 0.02, color),
    bx(0.54, 0.75, 0.07, 0, 0.4, -0.3, color),
    cyl(0.03, 0.03, 0.3, 0, 0.17, 0, '#2a2a2d', 6),
    cyl(0.26, 0.26, 0.03, 0, 0.015, 0, '#2a2a2d', 5),
  ]);
}

/** Sit-stand desk with steel legs and a mug (or a plant) on it. */
function desk(top: string, legs: string, extra: THREE.BufferGeometry[]): THREE.Object3D {
  const p = [bx(DESK_W, 0.04, 0.8, 0, DESK_TOP - 0.04, 0.6, top)];
  for (const sx of [-1, 1]) for (const sz of [0.25, 0.95]) p.push(bx(0.05, DESK_TOP - 0.04, 0.05, sx * (DESK_W / 2 - 0.06), 0, sz, legs));
  return mesh([...p, ...extra]);
}

/** Red Bull can: silver on top, blue below, a red band between. */
const can = (x: number, z: number): THREE.BufferGeometry[] => [
  cyl(0.03, 0.03, 0.07, x, DESK_TOP + 0.035, z, '#1f3a8a'),
  cyl(0.031, 0.031, 0.012, x, DESK_TOP + 0.076, z, '#d8232a'),
  cyl(0.03, 0.03, 0.06, x, DESK_TOP + 0.112, z, '#c8ccd2'),
];

const mug = (x: number, z: number, color: string): THREE.BufferGeometry[] => [cyl(0.045, 0.04, 0.095, x, DESK_TOP + 0.048, z, color), bx(0.03, 0.05, 0.02, x + 0.06, DESK_TOP + 0.005, z, color)];

/** The Saftladen mark (the speech bubble with the 2 cut out, as in the game's title), white on transparent: the glowing logo on the back of the lid. */
const MARK_PATH = 'M27.3 0H7C6 0 5 0.4 4.3 1.1C3.6 1.7 3.2 2.7 3.2 3.6V17.1L0 25L8.1 21.8H27.3C28.3 21.8 29.2 21.4 29.9 20.7C30.6 20 31 19.1 31 18.1V3.6C31 3.1 30.9 2.7 30.7 2.2C30.5 1.8 30.2 1.4 29.9 1C29.6 0.7 29.1 0.4 28.7 0.2C28.3 0.1 27.8 0 27.3 0ZM21.1 16.6H12.7V14L17.3 9.9C17.8 9.5 18.4 9 18.4 8.3C18.4 8.1 18.34 7.91 18.3 7.8C18.2 7.6 18.1 7.5 18 7.4C17.9 7.3 17.7 7.19 17.5 7.1C17.26 6.99 17.1 7 17 7C16.8 7 16.6 7 16.4 7.1C16.2 7.2 16 7.3 15.9 7.4C15.8 7.5 15.65 7.69 15.6 7.9C15.54 8.13 15.5 8.3 15.5 8.5L13 8.3C13 6 14.7 4.8 17 4.8C19.2 4.8 20.8 6 20.8 8.3C20.8 8.9 20.7 9.5 20.4 10C20.1 10.5 19.7 11 19.2 11.4L15.6 14.4H21V16.6H21.1Z';
let markMaterial: THREE.MeshBasicMaterial | null = null;
function markMat(): THREE.MeshBasicMaterial {
  if (!markMaterial) {
    const c = document.createElement('canvas');
    c.width = 248;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.scale(8, 8);
    g.fillStyle = 'white';
    g.fill(new Path2D(MARK_PATH));
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    markMaterial = new THREE.MeshBasicMaterial({ map, transparent: true });
  }
  return markMaterial;
}

/** 16" MacBook Pro in space black facing the person; the screen shows an editor. */
function laptop(variant: number, shows?: THREE.MeshBasicMaterial): { root: THREE.Object3D; screen: THREE.MeshBasicMaterial } {
  const root = new THREE.Group();
  const hinge = 0.73; // keyboard right under the typing hands (they hover at z 0.6)
  const W = 0.358;
  const D = 0.248;
  const top = DESK_TOP + 0.017;
  const keyRows: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) keyRows.push(bx(0.31, 0.0015, 0.004, 0, top, hinge - D + 0.19 - i * 0.026, '#2a2b30')); // gaps between the key rows
  root.add(
    mesh([
      bx(W, 0.017, D, 0, DESK_TOP, hinge - D / 2, '#2b2c31'),
      bx(0.32, 0.001, 0.12, 0, top, hinge - D + 0.14, '#0e0e11'), // keyboard
      ...keyRows,
      bx(0.13, 0.001, 0.08, 0, top, hinge - D + 0.04, '#383940'), // trackpad
      bx(0.06, 0.025, 0.1, 0.36, DESK_TOP, 0.5, '#2b2d33'), // mouse
    ]),
  );
  const lid = new THREE.Group();
  lid.position.set(0, top, hinge - 0.004);
  lid.rotation.x = 0.3; // leant back
  lid.add(mesh([bx(W, D, 0.006, 0, 0, 0.003, '#2b2c31'), bx(W - 0.016, D - 0.016, 0.001, 0, 0.008, -0.0005, '#050507')]));
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.0807), markMat());
  mark.position.set(0, D / 2, 0.0065); // on the back of the lid, facing the room
  lid.add(mark);
  const screen = shows ?? screenMaterial('code', variant);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.024, D - 0.024), screen);
  plane.rotation.y = Math.PI; // faces the person (-z)
  plane.position.set(0, D / 2, -0.0012);
  lid.add(plane);
  root.add(lid);
  return { root, screen };
}

interface Typing {
  rig: CharacterRig;
  typeL: ArmPose;
  typeR: ArmPose;
  /** each typist has their own rhythm */
  phase: number;
  /** 0 = seated at the desk .. 1 = on their feet (walking about) */
  stand: number;
  /** where they are (workstation coordinates, the chair is the origin) and which way they face */
  x: number;
  z: number;
  yaw: number;
  /** gait clock while walking */
  gait: number;
  /** height above the chair's floor (workstation coordinates), for jumps */
  y: number;
  /** 0..1: in mid air, arms up and legs spread */
  air: number;
  moving: boolean;
  /** how far the hips drop when seated (rig units), the knee bend while seated and how much they doze (arms in the lap, slumped) */
  drop: number;
  kneeSit: number;
  sleep: number;
}

/** Arms that reach the keys at this person's size (the body scales with height, the desk doesn't). */
function typingPoses(rig: CharacterRig): { typeL: ArmPose; typeR: ArmPose } {
  const h = rig.root.scale.y;
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x / h, y / h + SIT_DROP, z / h);
  const hand = new THREE.Vector3(0, -0.3, 0);
  return {
    typeL: solveArm(rig.armL.position.clone(), hand, local(-0.15, DESK_TOP + 0.05, 0.62)),
    typeR: solveArm(rig.armR.position.clone(), hand, local(0.15, DESK_TOP + 0.05, 0.62)),
  };
}

interface Workstation {
  group: THREE.Group;
  typing: Typing;
  screen: THREE.MeshBasicMaterial;
}

/** A chair, a desk, a laptop and somebody seated at it, hands on the keys. */
function workstation(look: Look, o: { variant: number; extra: THREE.BufferGeometry[]; phase: number; shows: THREE.MeshBasicMaterial }): Workstation {
  const group = new THREE.Group();
  const rig = buildCharacter(look);
  const lap = laptop(o.variant, o.shows);
  group.add(chair('#23262d'), desk('#3a3f4b', '#8b919c', o.extra), lap.root, rig.root);
  rig.legL.rotation.x = rig.legR.rotation.x = -1.5;
  rig.kneeL.rotation.x = rig.kneeR.rotation.x = 1.5;
  rig.legL.position.y = rig.legR.position.y = 0.8 - SIT_DROP;
  useScreen(lap.screen, 1);
  return { group, typing: { rig, ...typingPoses(rig), phase: o.phase, stand: 0, x: 0, z: 0, yaw: 0, gait: 0, y: 0, air: 0, moving: false, drop: SIT_DROP, kneeSit: 1.5, sleep: 0 }, screen: lap.screen };
}

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, '#262b36');
  grad.addColorStop(0.35, '#1a1e27');
  grad.addColorStop(1, BG); // the same colour as the background: the floor has no edge
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ellie's rest spot, by Janosch's chair, and which way she lies. */
const HOME = { x: DESK_W / 2 + 0.7, z: 0.6 };
const HOME_YAW = -0.5;

/** where Kurt sleeps (world metres): on the floor in front of the big desk's front left leg, his back against it */
const KURT_AT = { x: -(DESK_W / 2 + DESK_W / 2 - 0.06), y: 0, z: 0.95 + 0.025 + 0.2 * MINI };
/** where Clawd's little workstation stands: on the floor, east of the blueprint, facing it */
const CLAWD_AT = { x: 2.55, y: 0, z: 3.0, yaw: -Math.PI / 2, scale: 1.6 };
/** his way from his desk round the blueprint's east and back side to the open floor in front of the big desk, where he talks */
const CLAWD_PATH: Vec2[] = [[2.95, 3.0], [2.95, 2.45], [2.2, 2.1], [1.9, 1.75], [1.0, 1.75]];
/** the middle of the play ring, west of the blueprint, and where Ellie waits meanwhile */
const PLAY_C = { x: -2.95, z: 2.75 };
/** where the blueprint of the office is projected, in front of the desks */
const HOLO = { x: 0, z: 3.1, scale: 0.085, lift: 0.1 };
const PLAY_START = Math.PI; // he runs onto the ring at its camera-far side
const DOG_WAIT: Vec2 = [PLAY_C.x + Math.sin(PLAY_START - 1.5) * 0.55, PLAY_C.z + Math.cos(PLAY_START - 1.5) * 0.55];

type PlayPhase = 'work' | 'rise' | 'run' | 'chase' | 'orbit' | 'runBack' | 'sit';
/** Kurt's game takes Ellie over: walk somewhere and watch, or be put exactly where the game says */
type DogOverride = { kind: 'go'; to: Vec2 } | { kind: 'free'; x: number; z: number; yaw: number; moving: boolean; bow: boolean };

/** Faint blueprint grid on the floor, fading out towards the edge (an alpha map). */
function gridFloor(): THREE.Mesh {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 64;
  const g = tile.getContext('2d')!;
  g.strokeStyle = 'rgba(120, 190, 255, 0.35)';
  g.lineWidth = 2;
  g.strokeRect(0, 0, 64, 64);
  const map = new THREE.CanvasTexture(tile);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(16, 16);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const fade = document.createElement('canvas');
  fade.width = fade.height = 128;
  const f = fade.getContext('2d')!;
  const rad = f.createRadialGradient(64, 64, 0, 64, 64, 64);
  rad.addColorStop(0, '#fff');
  rad.addColorStop(0.55, '#777');
  rad.addColorStop(1, '#000');
  f.fillStyle = rad;
  f.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(8, 48), new THREE.MeshBasicMaterial({ map, alphaMap: new THREE.CanvasTexture(fade), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  return mesh;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A white "z" on a clear background (for the sprites over the sleeping Kurt). */
function zTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e6ecff';
  g.font = '700 52px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('z', 32, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Marco and Janosch coding side by side, Clawd at his own little desk east of the blueprint, Ellie at their feet and a miniature Kurt asleep against the desk's front leg, in an endless room. */
export class CreditsScene {
  readonly scene = new THREE.Scene();
  /** the point the camera looks at */
  readonly focus = new THREE.Vector3(0, 0.7, 1.7);
  private clock = 0;
  private blueprint: BlueprintOffice;
  private coders: Typing[] = [];
  private screens = new Set<THREE.Material>();
  private ellie: DogRig;
  private kurt: Typing;
  private clawd: ClawdDesk;
  private clawdRoutine: ClawdRoutine;
  /** the "z" that float up from the sleeping Kurt */
  private zees: THREE.Sprite[] = [];
  private pd: { phase: PlayPhase; t: number; wait: number; angle: number; at: Vec2 } = { phase: 'work', t: 0, wait: 16, angle: 0, at: [0, 0] };
  private dogOverride: DogOverride | null = null;
  private dogPlan: DogStep[] = [];
  private dog = { x: HOME.x, z: HOME.z, yaw: HOME_YAW, lie: 1, stepT: 0, gait: 0, bow: 0, sniff: 0 };

  constructor() {
    const { scene } = this;
    scene.background = new THREE.Color(BG);

    // an endless floor: a disc that fades into the background colour, plus a plane that only catches shadows
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshBasicMaterial({ map: floorTexture() }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor, gridFloor());
    const shadows = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ opacity: 0.55 }));
    shadows.rotation.x = -Math.PI / 2;
    shadows.position.y = 0.002;
    shadows.receiveShadow = true;
    scene.add(shadows);

    scene.add(new THREE.HemisphereLight('#8fa2d0', '#1a1d26', 1.5));
    const sun = new THREE.DirectionalLight('#b9c8ff', 1.5);
    sun.position.set(-4, 7, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 25 });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);
    // a lamp over the open floor where Kurt and Ellie play
    const lamp = new THREE.PointLight('#fff1dc', 2.2, 6);
    lamp.position.set(PLAY_C.x, 2.6, PLAY_C.z + 0.4);
    scene.add(lamp);
    // the screens light up the scene, both desks the same (Janosch's a touch cooler)
    for (const [x, color, power] of [[-DESK_W / 2, '#ffffff', 1.8], [DESK_W / 2, '#dff2ff', 1.8]] as const) {
      const glow = new THREE.PointLight(color, power, 3.2);
      glow.position.set(x, 1.05, 1.1);
      scene.add(glow);
    }

    const marco = workstation(member('marco-rieser').look, { variant: 1, extra: mug(-0.55, 0.65, '#ffffff'), phase: 0, shows: clawdScreenMaterial(true) });
    marco.group.position.x = -DESK_W / 2;
    const janosch = workstation(member('janosch-jost').look, { variant: 0, extra: can(0.55, 0.65), phase: 1.7, shows: clawdScreenMaterial(false) });
    janosch.group.position.x = DESK_W / 2;

    // Clawd works on the desk, between the two of them, on his own little workstation
    const clawdScreen = clawdScreenMaterial(false);
    this.clawd = buildClawdDesk(laptop(0, clawdScreen).root, CLAWD_AT.scale);
    this.clawd.group.position.set(CLAWD_AT.x, CLAWD_AT.y, CLAWD_AT.z);
    this.clawd.group.rotation.y = CLAWD_AT.yaw; // his desk faces the blueprint
    useScreen(clawdScreen, 1);
    scene.add(this.clawd.group, this.clawd.rig.root);
    this.clawd.group.updateMatrixWorld(true);
    const seat = this.clawd.group.localToWorld(this.clawd.seat.clone());
    this.clawdRoutine = new ClawdRoutine({
      seat: { x: seat.x, y: seat.y, z: seat.z, yaw: this.clawd.seatYaw + CLAWD_AT.yaw },
      path: new Path(CLAWD_PATH),
      stopYaw: 0,
    });
    this.clawd.rig.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : undefined));

    // Kurt, Marco's alter ego, a scaled copy of a person: asleep on the floor, his back against the desk's front left leg
    const kurtRig = buildCharacter(member('marco-rieser').look);
    addKurt(kurtRig);
    kurtRig.setAlter!(true);
    const kurtGroup = new THREE.Group();
    kurtGroup.add(kurtRig.root);
    kurtGroup.scale.setScalar(MINI);
    kurtGroup.position.set(KURT_AT.x, KURT_AT.y, KURT_AT.z);
    scene.add(kurtGroup);
    this.kurt = { rig: kurtRig, ...typingPoses(kurtRig), phase: 3.1, stand: 0, x: 0, z: 0, yaw: 0, gait: 0, y: 0, air: 0, moving: false, drop: 0.7, kneeSit: 0.15, sleep: 1 };
    const zTex = zTexture();
    for (let i = 0; i < 3; i++) {
      const z = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false }));
      kurtGroup.add(z);
      this.zees.push(z);
    }

    for (const w of [marco, janosch]) {
      scene.add(w.group);
      this.screens.add(w.screen);
    }
    this.screens.add(clawdScreen);
    this.coders = [marco.typing, janosch.typing];

    this.ellie = buildDog('puppy');
    this.dogPlan = planTrip([HOME.x, HOME.z]);

    this.blueprint = new BlueprintOffice(HOLO.scale, HOLO, HOLO.lift);
    scene.add(this.blueprint.root);
    this.ellie.root.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : undefined));
    scene.add(this.ellie.root);
  }

  /** One frame of a person: typing at the desk while `stand` is 0, on their feet and walking as it nears 1. */
  private pose(p: Typing, t: number): void {
    const { rig, typeL, typeR, phase, stand: s, air } = p;
    const walking = p.moving;
    const burst = 0.3 + 0.7 * smooth(Math.min(1, Math.max(0, Math.sin(t * 0.8 + phase) * 2 + 0.6)));
    const a = Math.sin(t * 13 + phase) * burst;
    const b = Math.sin(t * 11 + phase * 2) * burst;
    const swing = walking ? Math.sin(p.gait) : 0;
    const L = THREE.MathUtils.lerp;
    // arms: on the keys, swinging while walking, hanging in between, up in the air
    rig.armL.rotation.set(L(L(typeL.x + 0.03 * a, swing * 0.6, s), -2.6, air), 0, L(L(-typeL.z, 0, s), -0.4, air));
    rig.armR.rotation.set(L(L(typeR.x + 0.03 * b, -swing * 0.6, s), -2.6, air), 0, L(L(typeR.z, 0, s), 0.4, air));
    rig.elbowL.rotation.set(L(typeL.e + 0.07 * a, -0.25, s), 0, L(-typeL.ez, 0, s));
    rig.elbowR.rotation.set(L(typeR.e + 0.07 * b, -0.25, s), 0, L(typeR.ez, 0, s));
    // legs: thighs forward on the chair .. straight under the hips .. one forward, one back in the air
    const step = swing * 0.6 * s;
    rig.legL.rotation.x = L(L(-1.5, 0, s) + step, -0.8, air);
    rig.legR.rotation.x = L(L(-1.5, 0, s) - step, 0.5, air);
    rig.kneeL.rotation.x = rig.kneeR.rotation.x = L(L(p.kneeSit, walking ? 0.15 : 0.05, s), 0.7, air);
    rig.legL.rotation.z = -0.12 * (1 - s) * p.sleep;
    rig.legR.rotation.z = 0.12 * (1 - s) * p.sleep;
    rig.legL.position.y = rig.legR.position.y = L(0.8 - p.drop, 0.8, s);
    rig.body.position.y = L(-p.drop + Math.sin(t * (p.sleep ? 0.9 : 1.3) + phase) * (p.sleep ? 0.012 : 0.006), walking ? Math.abs(swing) * 0.03 : 0, s);
    rig.body.rotation.x = L(L(0.08 + Math.sin(t * 0.5 + phase) * 0.02, -0.12, p.sleep), 0, s);
    rig.body.rotation.z = 0.1 * p.sleep * (1 - s);
    // dozing: hands in the lap
    const doze = p.sleep * (1 - s);
    if (doze > 0) {
      rig.armL.rotation.x = L(rig.armL.rotation.x, -0.55, doze);
      rig.armR.rotation.x = L(rig.armR.rotation.x, -0.55, doze);
      rig.armL.rotation.z = L(rig.armL.rotation.z, -0.1, doze);
      rig.armR.rotation.z = L(rig.armR.rotation.z, 0.1, doze);
      rig.elbowL.rotation.x = L(rig.elbowL.rotation.x, -1.0, doze);
      rig.elbowR.rotation.x = L(rig.elbowR.rotation.x, -1.0, doze);
    }
    rig.root.position.set(p.x, p.y, p.z);
    rig.root.rotation.y = p.yaw;
    if (rig.tail) rig.tail.rotation.y = Math.sin(t * (walking ? 9 : 3) + phase) * 0.45;
  }

  /** Puts Kurt at a world position (his rig is scaled; its origin is where he sleeps, on the floor). */
  private kurtAt(x: number, y: number, z: number, yaw: number): void {
    const k = this.kurt;
    k.x = (x - KURT_AT.x) / MINI;
    k.y = (y - KURT_AT.y) / MINI;
    k.z = (z - KURT_AT.z) / MINI;
    k.yaw = yaw;
  }

  private kurtWorld(): { x: number; z: number } {
    return { x: this.kurt.x * MINI + KURT_AT.x, z: this.kurt.z * MINI + KURT_AT.z };
  }

  private goPlay(phase: PlayPhase): void {
    this.pd.phase = phase;
    this.pd.t = 0;
  }

  /**
   * Kurt sleeps against the desk's front left leg. Now and then he wakes, stretches up, runs to the open floor and plays
   * chase with Ellie, then runs back, turns round and drops off again.
   */
  private tickKurt(dt: number, t: number): void {
    const k = this.kurt;
    const pd = this.pd;
    pd.t += dt;
    const toward = (from: { x: number; z: number }, to: Vec2, speed: number): boolean => {
      const dx = to[0] - from.x;
      const dz = to[1] - from.z;
      const dist = Math.hypot(dx, dz);
      const v = Math.min(dist, speed * dt);
      this.kurtAt(from.x + (dx / (dist || 1)) * v, 0, from.z + (dz / (dist || 1)) * v, dist > 0.01 ? Math.atan2(dx, dz) : k.yaw);
      k.gait += dt * 12;
      return dist - v < 0.02;
    };
    k.air = 0;
    switch (pd.phase) {
      case 'work':
        k.sleep = 1;
        if (pd.t >= pd.wait) this.goPlay('rise');
        break;
      case 'rise': {
        // wakes, sits up, gets to his feet
        const u = smooth(Math.min(1, pd.t / 1.2));
        k.stand = u;
        k.sleep = 1 - u;
        if (pd.t >= 1.2) {
          this.goPlay('run');
          this.dogOverride = { kind: 'go', to: DOG_WAIT };
          this.dogPlan = [];
        }
        break;
      }
      case 'run': {
        // Kurt runs to the ring and waits there until Ellie has trotted up behind him, so the chase starts where she is
        const here = this.kurtWorld();
        const arrived = toward(here, [PLAY_C.x + Math.sin(PLAY_START) * 0.4, PLAY_C.z + Math.cos(PLAY_START) * 0.4], 1.5);
        k.moving = !arrived;
        if (arrived && Math.hypot(this.dog.x - DOG_WAIT[0], this.dog.z - DOG_WAIT[1]) < 0.15) {
          pd.angle = PLAY_START;
          this.goPlay('chase');
        }
        break;
      }
      case 'chase': {
        // Kurt runs circles, Ellie hard on his heels
        const a = pd.angle + pd.t * 2.2;
        const hop = Math.abs(Math.sin(pd.t * 7)) * 0.05;
        this.kurtAt(PLAY_C.x + Math.sin(a) * 0.4, hop, PLAY_C.z + Math.cos(a) * 0.4, Math.atan2(Math.cos(a), -Math.sin(a)));
        k.moving = true;
        k.gait += dt * 12;
        const e = a - 1.5;
        this.dogOverride = { kind: 'free', x: PLAY_C.x + Math.sin(e) * 0.55, z: PLAY_C.z + Math.cos(e) * 0.55, yaw: Math.atan2(Math.cos(e), -Math.sin(e)), moving: true, bow: false };
        if (pd.t >= 4.5) {
          const o = this.dogOverride;
          pd.at = [o.x, o.z];
          const w = this.kurtWorld();
          pd.angle = Math.atan2(w.x - o.x, w.z - o.z);
          this.goPlay('orbit');
        }
        break;
      }
      case 'orbit': {
        // Ellie plays bow and wags, Kurt hops round her
        const [ex, ez] = pd.at;
        const a = pd.angle + pd.t * 3;
        const r = 0.5;
        this.kurtAt(ex + Math.sin(a) * r, Math.abs(Math.sin(pd.t * 9)) * 0.09, ez + Math.cos(a) * r, Math.atan2(Math.cos(a), -Math.sin(a)));
        k.moving = true;
        k.gait += dt * 12;
        this.dogOverride = { kind: 'free', x: ex, z: ez, yaw: Math.atan2(Math.sin(a) * -1, Math.cos(a) * -1), moving: false, bow: true };
        if (pd.t >= 3.5) this.goPlay('runBack');
        break;
      }
      case 'runBack': {
        const here = this.kurtWorld();
        k.moving = true;
        this.dogOverride = { kind: 'go', to: [KURT_AT.x + 1, KURT_AT.z + 0.7] };
        if (toward(here, [KURT_AT.x, KURT_AT.z], 1.7)) {
          this.dogOverride = null;
          this.dogPlan = [{ kind: 'walk', to: [HOME.x, HOME.z] }, ...planTrip([HOME.x, HOME.z])];
          this.dog.stepT = 0;
          pd.angle = k.yaw;
          this.goPlay('sit');
        }
        break;
      }
      case 'sit': {
        // turns his back to the leg, sits down and nods off
        const u = smooth(Math.min(1, pd.t / 1.4));
        k.stand = 1 - u;
        k.sleep = u;
        k.yaw = pd.angle * (1 - u);
        k.moving = false;
        if (pd.t >= 1.4) {
          Object.assign(k, { stand: 0, x: 0, y: 0, z: 0, yaw: 0, moving: false, sleep: 1 });
          pd.wait = 14 + fxRandom() * 10;
          this.goPlay('work');
        }
        break;
      }
    }
    if (pd.phase === 'work' || pd.phase === 'rise' || pd.phase === 'sit') k.moving = false;
    this.tickZees(t, k.sleep * (1 - k.stand));
  }

  /** Clawd works, now and then walks round the blueprint to the open floor, stops there to look about, and goes back to his laptop. */
  private tickClawd(dt: number, t: number): void {
    const st = this.clawdRoutine.step(dt);
    const { rig } = this.clawd;
    rig.root.position.set(st.x, st.y, st.z);
    rig.root.rotation.y = st.yaw;
    poseClawd(rig, st.look, t, { moving: st.moving, air: st.air });
    this.clawd.tickFx(t, st.look === 'sit' && st.phase === 'work');
  }

  /** "z z z" float up from Kurt's head while he sleeps. */
  private tickZees(t: number, amount: number): void {
    this.zees.forEach((z, i) => {
      const u = ((t * 0.35 + i / this.zees.length) % 1);
      z.visible = amount > 0.5;
      z.position.set((0.45 + u * 0.6) * 0.9, 2.3 + u * 1.3, 0.4);
      z.scale.setScalar((0.35 + u * 0.45) * 1.3);
      (z.material as THREE.SpriteMaterial).opacity = Math.sin(u * Math.PI) * 0.9;
    });
  }

  /** Ellie follows her plan (rest, stroll, play or sniff, trot home) unless Kurt's game takes her over. */
  private tickEllie(dt: number, t: number): void {
    const e = this.ellie;
    const d = this.dog;
    const ov = this.dogOverride;
    const step: DogStep = this.dogPlan[0] ?? { kind: 'rest', d: 6 };
    const lieTo = !ov && step.kind === 'rest' ? 1 : 0;
    d.lie += Math.sign(lieTo - d.lie) * Math.min(Math.abs(lieTo - d.lie), dt / 0.8);
    const settled = Math.abs(d.lie - lieTo) < 0.01;
    let moving = false;
    let play = 0;
    let bow = 0;
    let sniff = 0;
    let hop = 0;
    let targetYaw = d.yaw;
    let turnRate = 5;
    const trot = (goal: Vec2, speed: number): number => {
      // behind the desks (z < 1.25) she steps out beside them first, so a long way along them never cuts through legs
      const behind = (z: number): boolean => z < 1.25;
      const to: Vec2 = behind(d.z) && !behind(goal[1]) ? [d.x, 1.5] : !behind(d.z) && behind(goal[1]) ? [goal[0], 1.5] : goal;
      const dx = to[0] - d.x;
      const dz = to[1] - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) return to === goal ? dist : 1;
      targetYaw = Math.atan2(dx, dz);
      // turn first, then trot
      if (Math.abs(Math.atan2(Math.sin(targetYaw - d.yaw), Math.cos(targetYaw - d.yaw))) < 0.5) {
        const v = Math.min(dist, speed * dt);
        d.x += (dx / dist) * v;
        d.z += (dz / dist) * v;
        d.gait += dt * 10;
        moving = true;
      }
      return to === goal ? dist : Math.hypot(goal[0] - d.x, goal[1] - d.z);
    };
    if (ov?.kind === 'free') {
      d.x = ov.x;
      d.z = ov.z;
      d.yaw = ov.yaw;
      targetYaw = ov.yaw;
      moving = ov.moving;
      if (moving) d.gait += dt * 13;
      bow = ov.bow ? 1 : 0;
      hop = ov.bow ? 0 : Math.abs(Math.sin(t * 7)) * 0.04;
      play = ov.bow ? 1 : 0;
    } else if (ov?.kind === 'go') {
      if (settled && trot(ov.to, 1.3) < 0.08) {
        // arrived: watch Kurt
        targetYaw = Math.atan2(PLAY_C.x - d.x, PLAY_C.z - d.z);
      }
    } else if (step.kind === 'rest') {
      targetYaw = HOME_YAW;
      if (settled) d.stepT += dt;
      if (d.stepT >= step.d) this.nextDogStep();
    } else if (settled && step.kind === 'walk') {
      if (trot(step.to, 1.1) < 0.08) this.nextDogStep();
    } else if (settled && (step.kind === 'play' || step.kind === 'sniff')) {
      d.stepT += dt;
      if (step.kind === 'play') {
        play = 1;
        // first a play bow, then hops and spins on the spot
        bow = d.stepT <= step.d * 0.4 ? 1 : 0;
        if (!bow) {
          targetYaw = d.yaw + 1;
          turnRate = 6;
          hop = Math.abs(Math.sin(t * 8)) * 0.16;
        }
      } else sniff = 1;
      if (d.stepT >= step.d) this.nextDogStep();
    }
    if (ov?.kind !== 'free') {
      const diff = Math.atan2(Math.sin(targetYaw - d.yaw), Math.cos(targetYaw - d.yaw));
      d.yaw += Math.sign(diff) * Math.min(Math.abs(diff), dt * turnRate);
    }
    d.bow += (bow - d.bow) * Math.min(1, dt * 8);
    d.sniff += (sniff - d.sniff) * Math.min(1, dt * 4);

    // pose: lying <-> standing, trot, bow, sniff
    const swing = moving ? Math.sin(d.gait) * 0.6 : 0;
    e.root.position.set(d.x, hop, d.z);
    e.root.rotation.y = d.yaw;
    e.body.position.y = -0.24 * d.lie + (moving ? Math.abs(Math.sin(d.gait)) * 0.02 : 0) - d.bow * 0.04;
    e.body.rotation.x = d.bow * 0.35 + d.sniff * (0.3 + Math.sin(t * 3) * 0.05);
    e.body.scale.y = 1 + Math.sin(t * 2.2) * 0.015;
    const L = THREE.MathUtils.lerp;
    e.legs.forEach((leg, i) => {
      const front = i < 2;
      const gait = (i === 0 || i === 3 ? swing : -swing) + (play && !bow ? Math.sin(t * 16 + i) * 0.5 : 0);
      leg.position.y = 0.32 - 0.24 * d.lie;
      leg.rotation.x = L(gait + (front ? -0.55 * d.bow : 0), front ? -1.45 : -1.1, d.lie);
    });
    e.tail.rotation.y = Math.sin(t * (play ? 18 : moving ? 12 : 8)) * (d.lie > 0.5 ? 0.35 : 0.55);
  }

  private nextDogStep(): void {
    this.dogPlan.shift();
    this.dog.stepT = 0;
    if (!this.dogPlan.length) this.dogPlan = planTrip([HOME.x, HOME.z]);
  }

  tick(dt: number): void {
    this.clock += dt;
    const t = this.clock;
    this.tickKurt(dt, t);
    this.tickClawd(dt, t);
    for (const c of this.coders) this.pose(c, t);
    this.pose(this.kurt, t);
    this.tickEllie(dt, t);
    this.blueprint.tick(dt);
    tickScreens(dt, this.screens);
  }
}
