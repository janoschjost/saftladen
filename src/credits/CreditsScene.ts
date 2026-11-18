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
import { buildClawd, type ClawdRig } from '../render/clawdBuilder';
import { clawdScreenMaterial, screenMaterial, tickScreens, useScreen } from '../render/screens';
import { BlueprintOffice } from './BlueprintOffice';
import { Clawd } from './clawd';
import { KURT_TO_EDGE, planTrip, type DogStep, type Vec2 } from './behaviors';

/** Same bounds as the home office desks (metres): the desk top and the laptop hinge, in front of the chair. */
const DESK_TOP = 0.74;
const DESK_W = 1.7;
const BG = '#0d0f13';
/** Kurt is a miniature: his whole workstation (chair, desk, laptop) is a scaled copy of the big one. */
const MINI = 0.23;

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
function workstation(look: Look, o: { variant: number; extra: THREE.BufferGeometry[]; phase: number; alter?: boolean; shows?: THREE.MeshBasicMaterial }): Workstation {
  const group = new THREE.Group();
  const rig = buildCharacter(look);
  if (o.alter) {
    addKurt(rig);
    rig.setAlter!(true);
  }
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

/** where Kurt's workstation stands on the big desk (world metres) */
const KURT_AT = { x: 0, y: DESK_TOP, z: 0.4 };
/** the edge of the big desk (its right end) he jumps from and where he lands */
const EDGE = { x: 1.5, z: 0.97 };
const LAND = { x: 1.5, z: 1.4 };
/** the middle of the play ring and where Ellie waits meanwhile */
const PLAY_C = { x: 2.9, z: 1.85 };
/** where the blueprint of the office is projected, in front of the desks */
const HOLO = { x: 0, z: 3.1, scale: 0.085, lift: 0.1 };
const PLAY_START = Math.PI; // he runs onto the ring at its camera-far side
const DOG_WAIT: Vec2 = [3.7, 1.9];

type PlayPhase = 'work' | 'rise' | 'toEdge' | 'jump' | 'run' | 'chase' | 'orbit' | 'runBack' | 'leap' | 'toChair' | 'sit';
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

/** Marco and Janosch coding side by side, Ellie at their feet and a miniature Kurt on the desk, in an endless room. */
export class CreditsScene {
  readonly scene = new THREE.Scene();
  /** the point the camera looks at */
  readonly focus = new THREE.Vector3(0, 0.7, 1.7);
  private clock = 0;
  private blueprint: BlueprintOffice;
  private coders: Typing[] = [];
  private screens = new Set<THREE.Material>();
  private ellie: DogRig;
  readonly clawd: Clawd;
  private clawdRig: ClawdRig;
  /** the beam from Clawd to the piece he is building, and the flare where it lands */
  private beam: THREE.Mesh;
  private flare: THREE.Mesh;
  private kurt: Typing;
  private pd: { phase: PlayPhase; t: number; wait: number; angle: number; at: Vec2 } = { phase: 'work', t: 0, wait: 6, angle: 0, at: [0, 0] };
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

    // Kurt: Marco's alter ego, a scaled copy of the whole workstation standing on the seam between the two desks
    const kurt = workstation(member('marco-rieser').look, { variant: 1, extra: [], phase: 3.1, alter: true });
    kurt.group.scale.setScalar(MINI);
    kurt.group.position.set(KURT_AT.x, KURT_AT.y, KURT_AT.z);

    for (const w of [marco, janosch, kurt]) {
      scene.add(w.group);
      this.screens.add(w.screen);
    }
    this.coders = [marco.typing, janosch.typing];
    this.kurt = kurt.typing;

    this.ellie = buildDog('puppy');
    this.dogPlan = planTrip([HOME.x, HOME.z]);

    this.blueprint = new BlueprintOffice(HOLO.scale, HOLO, HOLO.lift);
    scene.add(this.blueprint.root);
    // Clawd builds along: he walks the back rim of the pad (on the plate) with the sweep, facing the room
    const rim = 0.12;
    const f = this.blueprint.footprint;
    this.clawd = new Clawd({ x0: f.x0 + rim, x1: f.x1 - rim, z: f.z0 + rim });
    this.clawdRig = buildClawd();
    scene.add(this.clawdRig.root);
    const glow = new THREE.MeshBasicMaterial({ color: '#ffb48a', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 6), glow);
    this.flare = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), glow);
    scene.add(this.beam, this.flare);
    this.tickClawd(0, 0);
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

  /** Puts Kurt at a world position (he lives in his scaled workstation, the origin is his chair on the big desk). */
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
   * Now and then Kurt gets up, walks to the front edge of the desk, jumps down and plays chase with Ellie on the
   * floor, then runs back, leaps up onto the desk and goes back to work.
   */
  private tickKurt(dt: number, t: number): void {
    const k = this.kurt;
    const pd = this.pd;
    pd.t += dt;
    const WALK = 1.1;
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
        if (pd.t >= pd.wait) this.goPlay('rise');
        break;
      case 'rise': {
        const u = smooth(Math.min(1, pd.t / 0.6));
        k.stand = u;
        k.yaw = KURT_TO_EDGE.at(0.3).yaw * u;
        if (pd.t >= 0.6) {
          this.goPlay('toEdge');
          this.dogOverride = { kind: 'go', to: DOG_WAIT };
          this.dogPlan = [];
        }
        break;
      }
      case 'toEdge': {
        const at = KURT_TO_EDGE.at(pd.t * WALK);
        k.moving = true;
        k.gait += dt * 8;
        Object.assign(k, { x: at.x, z: at.z, y: 0, yaw: at.yaw });
        if (pd.t * WALK >= KURT_TO_EDGE.length) this.goPlay('jump');
        break;
      }
      case 'jump': {
        const u = Math.min(1, pd.t / 0.7);
        this.kurtAt(EDGE.x + (LAND.x - EDGE.x) * u, DESK_TOP * (1 - u * u) + 0.2 * Math.sin(Math.PI * u), EDGE.z + (LAND.z - EDGE.z) * u, 0);
        k.air = Math.sin(Math.PI * u);
        if (u >= 1) this.goPlay('run');
        break;
      }
      case 'run': {
        const here = this.kurtWorld();
        k.moving = true;
        if (toward(here, [PLAY_C.x + Math.sin(PLAY_START) * 0.4, PLAY_C.z + Math.cos(PLAY_START) * 0.4], 1.5)) {
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
        this.dogOverride = { kind: 'go', to: [LAND.x + 0.8, LAND.z + 0.6] };
        if (toward(here, [LAND.x, LAND.z], 1.7)) this.goPlay('leap');
        break;
      }
      case 'leap': {
        const u = Math.min(1, pd.t / 0.8);
        this.kurtAt(LAND.x + (EDGE.x - LAND.x) * u, DESK_TOP * (1 - (1 - u) * (1 - u)) + 0.3 * Math.sin(Math.PI * u), LAND.z + (EDGE.z - LAND.z) * u, Math.PI);
        k.air = Math.sin(Math.PI * u);
        if (u >= 1) {
          this.dogOverride = null;
          this.dogPlan = [{ kind: 'walk', to: [HOME.x, HOME.z] }, ...planTrip([HOME.x, HOME.z])];
          this.dog.stepT = 0;
          this.goPlay('toChair');
        }
        break;
      }
      case 'toChair': {
        const d = KURT_TO_EDGE.length - pd.t * WALK;
        const at = KURT_TO_EDGE.at(Math.max(0, d));
        k.moving = true;
        k.gait += dt * 8;
        Object.assign(k, { x: at.x, z: at.z, y: 0, yaw: at.yaw + Math.PI });
        if (d <= 0) this.goPlay('sit');
        break;
      }
      case 'sit': {
        const u = smooth(Math.min(1, pd.t / 0.8));
        k.stand = 1 - u;
        k.yaw = Math.PI * (1 - u);
        k.moving = false;
        if (pd.t >= 0.8) {
          Object.assign(k, { stand: 0, x: 0, y: 0, z: 0, yaw: 0, moving: false });
          pd.wait = 10 + fxRandom() * 8;
          this.goPlay('work');
        }
        break;
      }
    }
    if (pd.phase === 'work' || pd.phase === 'rise' || pd.phase === 'sit') k.moving = false;
    void t;
  }

  /** Clawd follows the build: he walks to what is appearing, pokes at it, hops when it is done and waits while it holds. */
  private tickClawd(dt: number, t: number): void {
    const { clawd, clawdRig: r, blueprint } = this;
    clawd.step(dt, blueprint.phase, blueprint.level, blueprint.marks);
    const at = clawd.place();
    let hop = 0;
    let lean = 0;
    let wave = 0;
    let swing = 0;
    if (clawd.mode === 'walk') {
      swing = Math.sin(t * 16);
      hop = Math.abs(swing) * 0.015;
    } else if (clawd.mode === 'build') {
      // pokes at the new piece with both stubs, now one, now the other
      wave = Math.sin(t * 9);
      lean = 0.08 + 0.05 * Math.sin(t * 4.5);
    } else if (clawd.mode === 'cheer') {
      hop = Math.abs(Math.sin(t * 7)) * 0.12;
      wave = 1;
    } else {
      hop = Math.max(0, Math.sin(t * 1.1)) * 0.004; // breathing
    }
    const spinning = clawd.spin > 0 ? 1 - clawd.spin / 0.9 : 0;
    if (spinning) hop += Math.sin(spinning * Math.PI) * 0.12;
    r.root.position.set(at.x, HOLO.lift + hop, at.z);
    r.root.rotation.y = at.yaw + spinning * Math.PI * 2;
    r.body.rotation.x = lean;
    const up = clawd.mode === 'cheer' ? [2.4, 2.4] : [0.1 + 1.3 * Math.max(0, wave), 0.1 + 1.3 * Math.max(0, -wave)];
    r.armL.rotation.z = -up[0];
    r.armR.rotation.z = up[1];
    r.legs.forEach((leg, i) => (leg.rotation.x = swing * 0.7 * (i === 0 || i === 3 ? 1 : -1)));
    r.eyes.scale.y = Math.floor(t * 1000) % 3400 > 3200 ? 0.15 : 1; // blinks now and then

    // all the while the build runs (walking or standing), a beam runs from his stubs to the piece that is growing, with a flare where it lands
    const aim = clawd.aim;
    this.beam.visible = this.flare.visible = !!aim;
    if (aim) {
      const from = new THREE.Vector3(at.x, HOLO.lift + 0.2, at.z);
      const to = new THREE.Vector3(aim.x, HOLO.lift + 0.12, aim.z);
      const dir = to.clone().sub(from);
      this.beam.position.copy(from).addScaledVector(dir, 0.5);
      this.beam.scale.set(1, dir.length(), 1);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 25);
      this.flare.position.copy(to);
      this.flare.rotation.set(t * 5, t * 7, 0);
      this.flare.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 14)));
    }
  }

  /** Whether a ray (from the camera through a tap) hits Clawd. */
  hitsClawd(ray: THREE.Raycaster): boolean {
    return ray.intersectObject(this.clawdRig.hit, false).length > 0;
  }

  /** Where Clawd is on screen, for the test hook. */
  clawdScreen(camera: THREE.Camera, w: number, h: number): { x: number; y: number } {
    const p = this.clawdRig.root.localToWorld(new THREE.Vector3(0, 0.22, 0)).project(camera);
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h };
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
    const trot = (to: Vec2, speed: number): number => {
      const dx = to[0] - d.x;
      const dz = to[1] - d.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.08) return dist;
      targetYaw = Math.atan2(dx, dz);
      // turn first, then trot
      if (Math.abs(Math.atan2(Math.sin(targetYaw - d.yaw), Math.cos(targetYaw - d.yaw))) < 0.5) {
        const v = Math.min(dist, speed * dt);
        d.x += (dx / dist) * v;
        d.z += (dz / dist) * v;
        d.gait += dt * 10;
        moving = true;
      }
      return dist;
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
    for (const c of this.coders) this.pose(c, t);
    this.pose(this.kurt, t);
    this.tickEllie(dt, t);
    this.blueprint.tick(dt);
    this.tickClawd(dt, t);
    tickScreens(dt, this.screens);
  }
}
