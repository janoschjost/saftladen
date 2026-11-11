import * as THREE from 'three';
import { HOME_ROOMS, type HomeBreak, type SignatureMove, type TeamMember } from '../data/types';
import { buildCat } from './catBuilder';
import { buildCharacter, type CharacterRig } from './characterBuilder';
import { buildDog, type DogRig } from './dogBuilder';
import { ball, box, cyl, merge, propMaterial } from './geo';
import { SIT_DROP } from './officeBuilder';

/**
 * Home offices: eight small rooms seen through the webcam of the person working there.
 * Coordinates: the person sits at the origin facing +z (towards the camera), the desk is in front of them,
 * the back wall is at z = -2. Y is up, one unit is roughly one metre.
 */
export const HOME_COUNT = 8; // regular rooms (HOME_ROOMS[0..7]); the rest belong to one person each
export const ROOM_COUNT = HOME_ROOMS.length;

type Color = string;

/** Collects coloured boxes / balls into one merged mesh, plus separate glowing parts (lamps, neon, windows). */
class Room {
  readonly group = new THREE.Group();
  readonly lights: THREE.Light[] = [];
  /** The swivel chair (an office chair the occupant can spin on), if the room has one. */
  chair?: THREE.Object3D;
  /** Height of the work surface (desk top) the hands rest on while typing. */
  desk?: number;
  /** Where the webcam sits and what it looks at (default: free-floating, set by the laptop on the desk). */
  webcam: { pos: [number, number, number]; look: [number, number, number]; fov: number } = { pos: [0, 1.38, 2.0], look: [0, 1.1, 0], fov: 58 };
  private parts: THREE.BufferGeometry[] = [];
  private shell: THREE.BufferGeometry[] = [];

  /** Box with its bottom at y (not centred). */
  bx(w: number, h: number, d: number, x: number, y: number, z: number, c: Color): void {
    this.parts.push(box(w, h, d, x, y + h / 2, z, c));
  }
  /** Room shell part (floor, walls, ceiling): receives shadows, casts none. */
  wall(w: number, h: number, d: number, x: number, y: number, z: number, c: Color): void {
    this.shell.push(box(w, h, d, x, y + h / 2, z, c));
  }
  /** Cylinder (or cone) standing on y. */
  cy(rTop: number, rBot: number, h: number, x: number, y: number, z: number, c: Color, seg = 12): void {
    this.parts.push(cyl(rTop, rBot, h, x, y + h / 2, z, c, seg));
  }
  ball(r: number, x: number, y: number, z: number, c: Color, sy = 1): void {
    this.parts.push(ball(r, x, y + r * sy, z, c, sy));
  }
  /** Unlit glowing box (screens, bulbs, neon, windows). */
  glow(w: number, h: number, d: number, x: number, y: number, z: number, c: Color, rot = 0): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(x, y + h / 2, z);
    m.rotation.z = rot;
    this.group.add(m);
    return m;
  }
  light(l: THREE.Light): void {
    this.lights.push(l);
    this.group.add(l);
  }
  point(color: Color, intensity: number, x: number, y: number, z: number, dist = 6): void {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    this.light(l);
  }

  /** Floor, three walls and a ceiling. */
  room(wall: Color, floor: Color, ceiling = '#ece8e0'): void {
    this.wall(7, 0.1, 6, 0, -0.1, -0.2, floor);
    this.wall(7, 3, 0.1, 0, 0, -2, wall);
    this.wall(0.1, 3, 6, -2.7, 0, -0.2, wall);
    this.wall(0.1, 3, 6, 2.7, 0, -0.2, wall);
    this.wall(7, 0.1, 6, 0, 2.9, -0.2, ceiling);
  }

  /** Things in the room that move on their own (palm crowns, a boat), called every frame with the clock. */
  readonly ticks: Array<(t: number) => void> = [];

  /** Everything `fn` adds becomes its own mesh, pivoting at `pivot`, so it can be animated. */
  piece(pivot: THREE.Vector3, fn: () => void): THREE.Mesh {
    const keep = this.parts;
    this.parts = [];
    fn();
    const geo = merge(this.parts);
    this.parts = keep;
    geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, propMaterial);
    m.position.copy(pivot);
    m.castShadow = true;
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  finish(): void {
    if (this.parts.length) {
      const m = new THREE.Mesh(merge(this.parts), propMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    if (this.shell.length) {
      const m = new THREE.Mesh(merge(this.shell), propMaterial);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }
}

// small deterministic random so the rooms look the same on every load
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

const BOOKS = ['#b5483a', '#3f6e8c', '#d8b04a', '#5a7a52', '#8a5a8c', '#e8e2d4', '#2f3e5a', '#c97a3c'];

function books(s: Room, x0: number, x1: number, y: number, z: number, maxH = 0.3): void {
  for (let x = x0; x < x1; ) {
    const w = 0.035 + rnd() * 0.04;
    const h = maxH * (0.65 + rnd() * 0.35);
    s.bx(w, h, 0.22, x + w / 2, y, z, pick(BOOKS));
    x += w + 0.004;
  }
}

function desk(s: Room, top: Color, legs: Color, w = 1.7, y = 0.7): void {
  s.bx(w, 0.04, 0.8, 0, y, 0.6, top);
  for (const sx of [-1, 1]) for (const sz of [0.25, 0.95]) s.bx(0.05, y, 0.05, sx * (w / 2 - 0.06), 0, sz, legs);
  // laptop facing the person; its webcam (lid top) is the view into the room
  const hinge = 0.95;
  s.bx(0.4, 0.02, 0.28, 0, y + 0.04, hinge - 0.14, '#c0c2c6');
  s.bx(0.34, 0.004, 0.12, 0, y + 0.06, hinge - 0.18, '#4a4d55'); // keys
  s.bx(0.4, 0.26, 0.015, 0, y + 0.04, hinge, '#a8aaae'); // lid
  s.bx(0.06, 0.025, 0.1, 0.36, y + 0.04, 0.5, '#2b2d33'); // mouse
  s.webcam = { pos: [0, y + 0.31, hinge + 0.02], look: [0, 1.08, 0], fov: 72 };
  s.desk = y + 0.04;
}

/** Office chair on a swivel base, its own piece so it can turn (with whoever sits on it). */
function chair(s: Room, c: Color, backH = 0.85): void {
  s.chair = s.piece(new THREE.Vector3(0, 0, 0), () => {
    s.bx(0.5, 0.08, 0.5, 0, 0.32, 0.02, c);
    s.bx(0.54, backH, 0.07, 0, 0.4, -0.3, c);
    s.cy(0.03, 0.03, 0.3, 0, 0.02, 0, '#2a2a2d', 6);
    s.cy(0.26, 0.26, 0.03, 0, 0, 0, '#2a2a2d', 5);
  });
}

function mug(s: Room, x: number, z: number, c: Color, y = 0.74): void {
  s.cy(0.045, 0.04, 0.095, x, y, z, c);
  s.bx(0.03, 0.05, 0.02, x + 0.06, y + 0.025, z, c);
}

function plant(s: Room, x: number, z: number, h = 0.6, pot: Color = '#b5653c', leaf: Color = '#3f7a3a', y = 0): void {
  s.cy(0.12, 0.09, 0.2, x, y, z, pot);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s.bx(0.1, h * (0.55 + rnd() * 0.45), 0.1, x + Math.cos(a) * 0.09, y + 0.2, z + Math.sin(a) * 0.09, i % 2 ? leaf : '#4f9244');
  }
  s.ball(0.17, x, y + 0.2 + h * 0.75, z, leaf, 0.85);
}

function frame(s: Room, w: number, h: number, x: number, y: number, z: number, c: Color, art: Color[], side: 'z' | 'x' = 'z'): void {
  if (side === 'z') {
    s.bx(w, h, 0.04, x, y, z, c);
    s.bx(w - 0.1, h - 0.1, 0.045, x, y + 0.05, z + 0.003, art[0]);
    if (art[1]) s.bx((w - 0.1) * 0.5, (h - 0.1) * 0.5, 0.05, x - w * 0.12, y + h * 0.3, z + 0.006, art[1]);
    if (art[2]) s.bx((w - 0.1) * 0.35, (h - 0.1) * 0.35, 0.055, x + w * 0.14, y + h * 0.12, z + 0.009, art[2]);
  } else {
    s.bx(0.04, h, w, x, y, z, c);
    s.bx(0.045, h - 0.1, w - 0.1, x, y + 0.05, z, art[0]);
  }
}

/**
 * A palm crown's fronds around the origin: each an arching midrib that droops towards its tip, with a row of
 * tapering leaflets on both sides hanging slightly down (like a feather). One double-sided mesh.
 */
function palmFronds(count: number, len: number): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const greens = ['#2f7a3a', '#3f9244', '#4a9a3c', '#2a6b33', '#5aa645'].map((c) => new THREE.Color(c));
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb: THREE.Color) => {
    const i = pos.length / 3;
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    col.push(ca.r, ca.g, ca.b, ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
    idx.push(i, i + 1, i + 2);
  };
  const N = 14; // samples along each frond
  for (let f = 0; f < count; f++) {
    const ang = (f / count) * Math.PI * 2 + rnd() * 0.25;
    const rise = 0.35 + rnd() * 0.45; // young fronds stand up more
    const L = len * (0.75 + rnd() * 0.35);
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const base = greens[f % greens.length];
    const tip = base.clone().lerp(new THREE.Color('#9acb5a'), 0.35);
    const spine = (u: number) => dir.clone().multiplyScalar(u * L).setY(rise * u * L - 0.75 * (u * L) ** 2 * 0.55);
    for (let i = 0; i < N; i++) {
      const u0 = i / N;
      const u1 = (i + 1) / N;
      const p0 = spine(u0);
      const p1 = spine(u1);
      const leaf = (0.08 + 0.32 * Math.sin(Math.PI * Math.min(1, u0 * 1.15))) * L * 0.55; // widest in the middle
      for (const sd of [-1, 1]) {
        const end = p0.clone().addScaledVector(side, sd * leaf).addScaledVector(dir, leaf * 0.45).setY(p0.y - leaf * 0.35);
        tri(p0, p1, end, base, tip);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function stringLights(s: Room, x0: number, x1: number, y: number, z: number, colors: Color[], sag = 0.12): void {
  const n = Math.round((x1 - x0) / 0.22);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const yy = y - Math.sin(t * Math.PI) * sag;
    s.glow(0.05, 0.07, 0.05, x0 + (x1 - x0) * t, yy, z, colors[i % colors.length]);
  }
}

export interface HomeStyle {
  label: string;
  /** scene background (what shows outside the room) */
  bg: Color;
  hemi: [Color, Color, number];
  key: [Color, number, [number, number, number]];
  /** body lean while working (negative = leaning back) */
  lean?: number;
  /** lies back at this tilt (radians, negative), hips resting in the deck chair */
  recline?: number;
  /** the webcam is the laptop on a stand over the occupant's lap: framed on them, dropped in the sand for a swim */
  lapCam?: boolean;
  /** what the drink break is: coffee (default) or a cocktail */
  drink?: 'coffee' | 'cocktail';
  /** there is sea to swim in (signature move 'swim') */
  sea?: boolean;
  build(s: Room): void;
}

const STYLES: HomeStyle[] = [
  {
    // 0 ---------------------------------------------------------------- bedroom
    label: 'Schlafzimmer',
    bg: '#c9d8e8',
    hemi: ['#ffffff', '#d8c8b0', 1.15],
    key: ['#fff1dc', 1.5, [-3, 5, 3]],
    build(s) {
      s.room('#c9d8e8', '#c8a77d', '#f2efe8');
      // bed
      s.bx(1.8, 0.3, 2.1, -1.7, 0, -0.9, '#8a6a4a');
      s.bx(1.7, 0.22, 2.0, -1.7, 0.3, -0.9, '#f2efe8');
      s.bx(1.72, 0.1, 1.2, -1.7, 0.5, -0.5, '#6e8fbf');
      for (let i = 0; i < 4; i++) s.bx(1.74, 0.115, 0.14, -1.7, 0.5, -0.9 + i * 0.28, i % 2 ? '#7d9cc6' : '#5f7fae');
      s.bx(0.62, 0.14, 0.4, -2.05, 0.52, -1.7, '#ffffff');
      s.bx(0.62, 0.14, 0.4, -1.4, 0.52, -1.7, '#f6dede');
      s.bx(1.9, 1.0, 0.08, -1.7, 0.3, -1.95, '#7a5a3a');
      // shelf + nightstand
      s.bx(0.9, 1.35, 0.32, 1.9, 0, -1.8, '#f6f4ee');
      for (const y of [0.3, 0.62, 0.94]) s.bx(0.86, 0.025, 0.3, 1.9, y, -1.8, '#d8d2c4');
      books(s, 1.5, 1.72, 0.32, -1.8, 0.26);
      books(s, 1.5, 1.8, 0.96, -1.8, 0.28);
      plant(s, 2.2, -1.8, 0.28, '#e8e2d4', '#3f7a3a', 1.35);
      s.bx(0.4, 0.45, 0.35, -0.45, 0, -1.8, '#d9b47c');
      s.cy(0.03, 0.03, 0.22, -0.45, 0.45, -1.8, '#2a2a2d', 6);
      s.cy(0.12, 0.17, 0.2, -0.45, 0.67, -1.8, '#fdf0cf');
      // rug, plant, art
      s.cy(0.9, 0.9, 0.015, 1.1, 0, -0.2, '#e8c4b8', 16);
      plant(s, 2.3, -0.9, 0.7, '#b5653c', '#3f7a3a');
      frame(s, 0.55, 0.7, -0.4, 1.35, -1.97, '#f7f7f4', ['#e8d6c0', '#6e8fbf', '#e8a05a']);
      frame(s, 0.45, 0.6, 0.55, 1.5, -1.97, '#2a2a2d', ['#f1e7d6', '#b5483a', '#d8b04a']);
      frame(s, 0.4, 0.5, 1.2, 1.9, -1.97, '#f7f7f4', ['#cfe0e8', '#4c7a8a']);
      stringLights(s, -2.6, 2.6, 2.35, -1.93, ['#ffd88a', '#ffb7c5', '#ffe9b0'], 0.18);
      s.glow(0.9, 1.2, 0.04, -2.67, 0.85, 0.2, '#f3fbff', 0).rotation.y = Math.PI / 2; // window on the left wall
      s.point('#ffcf8a', 1.2, -0.45, 1.0, -1.6, 5);
      chair(s, '#d96f7d');
      desk(s, '#f6f4ee', '#c9c9c6');
      mug(s, -0.55, 0.62, '#f2c46d');
    },
  },
  {
    // 1 ---------------------------------------------------------------- kitchen
    label: 'Küchentisch',
    bg: '#f1e8d6',
    hemi: ['#ffffff', '#e8dcc4', 1.2],
    key: ['#fff6e6', 1.7, [3, 5, 3]],
    build(s) {
      s.room('#f1e8d6', '#b9a58c', '#faf6ee');
      for (let i = -7; i < 7; i++) for (let j = 0; j < 7; j++) if ((i + j) % 2) s.wall(0.5, 0.012, 0.5, i * 0.5 + 0.25, 0, 1.4 - j * 0.5, '#e8e2d4');
      // counter + tiles
      s.bx(5.2, 0.88, 0.62, 0, 0, -1.65, '#e6dccb');
      s.bx(5.2, 0.05, 0.66, 0, 0.88, -1.65, '#6a5a4a');
      for (let i = 0; i < 18; i++) for (let j = 0; j < 3; j++) s.bx(0.29, 0.29, 0.01, -2.55 + i * 0.3, 0.93 + j * 0.3, -1.96, (i + j) % 2 ? '#ffffff' : '#bcd6d4');
      // window
      s.bx(1.5, 1.1, 0.03, 0, 1.0, -1.95, '#7a5a3a');
      s.glow(1.4, 1.0, 0.02, 0, 1.05, -1.93, '#cfeeff');
      s.bx(1.4, 0.04, 0.05, 0, 1.52, -1.92, '#7a5a3a');
      s.bx(0.04, 1.0, 0.05, 0, 1.05, -1.92, '#7a5a3a');
      plant(s, -0.4, -1.65, 0.3, '#e8e2d4', '#4c8a3a', 0.93);
      // upper cabinets
      for (const x of [-2.1, -1.45, 1.55, 2.2]) {
        s.bx(0.62, 0.7, 0.34, x, 1.55, -1.8, '#6f9a7c');
        s.bx(0.04, 0.2, 0.02, x + 0.22, 1.7, -1.62, '#e8e2d4');
      }
      // fridge
      s.bx(0.85, 1.95, 0.7, 2.2, 0, -1.45, '#e9eef0');
      s.bx(0.03, 0.5, 0.04, 1.84, 1.2, -1.08, '#9a9c9f');
      for (const [i, c] of ['#e04c4c', '#f2c43a', '#4c8ae0'].entries()) s.bx(0.07, 0.07, 0.02, 2.05 + i * 0.12, 1.5, -1.09, c);
      // stove + pans
      s.bx(0.7, 0.04, 0.5, -1.7, 0.9, -1.65, '#2a2a2d');
      s.cy(0.17, 0.17, 0.09, -1.85, 0.94, -1.65, '#4a4d55');
      s.bx(0.4, 0.04, 0.04, -1.55, 0.94, -1.65, '#2a2a2d');
      s.bx(1.4, 0.03, 0.03, -2.0, 1.45, -1.9, '#9a9c9f');
      for (let i = 0; i < 3; i++) {
        s.bx(0.012, 0.22, 0.012, -2.3 + i * 0.3, 1.2, -1.9, '#2a2a2d');
        s.cy(0.11, 0.11, 0.03, -2.3 + i * 0.3, 1.0, -1.89, i % 2 ? '#b5653c' : '#4a4d55');
      }
      // dining table = desk, with fruit bowl + teapot
      desk(s, '#c8935a', '#7a4f2c', 1.8);
      s.cy(0.12, 0.08, 0.06, -0.6, 0.74, 0.62, '#f2eee8');
      s.ball(0.045, -0.64, 0.78, 0.6, '#e8802a');
      s.ball(0.045, -0.56, 0.78, 0.64, '#c93a3a');
      s.ball(0.045, -0.6, 0.82, 0.62, '#e6c43a');
      s.cy(0.06, 0.07, 0.1, 0.55, 0.74, 0.7, '#3f7a8c');
      s.bx(0.08, 0.04, 0.03, 0.64, 0.82, 0.7, '#3f7a8c');
      chair(s, '#a9733f', 0.7);
      s.point('#fff3d8', 0.8, 0, 2.0, -0.5, 6);
    },
  },
  {
    // 2 ---------------------------------------------------------------- couch
    label: 'Wohnzimmer-Sofa',
    bg: '#e9d9c9',
    hemi: ['#fff6ea', '#cdb79a', 1.05],
    key: ['#ffe9cc', 1.4, [-3, 5, 3]],
    build(s) {
      s.room('#e9d9c9', '#8a7358', '#f6efe4');
      s.cy(1.6, 1.6, 0.015, 0, 0, 0.5, '#c0675a', 18);
      s.cy(1.2, 1.2, 0.018, 0, 0, 0.5, '#e8d6bc', 18);
      // sofa (the person sits on it)
      const sofa = '#52707c';
      s.bx(2.3, 0.34, 0.95, 0, 0, -0.2, sofa);
      s.bx(2.3, 0.75, 0.24, 0, 0.3, -0.72, sofa);
      for (const x of [-1.15, 1.15]) s.bx(0.24, 0.6, 1.0, x, 0, -0.2, '#46636f');
      for (const [x, c] of [[-0.85, '#e8a05a'], [0.9, '#f2e4c9'], [-0.55, '#c9675a']] as const) s.bx(0.4, 0.38, 0.12, x, 0.34, -0.55, c);
      s.bx(0.9, 0.04, 0.6, 0.85, 0.34, -0.1, '#e8d6bc'); // folded blanket
      // living room behind
      s.bx(2.2, 0.55, 0.45, -1.1, 0, -1.7, '#5a4030'); // tv unit
      s.bx(1.3, 0.75, 0.05, -1.1, 0.7, -1.7, '#17181c'); // tv
      s.glow(1.2, 0.65, 0.02, -1.1, 0.75, -1.66, '#2b4a6e');
      s.bx(1.0, 2.1, 0.35, 1.8, 0, -1.8, '#6a4a30');
      for (const y of [0.35, 0.75, 1.15, 1.55]) {
        s.bx(0.96, 0.025, 0.33, 1.8, y, -1.8, '#4a3020');
        books(s, 1.38, 1.7, y + 0.025, -1.8, 0.3);
      }
      s.cy(0.02, 0.02, 1.5, -2.3, 0, -1.2, '#2a2a2d', 6);
      s.cy(0.2, 0.28, 0.3, -2.3, 1.4, -1.2, '#fdf0cf');
      s.glow(0.3, 0.04, 0.3, -2.3, 1.38, -1.2, '#ffe2a0');
      s.point('#ffd9a0', 1.4, -2.2, 1.6, -1.0, 6);
      plant(s, -0.1, -1.8, 0.8, '#3a3a3c', '#3f7a3a', 0.0);
      frame(s, 0.9, 0.6, -1.1, 1.55, -1.97, '#2a2a2d', ['#d8c8b0', '#c9675a', '#52707c']);
      frame(s, 0.5, 0.7, 0.55, 1.5, -1.97, '#c8935a', ['#f2eee8', '#8fb3a0', '#e8a05a']);
      // low table with laptop work-spot
      desk(s, '#c8a574', '#7a4f2c', 1.3, 0.62);
      s.cy(0.12, 0.08, 0.06, -0.45, 0.66, 0.62, '#f2eee8');
      mug(s, 0.5, 0.65, '#8fb3a0', 0.66);
    },
  },
  {
    // 3 ---------------------------------------------------------------- balcony
    label: 'Balkon',
    bg: '#a8d8f5',
    hemi: ['#d8efff', '#c9b79a', 1.5],
    key: ['#fff4d6', 2.4, [-4, 6, 3]],
    build(s) {
      // deck + brick wall left, open air behind the railing
      for (let i = 0; i < 14; i++) s.wall(0.5, 0.06, 5, -3.2 + i * 0.5, -0.06, -0.3, i % 2 ? '#a67c52' : '#9a7048');
      s.wall(0.15, 3.4, 6, -2.7, 0, -0.2, '#b46a55');
      for (let j = 0; j < 10; j++) for (let i = 0; i < 6; i++) s.wall(0.02, 0.01, 0.55, -2.62, 0.1 + j * 0.3 + (i % 2) * 0.1, -1.9 + i * 0.7, '#8a4a3a');
      s.bx(0.05, 1.1, 0.9, -2.62, 0.9, -0.6, '#e8e2d4'); // window frame on the brick
      s.glow(0.02, 0.95, 0.75, -2.6, 0.97, -0.6, '#cfeeff');
      // railing
      s.bx(5.4, 0.05, 0.06, 0, 1.0, -1.4, '#2c2f33');
      s.bx(5.4, 0.04, 0.04, 0, 0.1, -1.4, '#2c2f33');
      for (let x = -2.5; x <= 2.5; x += 0.25) s.bx(0.025, 0.95, 0.025, x, 0.08, -1.4, '#2c2f33');
      // planters
      for (const x of [-1.6, -0.5, 1.5]) {
        s.bx(0.8, 0.24, 0.24, x, 0.0, -1.2, '#8a5a3a');
        for (let i = 0; i < 6; i++) s.ball(0.11, x - 0.32 + i * 0.13, 0.22, -1.2, i % 2 ? '#4f9244' : '#3f7a3a', 1.1);
        for (let i = 0; i < 3; i++) s.ball(0.05, x - 0.25 + i * 0.25, 0.42, -1.2, pick(['#e87a9c', '#f2c43a', '#ffffff']));
      }
      // sun, skyline, parasol
      s.glow(0.7, 0.7, 0.02, -2.0, 3.0, -7.5, '#fff6c0');
      for (let i = 0; i < 12; i++) {
        const h = 1.5 + rnd() * 4;
        s.glow(0.9, h, 0.3, -5 + i * 0.95, 0, -8 - rnd() * 2, pick(['#9fb8d0', '#8aa6c2', '#b3c8dc']));
      }
      s.cy(0.03, 0.03, 2.1, 1.7, 0, -0.2, '#e8e2d4', 6);
      s.cy(0.02, 1.15, 0.45, 1.7, 2.0, -0.2, '#e8645a', 10);
      s.cy(0.02, 0.6, 0.45, 1.7, 2.0, -0.2, '#f6f1e6', 10);
      s.cy(0.0, 0.01, 0.02, 1.7, 2.45, -0.2, '#e8e2d4', 6);
      // wicker chair + bistro table
      s.bx(0.55, 0.08, 0.5, 0, 0.32, 0.02, '#c9a574');
      s.bx(0.6, 0.9, 0.08, 0, 0.35, -0.3, '#b98e56');
      s.cy(0.03, 0.03, 0.3, 0, 0.02, 0, '#2a2a2d', 6);
      desk(s, '#f6f4ee', '#2c2f33', 1.5);
      mug(s, -0.5, 0.62, '#f2c46d');
      s.cy(0.07, 0.07, 0.01, 0.6, 0.74, 0.65, '#fff');
      s.cy(0.03, 0.03, 0.16, 0.6, 0.75, 0.65, '#ffffff', 6);
      s.ball(0.04, 0.6, 0.9, 0.65, '#e87a9c');
    },
  },
  {
    // 4 ---------------------------------------------------------------- study
    label: 'Arbeitszimmer',
    bg: '#2a3c30',
    hemi: ['#ffe6c4', '#3a2a20', 0.55],
    key: ['#ffd9a0', 1.0, [-3, 5, 3]],
    build(s) {
      s.room('#35503f', '#6b4a33', '#2a3c30');
      s.bx(7, 0.9, 0.06, 0, 0, -1.95, '#4a3020');
      s.bx(0.06, 0.9, 6, -2.65, 0, -0.2, '#4a3020');
      s.bx(0.06, 0.9, 6, 2.65, 0, -0.2, '#4a3020');
      s.bx(2.8, 0.02, 1.9, 0, 0, 0.2, '#8a2f2f');
      s.bx(2.55, 0.025, 1.65, 0, 0, 0.2, '#c9a85c');
      s.bx(2.4, 0.03, 1.5, 0, 0, 0.2, '#7a2a2a');
      // bookshelves
      for (const x of [-1.7, 1.7]) {
        s.bx(1.8, 2.5, 0.38, x, 0, -1.78, '#4a3020');
        for (const y of [0.1, 0.55, 1.0, 1.45, 1.9]) {
          s.bx(1.7, 0.03, 0.36, x, y, -1.78, '#3a2418');
          books(s, x - 0.8, x + 0.8, y + 0.03, -1.78, 0.36);
        }
      }
      // painting + sconces
      frame(s, 1.0, 0.7, -0.5, 1.45, -1.97, '#c9a85c', ['#5a7a52', '#e8d6a0', '#2f3e5a']);
      for (const x of [-0.8, 0.8]) {
        s.bx(0.06, 0.2, 0.1, x, 1.7, -1.9, '#c9a85c');
        s.glow(0.08, 0.12, 0.08, x, 1.9, -1.88, '#ffe2a0');
      }
      // globe, armchair, lamp
      s.cy(0.15, 0.2, 0.05, 1.45, 0, -0.25, '#4a3020');
      s.cy(0.02, 0.02, 0.5, 1.45, 0.05, -0.25, '#c9a85c', 6);
      s.ball(0.24, 1.45, 0.55, -0.25, '#3f6e8c');
      s.ball(0.1, 1.5, 0.7, -0.05, '#5a7a52');
      s.bx(0.8, 0.5, 0.8, -1.4, 0, 0.0, '#7a3f24');
      s.bx(0.8, 0.5, 0.2, -1.4, 0.4, -0.35, '#8a4a2a');
      chair(s, '#7a3f24', 1.0);
      desk(s, '#4a3020', '#3a2418', 1.8);
      s.cy(0.08, 0.1, 0.03, -0.6, 0.74, 0.65, '#c9a85c');
      s.cy(0.015, 0.015, 0.28, -0.6, 0.77, 0.65, '#c9a85c', 6);
      s.bx(0.3, 0.12, 0.14, -0.6, 1.0, 0.65, '#2f6b2d');
      s.glow(0.24, 0.02, 0.1, -0.6, 0.99, 0.65, '#ffe2a0');
      s.point('#ffcf8a', 1.8, -0.6, 1.0, 0.8, 5);
      s.bx(0.28, 0.03, 0.2, 0.55, 0.74, 0.7, '#e8e2d4');
      mug(s, 0.7, 0.55, '#e8e2d4');
    },
  },
  {
    // 5 ---------------------------------------------------------------- attic
    label: 'Dachstock',
    bg: '#c9a574',
    hemi: ['#fff1d8', '#a88a5e', 1.15],
    key: ['#ffe6c0', 1.5, [-3, 5, 3]],
    build(s) {
      s.wall(7, 0.1, 6, 0, -0.1, -0.2, '#b88b5a'); // floor
      for (let i = 0; i < 10; i++) s.wall(0.02, 0.01, 6, -2.5 + i * 0.55, 0, -0.2, '#8a6a42');
      s.wall(7, 3.6, 0.1, 0, 0, -2, '#efe4d2'); // gable wall
      // sloped roof planes (rotated boxes)
      const slope = (sign: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.08, 6), new THREE.MeshLambertMaterial({ color: '#c9a574' }));
        m.position.set(sign * 1.5, 2.25, -0.2);
        m.rotation.z = -sign * 0.69;
        m.receiveShadow = true;
        s.group.add(m);
      };
      slope(-1);
      slope(1);
      s.wall(0.6, 0.6, 6, 0, 3.15, -0.2, '#c9a574'); // ridge cap
      for (const z of [-1.2, 0.2, 1.4]) for (const sign of [-1, 1]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.1, 0.12), new THREE.MeshLambertMaterial({ color: '#7a4f2c' }));
        b.position.set(sign * 1.45, 2.2, z);
        b.rotation.z = -sign * 0.69;
        s.group.add(b);
      }
      // skylight in the right slope
      const sky = s.glow(1.2, 0.04, 1.0, 1.55, 2.0, -0.8, '#e2f3ff', -0.69);
      sky.position.set(1.7, 2.0, -0.8);
      // knee walls
      s.wall(0.1, 1.0, 6, -2.9, 0, -0.2, '#efe4d2');
      s.wall(0.1, 1.0, 6, 2.9, 0, -0.2, '#efe4d2');
      s.cy(1.0, 1.0, 0.015, 0.2, 0, 0.3, '#c9675a', 16);
      // beanbag + boxes + books
      s.ball(0.55, -1.9, -0.1, -0.7, '#d9623f', 0.8);
      s.ball(0.3, -1.6, -0.1, -0.2, '#e8a05a', 0.7);
      s.bx(0.7, 0.5, 0.5, 1.9, 0, -1.55, '#b89468');
      s.bx(0.6, 0.45, 0.5, 2.1, 0.5, -1.55, '#a88458');
      s.bx(0.5, 0.4, 0.4, 1.4, 0, -1.65, '#b89468');
      for (let i = 0; i < 5; i++) s.bx(0.4, 0.05, 0.28, -0.9, i * 0.05, -1.7, pick(BOOKS));
      s.cy(0.05, 0.05, 0.4, -0.9, 0.25, -1.7, '#f2eee8', 8);
      plant(s, -2.4, -1.5, 0.8, '#e8e2d4', '#3f7a3a');
      frame(s, 0.6, 0.45, -0.7, 1.3, -1.97, '#2a2a2d', ['#f1e7d6', '#e8a05a', '#5a7a52']);
      frame(s, 0.4, 0.55, 0.5, 1.6, -1.97, '#c8935a', ['#cfe0e8', '#c9675a']);
      stringLights(s, -2.5, 2.5, 2.9, -1.9, ['#ffd88a', '#ffe9b0', '#ffc27a'], 0.2);
      s.point('#ffd6a0', 1.2, 0, 2.4, -1.0, 6);
      s.point('#cfe6ff', 0.8, 1.7, 2.0, -0.5, 5);
      chair(s, '#6a4a30', 0.7);
      desk(s, '#d9b47c', '#7a4f2c', 1.7);
      mug(s, -0.55, 0.62, '#4c7a8a');
    },
  },
  {
    // 6 ---------------------------------------------------------------- scandinavian studio
    label: 'Skandi-Studio',
    bg: '#f7f6f2',
    hemi: ['#ffffff', '#e8e2d4', 1.5],
    key: ['#ffffff', 1.6, [-4, 5, 3]],
    build(s) {
      s.room('#f7f6f2', '#dcc7a5', '#ffffff');
      s.glow(0.05, 1.9, 2.4, -2.68, 0.6, -0.3, '#ffffff');
      s.bx(0.06, 2.0, 0.06, -2.66, 0.55, -0.3, '#2a2a2d');
      s.bx(0.06, 0.06, 2.5, -2.66, 1.6, -0.3, '#2a2a2d');
      s.bx(0.06, 0.06, 2.5, -2.66, 0.55, -0.3, '#2a2a2d');
      // monstera
      s.cy(0.2, 0.15, 0.3, -2.0, 0, -1.4, '#e8e2d4');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const r = 0.15 + rnd() * 0.3;
        s.bx(0.38, 0.03, 0.3, -2.0 + Math.cos(a) * r, 0.7 + rnd() * 0.8, -1.4 + Math.sin(a) * r, pick(['#3f7a3a', '#4f9244', '#2f6b2d']));
        s.bx(0.02, 0.5 + rnd() * 0.3, 0.02, -2.0 + Math.cos(a) * r * 0.5, 0.3, -1.4 + Math.sin(a) * r * 0.5, '#4a6a3a');
      }
      // shelf, art, pendant
      s.bx(1.4, 0.04, 0.22, 0.9, 1.4, -1.88, '#c9a574');
      s.cy(0.08, 0.06, 0.2, 0.5, 1.44, -1.88, '#e8c4b8');
      s.cy(0.05, 0.07, 0.14, 0.75, 1.44, -1.88, '#cfe0e8');
      s.bx(0.3, 0.05, 0.2, 1.1, 1.44, -1.88, '#2a2a2d');
      s.cy(0.0, 0.1, 0.1, 1.4, 1.44, -1.88, '#f2c46d');
      s.bx(0.5, 0.7, 0.03, -0.9, 1.4, -1.97, '#2a2a2d');
      s.bx(0.44, 0.64, 0.035, -0.9, 1.43, -1.97, '#f7f6f2');
      s.ball(0.15, -0.9, 1.5, -1.97, '#e8a05a');
      s.bx(0.42, 0.45, 0.03, 0.3, 1.9, -1.97, '#2a2a2d');
      s.bx(0.36, 0.39, 0.035, 0.3, 1.93, -1.97, '#cfe0e8');
      s.bx(0.02, 0.9, 0.02, 1.7, 1.9, -0.6, '#2a2a2d');
      s.cy(0.0, 0.3, 0.25, 1.7, 1.65, -0.6, '#ffffff', 16);
      s.glow(0.3, 0.02, 0.3, 1.55, 1.64, -0.75, '#fff3d0');
      // yoga ball + low sideboard
      s.ball(0.38, 1.95, 0, -0.5, '#8fb3a0');
      s.bx(1.0, 0.5, 0.4, 0.2, 0, -1.78, '#c9a574');
      s.bx(0.9, 0.02, 0.3, 0.2, 0.5, -1.78, '#f6f4ee');
      books(s, -0.2, 0.2, 0.52, -1.78, 0.24);
      s.point('#fff6e0', 0.7, 0.5, 2.2, -0.2, 7);
      // sit-stand desk (white, steel legs) and mesh chair
      chair(s, '#3a3d42', 0.75);
      desk(s, '#ffffff', '#b9bcc0', 1.7);
      s.bx(0.3, 0.025, 0.2, 0.55, 0.74, 0.72, '#f2eee8');
      s.cy(0.06, 0.05, 0.12, 0.6, 0.75, 0.74, '#e8c4b8');
      s.cy(0.02, 0.02, 0.2, 0.6, 0.86, 0.74, '#4f9244', 6);
      mug(s, -0.55, 0.65, '#ffffff');
    },
  },
  {
    // 7 ---------------------------------------------------------------- gamer den
    label: 'Gamer-Höhle',
    bg: '#1a1630',
    hemi: ['#6a5aa8', '#1a1630', 0.7],
    key: ['#a8a0e8', 0.5, [-3, 5, 3]],
    build(s) {
      s.room('#1c1836', '#17141f', '#14121f');
      // led strips + neon
      s.glow(5.2, 0.05, 0.04, 0, 2.55, -1.93, '#ff3fa4');
      s.glow(5.2, 0.05, 0.04, 0, 0.12, -1.93, '#27d7ff');
      s.glow(0.05, 2.5, 0.04, -2.6, 0.1, -1.93, '#9a5aff');
      s.glow(0.05, 2.5, 0.04, 2.6, 0.1, -1.93, '#9a5aff');
      const neon = '#ff3fa4';
      s.glow(1.1, 0.05, 0.04, 0.0, 2.0, -1.94, neon);
      s.glow(1.1, 0.05, 0.04, 0.0, 1.5, -1.94, neon);
      s.glow(0.05, 0.55, 0.04, -0.52, 1.5, -1.94, neon);
      s.glow(0.05, 0.55, 0.04, 0.52, 1.5, -1.94, neon);
      s.glow(0.5, 0.05, 0.04, 0.0, 1.76, -1.94, '#27d7ff');
      // hex panels
      for (let i = 0; i < 5; i++) s.glow(0.3, 0.3, 0.02, -2.3 + (i % 3) * 0.34, 1.1 + Math.floor(i / 3) * 0.3 + (i % 2) * 0.1, -1.95, pick(['#27d7ff', '#9a5aff', '#2ee59d']));
      // shelf with figures
      s.bx(1.6, 0.04, 0.3, 1.6, 1.3, -1.82, '#2a2a38');
      s.bx(1.6, 0.04, 0.3, 1.6, 0.8, -1.82, '#2a2a38');
      for (let i = 0; i < 7; i++) {
        const c = pick(['#e04c4c', '#27d7ff', '#f2c43a', '#9a5aff', '#2ee59d']);
        s.bx(0.1, 0.18 + rnd() * 0.12, 0.1, 0.95 + i * 0.2, 1.34, -1.82, c);
        if (i % 2) s.bx(0.1, 0.16 + rnd() * 0.1, 0.1, 0.95 + i * 0.2, 0.84, -1.82, c);
      }
      // pc tower with rgb
      s.bx(0.28, 0.5, 0.5, 2.25, 0, -0.7, '#17181c');
      s.glow(0.02, 0.4, 0.4, 2.1, 0.05, -0.7, '#9a5aff');
      s.glow(0.12, 0.02, 0.02, 2.25, 0.4, -0.45, '#27d7ff');
      s.bx(0.5, 0.3, 0.5, -2.2, 0, -1.5, '#2a2a38'); // beanbag stand-in: speaker + sub
      s.bx(0.25, 0.5, 0.25, -2.2, 0.3, -1.5, '#17181c');
      frame(s, 0.55, 0.75, -1.2, 0.9, -1.97, '#0e0c18', ['#2a1a4a', '#ff3fa4', '#27d7ff']);
      // gaming chair (swivels)
      s.chair = s.piece(new THREE.Vector3(0, 0, 0), () => {
        s.bx(0.55, 0.08, 0.55, 0, 0.32, 0.02, '#17181c');
        s.bx(0.6, 1.0, 0.1, 0, 0.4, -0.32, '#17181c');
        s.bx(0.12, 0.95, 0.12, -0.3, 0.4, -0.3, '#e04c4c');
        s.bx(0.12, 0.95, 0.12, 0.3, 0.4, -0.3, '#e04c4c');
        s.bx(0.3, 0.2, 0.1, 0, 1.4, -0.32, '#17181c');
        s.cy(0.03, 0.03, 0.3, 0, 0.02, 0, '#2a2a2d', 6);
        s.cy(0.28, 0.28, 0.03, 0, 0, 0, '#17181c', 5);
      });
      desk(s, '#17181c', '#2a2a38', 1.8);
      s.glow(1.2, 0.012, 0.03, 0, 0.7, 0.99, '#ff3fa4'); // desk edge led
      s.bx(0.7, 0.01, 0.3, 0.05, 0.74, 0.55, '#2a2a38'); // mouse pad
      s.cy(0.05, 0.04, 0.12, -0.7, 0.74, 0.65, '#2ee59d'); // energy can
      s.cy(0.045, 0.045, 0.01, -0.7, 0.86, 0.65, '#ffffff');
      s.point('#ff3fa4', 2.2, -1.6, 1.6, -1.2, 6);
      s.point('#27d7ff', 2.2, 1.6, 1.6, -1.2, 6);
    },
  },
  {
    // 8 ---------------------------------------------------------------- Thailand deck chair (Marco)
    label: 'Liegestuhl, Thailand',
    bg: '#8fd8f5',
    hemi: ['#e2f6ff', '#f0dca8', 1.6],
    key: ['#fff1c8', 2.6, [-3, 6, 4]],
    recline: -0.75,
    lapCam: true,
    drink: 'cocktail',
    sea: true,
    build(s) {
      // sand, sea, islands, sun
      s.wall(14, 0.1, 9, 0, -0.1, -1.5, '#f0dca8');
      for (let i = 0; i < 14; i++) s.wall(0.6 + rnd(), 0.01, 0.5, -5 + i * 0.8, 0, -1.2 + rnd() * 2.5, '#e6cf94');
      s.glow(24, 0.3, 14, 0, -0.1, -12, '#2fb8c9');
      s.glow(24, 0.02, 6, 0, 0.1, -4.4, '#5fd6d0');
      for (let i = 0; i < 6; i++) s.glow(2 + rnd() * 2, 0.02, 0.1, -4 + i * 1.6, 0.12, -3.4 - rnd(), '#ffffff');
      s.glow(3.2, 0.9, 0.3, -5, 0.2, -15, '#4f8a78');
      s.glow(2.4, 1.4, 0.3, 4.5, 0.2, -14, '#5a9684');
      s.glow(1.0, 1.0, 0.02, 2.2, 3.4, -16, '#fff6c0');
      // longtail boat: now and then motors across the bay, alternating direction; it turns round only out of sight
      // Thai longtail (rua hang yao): long slim wooden hull rising to a high bow with ribbons on the bow post,
      // a striped canopy, and the car-engine motor at the stern on its long shaft into the water. Bow = +x.
      const boat = s.piece(new THREE.Vector3(0, 0.1, -3.2), () => {
        const z = -3.2;
        const len = 2.8;
        for (let i = 0; i < 14; i++) {
          const u = i / 13; // 0 = stern, 1 = bow
          const x = -len / 2 + u * len;
          const rise = u > 0.7 ? ((u - 0.7) / 0.3) ** 2 * 0.35 : 0; // bow sweeps up
          const beam = 0.42 * Math.sin(Math.PI * Math.min(0.97, 0.12 + u * 0.85)); // narrow at both ends
          s.bx(len / 13 + 0.01, 0.2, beam, x, 0.05 + rise, z, '#7a4f2c'); // hull
          s.bx(len / 13 + 0.01, 0.04, beam + 0.02, x, 0.2 + rise, z, '#2f7fb8'); // painted gunwale stripe
          if (i > 2 && i < 10) s.bx(0.04, 0.03, beam * 0.8, x, 0.18, z, '#5a3a22'); // thwarts
        }
        // bow post with garlands
        s.bx(0.06, 0.32, 0.06, len / 2 + 0.02, 0.4, z, '#7a4f2c');
        ['#e8645a', '#f2d230', '#2ee59d', '#e87a9c', '#27a9c9'].forEach((c, i) => s.bx(0.1 - i * 0.008, 0.05, 0.08, len / 2 - 0.02 - i * 0.01, 0.62 - i * 0.05, z, c));
        // canopy on four posts, red/white striped roof
        for (const px of [-0.55, 0.35]) for (const pz of [-0.14, 0.14]) s.bx(0.03, 0.42, 0.03, px, 0.2, z + pz, '#d8d2c4');
        for (let i = 0; i < 6; i++) s.bx(0.16, 0.03, 0.4, -0.55 + 0.075 + i * 0.15, 0.62, z, i % 2 ? '#ffffff' : '#e8645a');
        // engine block on the stern and the long tail shaft dipping into the water behind
        s.bx(0.3, 0.2, 0.22, -len / 2 + 0.05, 0.25, z, '#4a4d55');
        s.bx(0.1, 0.08, 0.1, -len / 2 + 0.05, 0.47, z, '#9a9da2');
        for (let i = 0; i < 6; i++) s.bx(0.14, 0.03, 0.03, -len / 2 - 0.12 - i * 0.12, 0.27 - i * 0.045, z, '#2a2a2d');
        s.bx(0.06, 0.1, 0.06, -len / 2 - 0.85, 0.0, z, '#9a9da2'); // propeller
      });
      const BOAT = { cycle: 55, start: 20, cross: 12, edge: 9 }; // seconds into the cycle it sets off, crossing time, |x| out of view
      s.ticks.push((t) => {
        const n = Math.floor(t / BOAT.cycle);
        const k = (t % BOAT.cycle - BOAT.start) / BOAT.cross; // 0..1 while crossing
        const crossing = k >= 0 && k <= 1;
        boat.visible = crossing;
        if (!crossing) return;
        const dir = n % 2 ? -1 : 1; // +x (bow first, the yellow cabin) or back the other way
        boat.position.set(-dir * BOAT.edge + dir * 2 * BOAT.edge * k, 0.1 + Math.sin(t * 1.3) * 0.02, -3.2);
        boat.rotation.set(Math.sin(t * 1.1) * 0.03, dir > 0 ? 0 : Math.PI, Math.sin(t * 0.9) * 0.04); // rocking on the swell
      });
      // palm trees
      // the one behind him is lower so its crown sits in the webcam picture
      for (const [x, pz, top, frond] of [[0, -2.3, 2.4, 1.85], [-1.9, 1.5, 3.0, 1.5]] as const) {
        for (let i = 0; i < top / 0.3; i++) s.bx(0.22 - i * 0.008, 0.3, 0.22 - i * 0.008, x, i * 0.3, pz, i % 2 ? '#8a6a42' : '#7a5a38');
        const cx = x;
        // the crown sways in the breeze around the top of the trunk
        const crown = s.piece(new THREE.Vector3(cx, top, pz), () => {
          s.ball(0.1, cx + 0.12, top - 0.2, pz + 0.1, '#6a4a30'); // coconuts
          s.ball(0.1, cx - 0.1, top - 0.22, pz - 0.1, '#6a4a30');
          s.ball(0.09, cx, top - 0.24, pz - 0.12, '#5a3e28');
        });
        crown.add(palmFronds(18, frond)); // the leaves themselves: smooth feathery fronds (in crown coordinates)
        const ph = x * 1.7;
        s.ticks.push((t) => crown.rotation.set(Math.sin(t * 0.5 + ph + 1) * 0.03, Math.sin(t * 0.3 + ph) * 0.06, Math.sin(t * 0.7 + ph) * 0.045));
      }
      // wooden deck chair (Liegestuhl) facing the camera, striped sling; he lies back in it
      const wood = '#b98e56';
      /** row of small boxes from (y0, z0) to (y1, z1) at x: a slanted bar in a blocky world */
      const bar = (x: number, w: number, y0: number, z0: number, y1: number, z1: number, c: Color, t = 0.05) => {
        const n = Math.max(2, Math.ceil(Math.hypot(y1 - y0, z1 - z0) / 0.06));
        for (let i = 0; i < n; i++) {
          const k = (i + 0.5) / n;
          s.bx(w, t, t + 0.03, x, y0 + (y1 - y0) * k - t / 2, z0 + (z1 - z0) * k, c);
        }
      };
      const sling: Array<[number, number]> = [[1.12, -0.82], [0.3, -0.02], [0.34, 0.5], [0.44, 0.66]]; // top bar, seat, front bar
      const stripe = ['#e8645a', '#ffffff', '#27a9c9', '#ffffff'];
      for (let i = 0; i < sling.length - 1; i++) {
        const [y0, z0] = sling[i];
        const [y1, z1] = sling[i + 1];
        const n = Math.ceil(Math.hypot(y1 - y0, z1 - z0) / 0.12);
        for (let j = 0; j < n; j++) bar(0, 0.8, y0 + ((y1 - y0) * j) / n, z0 + ((z1 - z0) * j) / n, y0 + ((y1 - y0) * (j + 1)) / n, z0 + ((z1 - z0) * (j + 1)) / n, stripe[(i * 3 + j) % 4], 0.03);
      }
      for (const x of [-0.43, 0.43]) {
        for (let i = 0; i < sling.length - 1; i++) bar(x, 0.05, sling[i][0], sling[i][1], sling[i + 1][0], sling[i + 1][1], wood); // side rails
        bar(x, 0.05, 1.12, -0.82, 0, -0.55, wood); // back legs
        bar(x, 0.05, 0.44, 0.66, 0, 0.72, wood); // front legs
        bar(x, 0.04, 0.3, -0.02, 0, 0.25, wood); // middle strut
      }
      s.bx(0.92, 0.05, 0.05, 0, 1.1, -0.82, wood); // top bar
      s.bx(0.92, 0.05, 0.05, 0, 0.42, 0.66, wood); // front bar
      s.bx(0.6, 0.1, 0.22, 0, 1.0, -0.72, '#ffffff'); // towel roll behind the head
      // no laptop to build: the view IS his laptop, on a stand over his lap (see HomeOffice.lapCam)
      s.webcam.fov = 72; // same lens as the desk laptops
      // coconut drink on a bamboo stool
      s.cy(0.14, 0.14, 0.45, 1.0, 0, 0.5, '#c9a574', 8);
      s.ball(0.075, 1.0, 0.45, 0.5, '#6a4a30');
      s.bx(0.012, 0.18, 0.012, 1.03, 0.58, 0.5, '#e8645a');
      s.bx(0.05, 0.05, 0.05, 1.05, 0.72, 0.5, '#e87a9c');
      // tropical plants + tiki torch + shells
      plant(s, 1.6, -0.4, 0.9, '#b5653c', '#3f9244');
      s.cy(0.03, 0.03, 1.4, 1.6, 0, 0.9, '#7a5a38', 6);
      s.glow(0.1, 0.16, 0.1, 1.6, 1.4, 0.9, '#ff9a2a');
      for (let i = 0; i < 4; i++) s.ball(0.05, -0.9 + i * 0.5, 0, 1.2 + rnd() * 0.5, pick(['#f4e4d0', '#e8a09a', '#f2f2ee']), 0.6);
    },
  },
];

export const HOME_LABELS = STYLES.map((s) => s.label);

const ACTIVITIES = ['type', 'type', 'type', 'sip', 'sip', 'stretch', 'think', 'call', 'wave', 'away', 'yawn', 'game'] as const satisfies readonly ('type' | HomeBreak)[];
type Activity = (typeof ACTIVITIES)[number] | 'vape' | 'spit' | SignatureMove | AdhdExtra;
/**
 * Extra breaks for restless people (TeamMember.adhd), one ticket each in the draw: a fidget spinner, a spin on the
 * office chair, a snack run out of the picture, pacing behind the desk.
 */
/** chair spin: share of the time spent rolling back (and in again), how far back */
const SPIN = { roll: 0.2, back: 0.4 };
const ADHD_EXTRAS = ['fidget', 'spin', 'snack', 'pace'] as const;
type AdhdExtra = (typeof ADHD_EXTRAS)[number];
/** snack run (seconds in): up, out of the picture, back with the snack, sat down, eating till the end */
const SNACK = { up: 0.6, out: 2.2, back: 3.4, in: 5.0, sat: 5.6 };
/** coffee haters' coffee break (seconds in): sip, spit it out, cup away, reach down for the can, drink, done */
const SPIT = { sip: 0.7, spit: 1.3, away: 2.0, grab: 2.7, drink: 3.3, done: 5.4 };
/** a signature move gets this many tickets in the break draw (out of ~12 normal ones): it happens only now and then */
const SIGNATURE_PICKS = 1;
/** share of people who wave into the webcam when they start working from home */
const GREET_CHANCE = 0.35;
/** where the cat stops, right in front of the lens (world, y = on the desk) */
const CAT_FRONT = { x: 0, z: 0.56 };
/** timeline of a catwalk (seconds): arrive, stand in the way, shoved at, gone, back on its spot */
const CATWALK = { arrive: 1.6, push: 2.6, shoved: 3.3, out: 3.9 };
/** vapers reach for it a lot more often at home, with only short pauses in between */
const VAPE_PICKS = 12;
const VAPE_PAUSE: [number, number] = [2, 4.5];
/** one vape: hand at the mouth for a long drag (seconds into the activity), then down and the cloud */
const VAPE_DRAG: [number, number] = [0.6, 3.4];
/** room haze for vapers: what never quite clears, what one exhale adds, the ceiling */
const HAZE = { base: 0.17, puff: 0.06, max: 0.36 };
const ACTIVITY_LABEL: Record<Activity, string> = {
  type: 'Tippt',
  sip: 'Kaffeepause',
  stretch: 'Streckt sich',
  think: 'Denkt nach',
  call: 'Im Telefonat',
  wave: 'Winkt',
  away: 'Schaut weg',
  yawn: 'Gähnt',
  game: 'Tippt (angeblich)',
  swim: 'Geht schwimmen',
  vape: 'Dampft',
  spit: 'Kaffee? Nein danke',
  fidget: 'Fidget-Spinner',
  spin: 'Dreht eine Runde',
  snack: 'Holt einen Snack',
  pace: 'Läuft herum',
  curl: 'Trainiert',
  catwalk: 'Katze im Bild',
};
const ACTIVITY_TIME: Record<Activity, [number, number]> = {
  type: [4, 10],
  sip: [2.6, 3.6],
  stretch: [2.4, 3.2],
  think: [2.5, 4],
  call: [5, 10],
  wave: [2, 3],
  away: [1.6, 2.6],
  yawn: [2.4, 3.2],
  game: [6, 12],
  swim: [22, 28],
  vape: [6, 7],
  spit: [6.2, 6.8],
  fidget: [4, 7],
  spin: [2.8, 3.4],
  snack: [10, 11],
  pace: [7, 9],
  curl: [8, 12],
  catwalk: [6.5, 7.5],
};

interface Occupant {
  rig: CharacterRig;
  pets: Array<{ rig: DogRig; spot: THREE.Vector3; yaw: number; onDesk: boolean }>;
  headset?: THREE.Object3D;
  /** activity props, shown only while needed: coffee mug in the left hand, game controller, open mouth */
  mug: THREE.Object3D;
  gamepad: THREE.Object3D;
  yawn: THREE.Object3D;
  dumbbell: THREE.Object3D;
  /** fidget spinner in the right fist (kept flat and spun every frame) */
  spinner: THREE.Object3D;
  /** coffee haters: the spat-out coffee droplets (in the body group) */
  spray?: THREE.Object3D;
  /** the same person in swimwear, swapped in out of sight for a swim */
  swimRig?: CharacterRig;
  /** prop-holding arm poses solved for this person's shoulders */
  held: HeldPoses;
}

const propMesh = (parts: THREE.BufferGeometry[]): THREE.Mesh => new THREE.Mesh(merge(parts), propMaterial);

/**
 * The drink in the left hand (kept upright every frame): a coffee cup (no handle, it would face away from the
 * camera) or, in the deck chair room, a cocktail with straw and umbrella. The room picks which one shows.
 */
function handMug(): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(0.12, -0.3, 0); // the fist holds the outer side, the drink sits towards the mouth
  const coffee = propMesh([cyl(0.055, 0.05, 0.12, 0, 0, 0.03, '#f2eee8'), cyl(0.045, 0.045, 0.01, 0, 0.06, 0.03, '#5a3a24')]);
  coffee.name = 'coffee';
  const cocktail = propMesh([
    cyl(0.05, 0.035, 0.13, 0, 0, 0.03, '#f2a03a'), // tall glass, sunset orange
    cyl(0.052, 0.052, 0.02, 0, 0.07, 0.03, '#f4e4d0'), // rim with froth
    cyl(0.03, 0.03, 0.02, 0.035, 0.075, 0.03, '#f2d230', 6), // pineapple slice
    box(0.012, 0.16, 0.012, -0.02, 0.12, 0.02, '#e8645a'), // straw
    cyl(0.005, 0.005, 0.12, 0.02, 0.12, 0.05, '#c9a574', 4), // umbrella stick
    cyl(0.0, 0.065, 0.035, 0.02, 0.18, 0.05, '#27a9c9', 8), // umbrella
  ]);
  cocktail.name = 'cocktail';
  const can = propMesh([
    cyl(0.034, 0.034, 0.07, 0, -0.03, 0.03, '#1f3f9a'), // blue lower half
    cyl(0.034, 0.034, 0.06, 0, 0.035, 0.03, '#c9ccd2'), // silver upper half
    cyl(0.028, 0.034, 0.012, 0, 0.071, 0.03, '#a8abb2'), // lid
    box(0.04, 0.035, 0.002, 0, 0.0, 0.065, '#d8243a'), // red emblem on the front
  ]);
  can.name = 'can';
  can.position.x = -0.03; // slimmer than the cup: closer in, so the fist still wraps it
  const snack = propMesh([
    box(0.11, 0.15, 0.035, 0, 0.02, 0.03, '#f2c43a'), // bag of crisps
    box(0.112, 0.035, 0.037, 0, 0.04, 0.03, '#e04c4c'), // label band
    box(0.11, 0.015, 0.02, 0, 0.1, 0.03, '#d8b030'), // crimped top
  ]);
  snack.name = 'snack';
  g.add(coffee, cocktail, can, snack);
  return g;
}

/** Where the controller sits (body coordinates) and where its grips end up after the tilt: the fists go there. */
const PAD = { at: new THREE.Vector3(0, 1.27, 0.4), grip: (side: number) => new THREE.Vector3(side * 0.1, 1.237, 0.35) };

/** Game controller held flat in both hands in front of the chest (in the body group). */
function gamepad(): THREE.Object3D {
  const g = new THREE.Group();
  const body = '#2a2c33';
  g.add(propMesh([
    box(0.24, 0.045, 0.1, 0, 0, 0, body),
    box(0.07, 0.05, 0.1, -0.1, -0.005, -0.06, body), // grips, towards the player
    box(0.07, 0.05, 0.1, 0.1, -0.005, -0.06, body),
    box(0.05, 0.012, 0.016, -0.065, 0.028, 0.005, '#15161a'), // d-pad
    box(0.016, 0.012, 0.05, -0.065, 0.028, 0.005, '#15161a'),
    box(0.022, 0.014, 0.022, 0.05, 0.03, 0.022, '#2ee59d'), // face buttons
    box(0.022, 0.014, 0.022, 0.08, 0.03, 0, '#e04c4c'),
    box(0.022, 0.014, 0.022, 0.05, 0.03, -0.022, '#27a9e0'),
    box(0.022, 0.014, 0.022, 0.02, 0.03, 0, '#f2c43a'),
    box(0.06, 0.02, 0.03, -0.09, 0.02, 0.055, '#15161a'), // shoulder buttons
    box(0.06, 0.02, 0.03, 0.09, 0.02, 0.055, '#15161a'),
  ]));
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), new THREE.MeshBasicMaterial({ color: '#27d7ff' }));
  led.position.set(0, 0.025, 0.045);
  g.add(led);
  g.position.copy(PAD.at);
  g.rotation.x = -0.5; // buttons face the player (looking down at it)
  return g;
}

/** Dumbbell in the right fist (forearm frame: hand 0.3 below the elbow), bar across the fist. */
function dumbbell(): THREE.Object3D {
  const iron = '#3a3d42';
  const m = propMesh([
    box(0.24, 0.03, 0.03, 0, 0, 0, '#9a9da2'), // bar
    box(0.04, 0.12, 0.12, -0.1, 0, 0, iron), // plates
    box(0.04, 0.12, 0.12, 0.1, 0, 0, iron),
    box(0.02, 0.09, 0.09, -0.135, 0, 0, iron),
    box(0.02, 0.09, 0.09, 0.135, 0, 0, iron),
  ]);
  m.position.set(0, -0.3, 0.02);
  m.visible = false;
  return m;
}

/** Fidget spinner held above the fist: three weighted lobes round a bearing. */
function fidgetSpinner(): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(0, -0.27, 0.07);
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  const parts: THREE.BufferGeometry[] = [cyl(0.022, 0.022, 0.02, 0, 0, 0, '#c9ccd2', 10)];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    parts.push(box(0.05, 0.014, 0.022, Math.cos(a) * 0.03, 0, Math.sin(a) * 0.03, '#27a9e0'));
    parts.push(cyl(0.02, 0.02, 0.018, Math.cos(a) * 0.06, 0, Math.sin(a) * 0.06, '#27a9e0', 10));
  }
  rotor.add(propMesh(parts));
  g.add(rotor);
  g.visible = false;
  return g;
}

/** Wide-open mouth over the normal one. */
function yawnMouth(): THREE.Object3D {
  const m = propMesh([box(0.11, 0.1, 0.02, 0, 0, 0, '#5a2a2a')]);
  m.position.set(0, 1.49, 0.215);
  return m;
}

const occupants = new Map<string, Occupant>();

function occupantOf(member: TeamMember, fresh = false): Occupant {
  let o = fresh ? undefined : occupants.get(member.id);
  if (o) return o;
  const rig = buildCharacter(member.homeLook ? { ...member.look, ...member.homeLook } : member.look);
  const pets: Occupant['pets'] = [];
  if (member.dog) pets.push({ rig: buildDog(member.dog), spot: new THREE.Vector3(-1.15, 0, 0.35), yaw: 0.5, onDesk: false });
  for (const [i, c] of (member.cats ?? []).entries()) pets.push({ rig: buildCat(c.kind), spot: new THREE.Vector3(i % 2 ? -0.6 : 0.55, 0.74, 0.45), yaw: i % 2 ? 0.5 : -0.4, onDesk: true }); // either side of the laptop
  o = { rig, pets, mug: handMug(), gamepad: gamepad(), yawn: yawnMouth(), dumbbell: dumbbell(), spinner: fidgetSpinner(), held: heldPoses(rig) };
  rig.elbowR.add(o.dumbbell, o.spinner);
  if (member.hatesCoffee) {
    o.spray = new THREE.Group();
    for (let i = 0; i < 9; i++) o.spray.add(propMesh([box(0.025, 0.025, 0.025, 0, 0, 0, i % 2 ? '#5a3a24' : '#7a5236')]));
    o.spray.visible = false;
    rig.body.add(o.spray);
  }
  if (member.swimLook) o.swimRig = buildCharacter({ ...member.look, ...member.homeLook, ...member.swimLook });
  rig.elbowL.add(o.mug);
  rig.body.add(o.gamepad, o.yawn);
  occupants.set(member.id, o);
  return o;
}

function headset(): THREE.Object3D {
  const g = new THREE.Group();
  const m = (w: number, h: number, d: number, x: number, y: number, z: number, c: Color) => {
    const mesh = new THREE.Mesh(merge([box(w, h, d, x, y, z, c)]), propMaterial);
    g.add(mesh);
  };
  m(0.46, 0.05, 0.05, 0, 1.9, 0, '#17181c');
  m(0.08, 0.2, 0.2, -0.24, 1.7, 0, '#17181c');
  m(0.08, 0.2, 0.2, 0.24, 1.7, 0, '#17181c');
  m(0.03, 0.05, 0.05, -0.28, 1.7, 0, '#ff3fa4');
  m(0.03, 0.05, 0.05, 0.28, 1.7, 0, '#ff3fa4');
  m(0.02, 0.02, 0.2, -0.22, 1.6, 0.1, '#17181c');
  return g;
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Shoulder swing / spread and elbow bend of one arm (see HomeOffice.update). */
interface ArmPose {
  x: number;
  z: number;
  e: number;
  ez: number;
}
const ease = (cur: ArmPose, to: ArmPose, k: number) => {
  cur.x = lerp(cur.x, to.x, k);
  cur.z = lerp(cur.z, to.z, k);
  cur.e = lerp(cur.e, to.e, k);
  cur.ez = lerp(cur.ez, to.ez, k);
};
const tmpQ = new THREE.Quaternion();

/**
 * Arm poses that put something held in the hand on a fixed spot of the (same-sized) head or chest. Shoulder width
 * differs per person (build, strong arms), so they are solved per rig when somebody moves in, not hand-tuned.
 * Coordinates are in the body group (head centre at y 1.58, face front at z 0.18).
 */
interface HeldPoses {
  sip: ArmPose; // left hand: cup in front of the mouth
  think: ArmPose; // right hand on the crown
  vape: ArmPose; // right hand: mouthpiece at the corner of the mouth
  call: ArmPose; // right hand: phone at the ear
  gameL: ArmPose; // both hands on the controller
  gameR: ArmPose;
}

const HEAD = { x: 0.2, y0: 1.38, y1: 1.8, z: 0.2 };
const inHead = (p: THREE.Vector3, pad = 0) => Math.max(0, Math.min(HEAD.x + pad - Math.abs(p.x), p.y - (HEAD.y0 - pad), HEAD.y1 + pad - p.y, HEAD.z + pad - Math.abs(p.z)));
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/** Where `local` (a point in the forearm frame: elbow pivot, hand 0.3 below) ends up, and the elbow and hand on the way. */
function armFK(shoulder: THREE.Vector3, rx: number, rz: number, e: number, ez: number, local: THREE.Vector3) {
  const qa = _q.setFromEuler(_e.set(rx, 0, rz)).clone();
  const qe = new THREE.Quaternion().setFromEuler(_e.set(e, 0, ez));
  const elbow = new THREE.Vector3(0, -0.3, 0).applyQuaternion(qa).add(shoulder);
  const at = (p: THREE.Vector3) => _v.copy(p).applyQuaternion(qe).add(new THREE.Vector3(0, -0.3, 0)).applyQuaternion(qa).add(shoulder).clone();
  return { tool: at(local), hand: at(new THREE.Vector3(0, -0.3, 0)), mid: at(new THREE.Vector3(0, -0.15, 0)), elbow };
}

/**
 * Coarse grid, then two finer passes around the best: the shoulder swing / spread and elbow bend (optionally also
 * sideways) that bring `local` closest to `target` without the arm going through the head. Returns the pose in
 * ArmPose terms (z / ez positive = away from the body, whichever side).
 */
function solveArm(shoulder: THREE.Vector3, local: THREE.Vector3, target: THREE.Vector3, sideways = false): ArmPose {
  const side = Math.sign(shoulder.x) || 1;
  const cost = (x: number, z: number, e: number, ez: number) => {
    const k = armFK(shoulder, x, z * side, e, ez * side, local);
    return k.tool.distanceTo(target) + 3 * (inHead(k.hand, 0.04) + inHead(k.mid, 0.03) + inHead(k.elbow, 0.03));
  };
  let best = { x: -0.7, z: 0, e: -0.8, ez: 0, c: Infinity };
  const pass = (span: number, step: number, c0: typeof best | null) => {
    const r = (v: number, lo: number, hi: number) => (c0 ? [v - span, v + span] : [lo, hi]);
    const [x0, x1] = r(c0?.x ?? 0, -3, 0.3);
    const [z0, z1] = r(c0?.z ?? 0, -1.6, 3);
    const [e0, e1] = r(c0?.e ?? 0, -2.8, 0);
    const [w0, w1] = sideways ? r(c0?.ez ?? 0, 0, 1.8) : [0, 0];
    for (let x = x0; x <= x1; x += step)
      for (let z = z0; z <= z1; z += step)
        for (let e = e0; e <= e1; e += step)
          for (let ez = w0; ez <= w1 + 1e-9; ez += step) {
            const c = cost(x, z, e, ez);
            if (c < best.c) best = { x, z, e, ez, c };
          }
  };
  pass(0, sideways ? 0.2 : 0.12, null);
  pass(0.2, 0.05, { ...best });
  pass(0.06, 0.015, { ...best });
  return { x: best.x, z: best.z, e: best.e, ez: best.ez };
}

const heldCache = new Map<string, HeldPoses>();

/** Solved once per shoulder position (most people share a build). */
function heldPoses(rig: CharacterRig): HeldPoses {
  const sl = rig.armL.position.clone();
  const sr = rig.armR.position.clone();
  const key = `${sl.x.toFixed(3)}|${sr.x.toFixed(3)}|${sl.y.toFixed(3)}`;
  const hit = heldCache.get(key);
  if (hit) return hit;
  const hand = new THREE.Vector3(0, -0.3, 0);
  const poses: HeldPoses = {
    sip: solveArm(sl, new THREE.Vector3(0.12, -0.3, 0), new THREE.Vector3(0, 1.49, 0.27)),
    think: solveArm(sr, hand, new THREE.Vector3(0.08, 1.84, 0.04), true),
    vape: solveArm(sr, new THREE.Vector3(0, -0.395, 0), new THREE.Vector3(0.12, 1.49, 0.22)),
    call: solveArm(sr, new THREE.Vector3(-0.045, -0.3, 0), new THREE.Vector3(0.22, 1.56, 0.02)),
    // fist centre (a little above the end of the forearm) on each grip
    gameL: solveArm(sl, new THREE.Vector3(0, -0.26, 0), PAD.grip(-1)),
    gameR: solveArm(sr, new THREE.Vector3(0, -0.26, 0), PAD.grip(1)),
  };
  heldCache.set(key, poses);
  return poses;
}

/** Arm poses that depend on the desk height as well as the body: typing, and shoving a cat off the desk. */
interface DeskPoses {
  typeL: ArmPose;
  typeR: ArmPose;
  push: ArmPose; // right hand out to the cat standing in front of the webcam
}
const typeCache = new Map<string, DeskPoses>();

/**
 * Hands on the laptop keys at this desk height. The whole body scales with the person's height while desks
 * don't, so short people would type under the desk top and tall ones above it with a fixed pose.
 */
function deskPoses(rig: CharacterRig, desk: number): DeskPoses {
  const h = rig.root.scale.y;
  const sl = rig.armL.position;
  const sr = rig.armR.position;
  const key = `${sl.x.toFixed(3)}|${sr.x.toFixed(3)}|${h.toFixed(3)}|${desk.toFixed(3)}`;
  const hit = typeCache.get(key);
  if (hit) return hit;
  // world spot above the keys -> body coordinates (root scaled by h, body dropped onto the seat)
  const local = (x: number, y: number, z: number) => new THREE.Vector3(x / h, y / h + SIT_DROP, z / h);
  const hand = new THREE.Vector3(0, -0.3, 0);
  const poses: DeskPoses = {
    typeL: solveArm(sl.clone(), hand, local(-0.15, desk + 0.07, 0.6)),
    typeR: solveArm(sr.clone(), hand, local(0.15, desk + 0.07, 0.6)),
    push: solveArm(sr.clone(), hand, local(0.02, desk + 0.17, CAT_FRONT.z - 0.12)),
  };
  typeCache.set(key, poses);
  return poses;
}

/** Things held in the hands, by the activity that uses them. */
type HandProp = 'mug' | 'gamepad' | 'dumbbell' | 'vape' | 'phone' | 'spinner';
const PROP_OF: Partial<Record<Activity, HandProp>> = { sip: 'mug', spit: 'mug', snack: 'mug', fidget: 'spinner', game: 'gamepad', curl: 'dumbbell', vape: 'vape', call: 'phone' };
/** how far an arm still is from where it is heading (sum of joint angle differences) */
const armGap = (a: ArmPose, b: ArmPose) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z) + Math.abs(a.e - b.e) + Math.abs(a.ez - b.ez);

const mixPose = (a: ArmPose, b: ArmPose, k: number): ArmPose => ({ x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), e: lerp(a.e, b.e, k), ez: lerp(a.ez, b.ez, k) });
const X_AXIS = new THREE.Vector3(1, 0, 0);
const rand = ([a, b]: [number, number]) => a + Math.random() * (b - a);

/** One home office scene (one of the eight variants) with whoever is currently working there. */
export class HomeOffice {
  readonly style: HomeStyle;
  readonly scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(58, 1.6, 0.1, 40);
  private occupant: Occupant | null = null;
  private member: TeamMember | null = null;
  private clock = Math.random() * 50;
  private activity: Activity = 'wave';
  private actLeft = 2.2;
  private actT = 0;
  private yaw = 0;
  private poseL: ArmPose = { x: -0.7, z: 0, e: -0.8, ez: 0 };
  private poseR: ArmPose = { x: -0.7, z: 0, e: -0.8, ez: 0 };
  /** this occupant's typing pose at this room's desk (default for rooms without a desk) */
  private typeL: ArmPose = { x: -0.7, z: 0, e: -0.8, ez: 0 };
  private typeR: ArmPose = { x: -0.7, z: 0, e: -0.8, ez: 0 };
  private desk?: number;
  private chair?: THREE.Object3D;
  /** the room's own moving things (see Room.ticks) */
  private ticks: Array<(t: number) => void> = [];
  private push: ArmPose = { x: -1.4, z: 0, e: -0.2, ez: 0 };
  /** which of the desk cats walks into the picture next */
  private catTurn = 0;
  /** what is in the hands right now (lingers after the activity until the arms are back) */
  private prop: HandProp | null = null;
  private lean = 0;
  /** where the occupant's root sits (set when they sit down) */
  private seat = new THREE.Vector3();
  /** lap webcam: where it last sat on the lap (it stays put there while the laptop is in the sand) */
  private lapPos = new THREE.Vector3();
  private lapLook = new THREE.Vector3();
  private haze = HAZE.base;

  constructor(readonly variant: number) {
    this.style = STYLES[variant];
    this.scene.background = new THREE.Color(this.style.bg);
    seed = 7 + variant * 31;
    const set = new Room();
    this.style.build(set);
    set.finish();
    this.desk = set.desk;
    this.chair = set.chair;
    this.ticks = set.ticks;
    this.camera.fov = set.webcam.fov;
    this.camera.position.set(...set.webcam.pos);
    this.camera.lookAt(...set.webcam.look);
    this.scene.add(set.group);

    const [sky, ground, hi] = this.style.hemi;
    this.scene.add(new THREE.HemisphereLight(sky, ground, hi));
    const [kc, ki, kp] = this.style.key;
    const key = new THREE.DirectionalLight(kc, ki);
    key.position.set(...kp);
    key.target.position.set(0, 0.8, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.03;
    this.scene.add(key, key.target);
    // the screen's glow on the face (the webcam sits on it)
    const screen = new THREE.PointLight('#dfeaff', 0.9, 4, 2);
    screen.position.set(set.webcam.pos[0], set.webcam.pos[1], set.webcam.pos[2] - 0.1);
    this.scene.add(screen);
  }

  get activityLabel(): string {
    if (this.activity === 'sip' && this.style.drink === 'cocktail') return 'Cocktailpause';
    return ACTIVITY_LABEL[this.activity];
  }

  get occupied(): boolean {
    return !!this.member;
  }

  get occupantId(): string | null {
    return this.member?.id ?? null;
  }

  /** Put somebody into the room (or empty it with null). `fresh` builds private figures, so another scene keeps its own. */
  setOccupant(member: TeamMember | null, fresh = false): void {
    if (this.occupant) {
      this.scene.remove(this.occupant.rig.root);
      if (this.occupant.swimRig) this.scene.remove(this.occupant.swimRig.root);
      for (const p of this.occupant.pets) this.scene.remove(p.rig.root);
      if (this.occupant.headset) this.occupant.rig.body.remove(this.occupant.headset);
    }
    this.member = member;
    this.occupant = member ? occupantOf(member, fresh) : null;
    if (!this.occupant) return;
    const { rig, pets } = this.occupant;
    rig.root.position.set(0, 0, 0);
    const tilt = this.style.recline ?? 0;
    if (tilt) {
      // pivot around the hips (0.4 above the root origin), hips resting in the hammock
      const hip = 0.4 * rig.root.scale.y;
      rig.root.position.set(0, 0.42 - hip * Math.cos(tilt), 0.1 - hip * Math.sin(tilt));
    }
    rig.root.rotation.set(0, 0, 0);
    this.seat.copy(rig.root.position);
    if (this.desk !== undefined) ({ typeL: this.typeL, typeR: this.typeR, push: this.push } = deskPoses(rig, this.desk));
    this.scene.add(rig.root);
    rig.root.visible = true;
    if (this.occupant.swimRig) {
      this.occupant.swimRig.root.visible = false;
      this.scene.add(this.occupant.swimRig.root);
    }
    if (this.variant === 7) {
      this.occupant.headset ??= headset();
      rig.body.add(this.occupant.headset);
    }
    for (const p of pets) {
      p.rig.root.position.copy(p.spot);
      if (p.onDesk) p.rig.root.position.y = this.desk ?? p.spot.y; // on this room's desk top
      p.rig.root.rotation.y = p.yaw;
      this.scene.add(p.rig.root);
    }
    // vapers keep their room permanently hazy
    this.scene.fog = rig.vape ? new THREE.FogExp2('#c9cdd2', (this.haze = HAZE.base)) : null;
    // some say hi when they sit down, the rest just start working
    this.setActivity(Math.random() < GREET_CHANCE ? 'wave' : 'type');
  }

  /** Whether this room and occupant have what a signature move or extra break needs. */
  private canDo(move: SignatureMove | AdhdExtra): boolean {
    const canStand = this.desk !== undefined && !this.style.recline; // a desk to work at, not lying in a deck chair
    switch (move) {
      case 'swim':
        return !!this.style.sea;
      case 'catwalk':
        return this.desk !== undefined && !!this.occupant?.pets.some((p) => p.onDesk);
      case 'spin':
        return !!this.chair;
      case 'fidget':
        return true;
      default: // curl, snack, pace: up on their feet next to the desk chair
        return canStand;
    }
  }

  private setActivity(a: Activity): void {
    if (this.activity === 'catwalk') this.catTurn++; // the other cat next time
    if (a === 'sip' && this.member?.hatesCoffee) a = 'spit'; // every coffee break of theirs ends like this
    this.activity = a;
    this.actT = 0;
    this.actLeft = rand(a === 'type' && this.occupant?.rig.vape ? VAPE_PAUSE : ACTIVITY_TIME[a]);
  }

  update(dt: number): void {
    if (!this.occupant) return;
    this.clock += dt;
    this.actT += dt;
    this.actLeft -= dt;
    if (this.actLeft <= 0) {
      const skip: readonly string[] = this.member?.skipBreaks ?? [];
      const pool: Activity[] = ACTIVITIES.filter((b) => !skip.includes(b));
      if (this.occupant.rig.vape) pool.push(...Array<Activity>(VAPE_PICKS).fill('vape'));
      const sig = this.member?.signature;
      if (sig && this.canDo(sig)) pool.push(...Array<Activity>(SIGNATURE_PICKS).fill(sig));
      if (this.member?.adhd) pool.push(...ADHD_EXTRAS.filter((x) => this.canDo(x)));
      this.setActivity(this.activity === 'type' ? pool[Math.floor(Math.random() * pool.length)] : 'type');
    }
    const t = this.clock;
    for (const tick of this.ticks) tick(t);
    const r = this.occupant.rig;
    const k = Math.min(1, dt * 7);
    const a = this.activity;
    const held = this.occupant.held;
    const o0 = this.occupant;

    // arm targets: x = swing at the shoulder (0 hanging, -pi/2 forward, -3 up), z = out to the side
    // (positive = away from the body), e = elbow bend (negative = forearm forward), ez = elbow sideways
    const wob = (f: number, p: number) => Math.sin(t * f + p) * 0.06;
    // typing; lying back, the arms swing forward by the recline so the hands stay on the laptop. Poses that hold
    // something against the body or head (controller, cup, phone) are body-relative and ignore the recline.
    const recl = this.style.recline ?? 0;
    const L: ArmPose = { ...this.typeL, x: this.typeL.x - recl, e: this.typeL.e + wob(17, 0) };
    const R: ArmPose = { ...this.typeR, x: this.typeR.x - recl, e: this.typeR.e + wob(14, 2) };
    let lean = this.style.lean ?? 0;
    let yaw = 0;
    let hop = 0;
    let mouth = 0;
    let sipTip = 0; // how far the cup is tipped towards the mouth
    let spray = -1; // seconds since the coffee was spat out (negative: no spray)
    let stand = 0; // 1 = up on their feet next to the chair
    const standAt = this.seat.clone(); // where they stand (blended in from the seat by `stand`)
    let standYaw = 0;
    let gait = 0; // > 0: walking (leg swing speed)
    let chairTurn = 0; // swivel chair (and whoever is on it) turned this far
    let chairBack = 0; // swivel chair rolled back from the desk this far
    /** along the points, split by length: sets standAt and standYaw */
    const walkPath = (pts: THREE.Vector3[], k: number) => {
      const seg = pts.slice(1).map((p, i) => pts[i].distanceTo(p));
      let d = Math.min(1, Math.max(0, k)) * seg.reduce((x, y) => x + y, 0);
      for (let i = 0; i < seg.length; i++) {
        if (d <= seg[i] || i === seg.length - 1) {
          standAt.lerpVectors(pts[i], pts[i + 1], Math.min(1, d / (seg[i] || 1)));
          if (seg[i]) standYaw = Math.atan2(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
          return;
        }
        d -= seg[i];
      }
    };
    const walkArms = () => {
      const sw = Math.sin(t * 9) * 0.45;
      Object.assign(L, { x: -sw, z: 0.05, e: -0.25, ez: 0 });
      Object.assign(R, { x: sw, z: 0.05, e: -0.25, ez: 0 });
    };
    switch (a) {
      case 'sip': {
        // left hand, the right one may hold a phone / vape
        const up = Math.min(1, this.actT / 0.7) * Math.min(1, Math.max(0, (this.actLeft + 0.2) / 0.7));
        Object.assign(L, mixPose(L, held.sip, up)); // elbow up and out, cup in front of the mouth
        sipTip = Math.max(0, Math.sin(Math.min(1, this.actT / (this.actT + this.actLeft)) * Math.PI) * 1.3 - 0.3) * 0.7;
        lean += -0.04 * up;
        break;
      }
      case 'spit': {
        // a sip of coffee ... spat straight out with a jolt, the cup goes down, the hand finds the energy can instead
        const at = this.actT;
        const lift = (from: number, to: number) => Math.min(1, Math.max(0, (at - from) / (to - from)));
        const cupUp = lift(0, SPIT.sip * 0.8) * (1 - lift(SPIT.spit + 0.1, SPIT.away));
        const canUp = lift(SPIT.grab, SPIT.drink) * (1 - lift(SPIT.done, SPIT.done + 0.6));
        const reach = lift(SPIT.away, SPIT.away + 0.3) * (1 - lift(SPIT.grab, SPIT.grab + 0.3));
        Object.assign(L, mixPose(L, held.sip, Math.max(cupUp, canUp)));
        Object.assign(L, mixPose(L, { x: -0.25, z: 0.45, e: -0.35, ez: 0 }, reach)); // down beside the desk
        if (at < SPIT.spit) sipTip = 0.5 * lift(SPIT.sip, SPIT.spit);
        else if (at > SPIT.drink) sipTip = 1.0 * lift(SPIT.drink, SPIT.drink + 0.4) * (1 - lift(SPIT.done - 0.3, SPIT.done)); // chugging
        const jolt = Math.max(0, 1 - Math.abs(at - SPIT.spit - 0.1) / 0.3);
        lean += -0.16 * jolt - 0.04 * canUp;
        yaw = Math.sin(at * 30) * 0.12 * jolt; // head shake
        spray = at - SPIT.spit;
        break;
      }
      case 'vape': {
        // right hand to the mouth (same pose as in the office), a long drag, then the cloud
        const up = Math.min(1, this.actT / VAPE_DRAG[0]) * Math.min(1, Math.max(0, (VAPE_DRAG[1] + 0.5 - this.actT) / 0.5));
        Object.assign(R, mixPose(R, held.vape, up));
        lean += -0.05 * up;
        break;
      }
      case 'catwalk': {
        // reach out and shove the cat off camera
        const reach = Math.min(1, Math.max(0, (this.actT - (CATWALK.push - 0.5)) / 0.4)) * Math.min(1, Math.max(0, (CATWALK.out - this.actT) / 0.4));
        Object.assign(R, mixPose(R, this.push, reach));
        yaw = 0.15 * reach;
        lean += 0.08 * reach;
        break;
      }
      case 'curl': {
        // stands up beside the chair (the dumbbell would hit the desk when seated), turned ~45° so the curling arm
        // faces the webcam; upper arm stays at the side, the forearm does the work
        const on = Math.min(1, this.actT / 0.8) * Math.min(1, this.actLeft / 0.8);
        const flex = 0.5 - 0.5 * Math.cos(Math.max(0, this.actT - 0.8) * Math.PI * 1.3); // about 1.5 s per rep
        Object.assign(R, mixPose(R, { x: -0.12, z: 0.1, e: lerp(-0.15, -2.35, flex), ez: 0 }, on));
        Object.assign(L, mixPose(L, { x: 0, z: 0.08, e: -0.1, ez: 0 }, on)); // left arm hangs loose
        lean += -0.03 * flex * on;
        stand = on;
        standAt.set(this.seat.x - 0.5, this.seat.y, this.seat.z - 0.22);
        standYaw = -0.78;
        break;
      }
      case 'fidget': {
        // both hands up in front of the chest, the spinner whirring in the right one, the left flicking it
        const on = Math.min(1, this.actT / 0.5) * Math.min(1, this.actLeft / 0.5);
        Object.assign(R, mixPose(R, held.gameR, on));
        Object.assign(L, mixPose(L, { ...held.gameL, e: held.gameL.e + Math.max(0, Math.sin(t * 7)) ** 6 * 0.5 }, on));
        lean += 0.06 * on;
        break;
      }
      case 'spin': {
        // roll back from the desk, swivel once all the way round, arms tucked in, roll back in
        const k = Math.min(1, this.actT / (this.actT + this.actLeft));
        const turn = Math.min(1, Math.max(0, (k - SPIN.roll) / (1 - 2 * SPIN.roll)));
        chairTurn = Math.PI * 2 * (turn * turn * (3 - 2 * turn));
        const out = Math.min(1, k / SPIN.roll, (1 - k) / SPIN.roll);
        chairBack = SPIN.back * out * out * (3 - 2 * out);
        const tuck = Math.sin(Math.PI * turn);
        Object.assign(L, mixPose(L, { x: -0.4, z: -0.1, e: -1.4, ez: 0 }, tuck));
        Object.assign(R, mixPose(R, { x: -0.4, z: -0.1, e: -1.4, ez: 0 }, tuck));
        lean += -0.12 * tuck;
        break;
      }
      case 'snack': {
        // up, off to the right out of the picture, back with a bag of crisps, sit down, munch
        const at = this.actT;
        const seat = this.seat.clone();
        const side = new THREE.Vector3(0.6, this.seat.y, this.seat.z - 0.12);
        const off = new THREE.Vector3(2.6, this.seat.y, this.seat.z - 0.3);
        stand = Math.min(1, at / SNACK.up) * Math.min(1, Math.max(0, (SNACK.sat - at) / (SNACK.sat - SNACK.in)));
        if (at < SNACK.up) walkPath([seat, seat], 0);
        else if (at < SNACK.out) walkPath([seat, side, off], (at - SNACK.up) / (SNACK.out - SNACK.up));
        else if (at < SNACK.back) walkPath([off, off], 0);
        else if (at < SNACK.in) walkPath([off, side, seat], (at - SNACK.back) / (SNACK.in - SNACK.back));
        else walkPath([seat, seat], 0);
        if (at > SNACK.up && at < SNACK.in) {
          gait = 9;
          walkArms();
        } else if (at >= SNACK.in) standYaw = 0; // turn back to the desk to sit down
        if (at >= SNACK.sat) {
          const bite = (0.5 - 0.5 * Math.cos((at - SNACK.sat) * Math.PI * 1.6)) * 0.85; // hand to the mouth and back
          Object.assign(L, mixPose(L, held.sip, bite));
        }
        break;
      }
      case 'pace': {
        // up, step out beside the chair, to and fro behind the desk while thinking, back down
        const at = this.actT;
        const seat = this.seat.clone();
        const a = new THREE.Vector3(-0.55, this.seat.y, this.seat.z - 0.08);
        const b = new THREE.Vector3(-1.35, this.seat.y, this.seat.z - 0.08);
        const UP = 0.6;
        const OUT = 1.3;
        stand = Math.min(1, at / UP) * Math.min(1, this.actLeft / UP);
        if (at < UP || this.actLeft < UP) {
          walkPath([seat, seat], 0);
          standYaw = 0;
        } else if (at < UP + OUT) walkPath([seat, a], (at - UP) / OUT);
        else if (this.actLeft < UP + OUT) walkPath([a, seat], 1 - (this.actLeft - UP) / OUT);
        else {
          const span = a.distanceTo(b);
          const d = ((at - UP - OUT) * 0.7) % (2 * span); // 0.7 m/s, there and back
          walkPath(d < span ? [a, b] : [b, a], (d < span ? d : d - span) / span);
        }
        if (at > UP && this.actLeft > UP) {
          gait = 9;
          walkArms();
          if (Math.sin(at * 0.9) > 0.4) Object.assign(R, held.think); // scratching the head now and then
        }
        break;
      }
      case 'yawn': {
        const open = Math.sin(Math.min(1, this.actT / (this.actT + this.actLeft)) * Math.PI);
        mouth = open;
        const drop = Math.min(1, open * 2); // forearms sink onto the thighs
        const lap = { x: -0.3, z: 0, e: -1.0, ez: 0 };
        Object.assign(L, mixPose(L, lap, drop));
        Object.assign(R, mixPose(R, lap, drop));
        lean += -0.14 * open;
        break;
      }
      case 'game':
        // controller in both hands, eyes down; now and then a guilty glance up
        Object.assign(L, held.gameL, { e: held.gameL.e + wob(19, 0) * 0.5 });
        Object.assign(R, held.gameR, { e: held.gameR.e + wob(23, 1) * 0.5 });
        lean += Math.sin(t * 0.7) > 0.93 ? -0.03 : 0.1;
        hop = Math.abs(Math.sin(t * 3)) * 0.008;
        break;
      case 'stretch': {
        const up = Math.min(1, this.actT / 0.6) * Math.min(1, Math.max(0, this.actLeft / 0.6));
        const high = { x: -3.05, z: 0.35, e: 0, ez: 0 };
        Object.assign(L, mixPose(L, high, up));
        Object.assign(R, mixPose(R, high, up));
        lean += -0.12 * up;
        break;
      }
      case 'think':
        // scratching the head: upper arm up and out, forearm folded over to the crown
        Object.assign(R, held.think, { ez: held.think.ez + Math.sin(t * 14) * 0.12 });
        lean += 0.05;
        yaw = Math.sin(t * 0.8) * 0.12;
        break;
      case 'call':
        // phone at the ear; the free hand keeps typing and only now and then lifts into a short gesture
        Object.assign(R, held.call);
        const gesture = Math.max(0, Math.sin(this.actT * 0.9 - 1)) ** 4;
        Object.assign(L, mixPose(L, { x: -0.95, z: 0.15, e: -1.35 + Math.sin(t * 3) * 0.08, ez: 0 }, gesture));
        hop = Math.abs(Math.sin(t * 5)) * 0.02;
        yaw = Math.sin(t * 1.4) * 0.1;
        break;
      case 'wave':
        // upper arm out to the side, forearm up, waving from the elbow
        Object.assign(R, { x: -0.3, z: 1.2, e: 0, ez: 1.5 + Math.sin(t * 9) * 0.35 });
        lean += 0.02;
        break;
      case 'away':
        yaw = (Math.floor(this.clock / 4) % 2 ? 1 : -1) * 0.55 * Math.min(1, this.actT / 0.4);
        break;
      default:
        break;
    }
    const tilt = recl;
    ease(this.poseL, L, k);
    ease(this.poseR, R, k);
    this.lean = lerp(this.lean, lean, k);
    this.yaw = lerp(this.yaw, yaw, Math.min(1, dt * 5));

    // sitting pose (same numbers as the office view)
    r.legL.rotation.x = r.legR.rotation.x = tilt ? -1.9 - tilt : -1.5; // lying: thighs raised, knees bent
    r.kneeL.rotation.x = r.kneeR.rotation.x = tilt ? 1.1 : 1.5;
    r.legL.position.y = r.legR.position.y = 0.8 - SIT_DROP;
    // the left arm is on -x, so "out to the side" is a negative z rotation there
    r.armL.rotation.set(this.poseL.x, 0, -this.poseL.z);
    r.elbowL.rotation.set(this.poseL.e, 0, -this.poseL.ez);
    r.armR.rotation.set(this.poseR.x, 0, this.poseR.z);
    r.elbowR.rotation.set(this.poseR.e, 0, this.poseR.ez);
    r.body.position.y = -SIT_DROP + Math.sin(t * 1.3) * 0.006 + hop;
    r.root.position.copy(this.seat);
    r.root.rotation.set(tilt, 0, 0);
    r.body.rotation.x = this.lean;
    r.body.rotation.y = this.yaw;
    if (a === 'swim') this.poseSwim(r, this.occupant.swimRig ?? r, t);
    else if (o0.swimRig) {
      o0.swimRig.root.visible = false;
      r.root.visible = true;
    }
    if (stand > 0) {
      // up from the chair: legs straighten, body rises; then standing (or walking) at standAt
      const swing = gait ? Math.sin(t * gait) * 0.5 * stand : 0;
      r.legL.rotation.x = lerp(-1.5, 0, stand) + swing;
      r.legR.rotation.x = lerp(-1.5, 0, stand) - swing;
      r.kneeL.rotation.x = r.kneeR.rotation.x = lerp(1.5, gait ? 0.15 : 0.05, stand);
      r.legL.position.y = r.legR.position.y = lerp(0.8 - SIT_DROP, 0.8, stand);
      r.body.position.y = lerp(-SIT_DROP, 0, stand) + (gait ? Math.abs(Math.sin(t * gait)) * 0.02 : 0);
      r.root.position.lerpVectors(this.seat, standAt, stand);
      r.root.rotation.set(0, standYaw * stand, 0);
    }
    // the swivel chair turns with a spin (and whoever is on it), otherwise faces the desk
    if (this.chair) {
      this.chair.rotation.y = chairTurn;
      this.chair.position.z = -chairBack;
    }
    if (chairTurn) r.root.rotation.y = chairTurn;
    if (chairBack) r.root.position.z -= chairBack;
    if (this.style.lapCam) this.aimLapCam(r);

    const o = this.occupant;
    // a prop stays in the hand until the arm has settled back after its activity, not just while it lasts
    const prop = PROP_OF[a];
    const settled = armGap(this.poseL, L) + armGap(this.poseR, R) < 0.12;
    if (prop) this.prop = prop;
    else if (settled) this.prop = null;
    o.mug.visible = this.prop === 'mug';
    let drink: string = this.style.drink ?? 'coffee';
    if (a === 'spit') drink = this.actT < SPIT.away ? 'coffee' : this.actT < SPIT.grab ? '' : 'can';
    if (a === 'snack') drink = this.actT >= SNACK.back ? 'snack' : '';
    o.spinner.visible = this.prop === 'spinner';
    if (o.spinner.visible) {
      // flat in the world, whirring
      r.root.updateMatrixWorld(true);
      o.spinner.quaternion.copy(r.elbowR.getWorldQuaternion(tmpQ)).invert();
      o.spinner.getObjectByName('rotor')!.rotation.y = t * 25;
    }
    for (const c of o.mug.children) c.visible = c.name === drink;
    if (o.spray) {
      // the spat coffee: droplets shooting forward and falling
      o.spray.visible = spray >= 0 && spray < 0.8;
      o.spray.children.forEach((d, i) => {
        const k = Math.max(0, spray);
        d.position.set(Math.sin(i * 2.4) * (0.05 + k * 0.25), 1.49 + (i % 3) * 0.012 - k * k * 1.6, 0.22 + k * (0.7 + (i % 3) * 0.15));
      });
    }
    if (o.mug.visible) {
      // undo every joint above the hand so the cup stays upright
      r.root.updateMatrixWorld(true);
      o.mug.quaternion.copy(r.elbowL.getWorldQuaternion(tmpQ)).invert().multiply(tmpQ.setFromAxisAngle(X_AXIS, -sipTip));
    }
    o.gamepad.visible = this.prop === 'gamepad';
    o.dumbbell.visible = this.prop === 'dumbbell';
    if (r.vape) {
      r.vape.device.visible = this.prop === 'vape';
      this.vapeCloud(r.vape, a === 'vape' ? this.actT : -1, dt);
    }
    r.handset.visible = this.prop === 'phone';
    o.yawn.visible = mouth > 0.15;
    o.yawn.scale.y = 0.4 + mouth * 0.6;

    const deskCats = this.occupant.pets.filter((p) => p.onDesk);
    const walker = a === 'catwalk' ? deskCats[this.catTurn % deskCats.length] : undefined;
    for (const p of this.occupant.pets) {
      const pr = p.rig;
      pr.tail.rotation.y = Math.sin(t * 6 + p.spot.x) * (p.onDesk ? 0.25 : 0.55);
      pr.body.position.y = Math.sin(t * 1.6 + p.spot.x) * 0.008;
      if (p === walker) this.catWalk(p, t);
      else pr.root.rotation.y = p.yaw + Math.sin(t * 0.4 + p.spot.x * 3) * 0.15;
    }
  }

  /**
   * A desk cat strolls up to the lens, stands there filling the picture until it gets shoved off to the side, then
   * comes back round behind the laptop to its spot.
   */
  private catWalk(p: Occupant['pets'][number], t: number): void {
    const r = p.rig;
    const y = this.desk ?? p.spot.y;
    const home = new THREE.Vector3(p.spot.x, y, p.spot.z);
    const front = new THREE.Vector3(CAT_FRONT.x, y, CAT_FRONT.z);
    const off = new THREE.Vector3(1.1, y, CAT_FRONT.z + 0.05); // out of the picture to the right
    const side = new THREE.Vector3(1.1, y, p.spot.z);
    const at = this.actT;
    const end = at + this.actLeft;
    let from = home;
    let to = home;
    let k = 0;
    let gait = 0; // leg swing speed
    if (at < CATWALK.arrive) [from, to, k, gait] = [home, front, at / CATWALK.arrive, 11];
    else if (at < CATWALK.shoved) [from, to, k, gait] = [front, front, 0, 0];
    else if (at < CATWALK.out) [from, to, k, gait] = [front, off, (at - CATWALK.shoved) / (CATWALK.out - CATWALK.shoved), 18];
    else if (at < CATWALK.out + 0.3) [from, to, k, gait] = [side, side, 0, 0];
    else [from, to, k, gait] = [side, home, Math.min(1, (at - CATWALK.out - 0.3) / Math.max(0.5, end - CATWALK.out - 0.6)), 10];
    const ease = k * k * (3 - 2 * k);
    r.root.position.lerpVectors(from, to, ease);
    if (from !== to) r.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    else if (at < CATWALK.shoved) r.root.rotation.y = Math.PI * 0.5 + Math.sin(t * 0.8) * 0.2; // side-on across the lens
    const swing = gait && k < 1 ? Math.sin(t * gait) * 0.5 : 0;
    r.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? swing : -swing)));
    r.tail.rotation.x = at > CATWALK.arrive && at < CATWALK.shoved ? -0.6 : 0; // tail up while showing off
  }

  /** Glowing tip while drawing, puffs drifting up from the mouth after it, and the room slowly hazing over. */
  private vapeCloud(v: NonNullable<CharacterRig['vape']>, at: number, dt: number): void {
    v.led.color.set(at >= VAPE_DRAG[0] && at < VAPE_DRAG[1] ? 0xff7a2a : 0x3a1a10);
    const t = at - VAPE_DRAG[1] - 0.3; // seconds since the exhale started
    if (t >= 0 && t - dt < 0) this.haze = Math.min(HAZE.max, this.haze + HAZE.puff);
    v.puffs.forEach((m, i) => {
      const k = t - i * 0.18; // each puff leaves a little later
      const on = at >= 0 && t >= 0 && k >= 0 && k < 2.4;
      m.visible = on;
      if (!on) return;
      // blown out towards the webcam, spreading and only slowly rising (the seated view ends just above the head)
      const u = k / 2.4;
      const sc = 0.1 + u * 0.5;
      m.scale.set(sc, sc * 0.75, sc);
      m.position.set(Math.sin(i * 2.3 + u * 3) * 0.25 * u, 1.48 - SIT_DROP + u * 0.18 + i * 0.02, 0.22 + u * 0.5);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - u) * Math.min(1, k * 6);
    });
    this.haze = lerp(this.haze, HAZE.base, Math.min(1, dt * 0.04));
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = this.haze;
  }

  /**
   * The laptop on its stand over the lap films its owner from in front of the face. Going for a swim it
   * is dropped into the sand (the view tips over and settles low, looking out to sea) and picked up again at the end.
   */
  private aimLapCam(r: CharacterRig): void {
    r.root.updateMatrixWorld(true);
    if (this.activity !== 'swim') {
      // on a (not drawn) laptop stand over the lap: about a metre in front of the face and a little above it,
      // so the framing matches the desk webcams
      const face = r.body.localToWorld(new THREE.Vector3(0, 1.58, 0.18));
      this.lapPos.copy(face).add(new THREE.Vector3(0, 0.02, 1.05));
      this.lapLook.copy(r.body.localToWorld(new THREE.Vector3(0, 1.4, 0.1)));
    }
    const at = this.activity === 'swim' ? this.actT : 0;
    const left = this.activity === 'swim' ? this.actLeft : 0;
    // 0 = on the lap, 1 = in the sand; a quick fall with a little bounce, a slower lift at the end
    const fall = Math.min(1, at / 0.45);
    const lift = Math.min(1, left / 0.8);
    const k = this.activity === 'swim' ? Math.min(fall * fall, lift * lift * (3 - 2 * lift)) : 0;
    const bounce = this.activity === 'swim' && at > 0.45 && at < 0.8 ? Math.sin(((at - 0.45) / 0.35) * Math.PI) * 0.03 : 0;
    // dropped beside the chair on the left; he leaves round the right-hand side, so never walks over it
    const sand = new THREE.Vector3(-0.55, 0.12 + bounce, 0.75);
    const sea = new THREE.Vector3(0.3, 0.55, -3.2);
    this.camera.position.lerpVectors(this.lapPos, sand, k);
    this.camera.lookAt(new THREE.Vector3().lerpVectors(this.lapLook, sea, k));
    this.camera.rotateZ(0.14 * k); // landed a bit crooked
  }

  /**
   * Off for a swim (deck chair room), seen from the laptop lying in the sand: up and out of the picture to the right
   * (where the shirt comes off), back in in swimwear and down to the water, crawl laps along the shore, out of the
   * picture again to get dressed, then back to the chair. Runs after the sitting pose and overrides it.
   */
  private poseSwim(dry: CharacterRig, wet: CharacterRig, t: number): void {
    const total = this.actT + this.actLeft;
    const at = this.actT;
    const seat = this.seat.clone().setY(0);
    const beside = new THREE.Vector3(0.85, 0, -0.1); // round the right side of the deck chair, not through it
    const off = new THREE.Vector3(2.4, 0, 0.5); // out of the sand cam's picture, to the right
    const shore = new THREE.Vector3(0.9, 0, -1.7);
    const lane = { z: -3.0, x0: -1.4, x1: 1.2 };
    const P = { out: 2.4, change: 1.2, in: 2.8 }; // seconds per leg; the way back mirrors it
    const swimFrom = P.out + P.change + P.in;
    const swimTo = total - swimFrom;
    // position along the laps: starts at the shore x, ping-pongs between x0 and x1
    const span = lane.x1 - lane.x0;
    const d = (shore.x - lane.x0 + Math.max(0, Math.min(at, swimTo) - swimFrom) * 0.55) % (2 * span);
    const swimX = d < span ? lane.x0 + d : lane.x1 - (d - span);
    const heading = d < span ? 1 : -1; // +x or -x
    const water = new THREE.Vector3(shore.x, 0, lane.z);
    const lapEnd = new THREE.Vector3(swimX, 0, lane.z);

    const walkTo = (r: CharacterRig, from: THREE.Vector3, to: THREE.Vector3, k: number) => {
      r.root.position.lerpVectors(from, to, k);
      r.root.rotation.set(0, Math.atan2(to.x - from.x, to.z - from.z), 0);
      const swing = Math.sin(t * 9) * 0.55;
      r.legL.rotation.x = swing;
      r.legR.rotation.x = -swing;
      r.kneeL.rotation.x = r.kneeR.rotation.x = 0.15;
      r.legL.position.y = r.legR.position.y = 0.8;
      r.body.position.y = Math.abs(Math.sin(t * 9)) * 0.02;
      r.body.rotation.set(0, 0, 0);
      r.armL.rotation.set(-swing * 0.8, 0, 0);
      r.armR.rotation.set(swing * 0.8, 0, 0);
      r.elbowL.rotation.set(-0.2, 0, 0);
      r.elbowR.rotation.set(-0.2, 0, 0);
    };
    /** along the points, split by length */
    const path = (r: CharacterRig, pts: THREE.Vector3[], k: number) => {
      const seg = pts.slice(1).map((p, i) => pts[i].distanceTo(p));
      let s = Math.min(1, Math.max(0, k)) * seg.reduce((x, y) => x + y, 0);
      for (let i = 0; i < seg.length; i++) {
        if (s <= seg[i] || i === seg.length - 1) return walkTo(r, pts[i], pts[i + 1], Math.min(1, s / seg[i]));
        s -= seg[i];
      }
    };
    const swimming = (r: CharacterRig) => {
      // face down, the whole body sloping up from the feet: shoulders at the waterline, head out; crawl and kick
      r.root.position.set(swimX, -0.36, lane.z);
      r.root.rotation.set(Math.PI / 2 - 0.25, (heading * Math.PI) / 2, 0, 'YXZ');
      r.body.position.y = Math.sin(t * 5) * 0.015;
      r.body.rotation.set(0, Math.sin(t * 5) * 0.15, 0); // rolls with the strokes
      r.legL.position.y = r.legR.position.y = 0.8;
      r.legL.rotation.x = Math.sin(t * 12) * 0.3;
      r.legR.rotation.x = -Math.sin(t * 12) * 0.3;
      r.kneeL.rotation.x = r.kneeR.rotation.x = 0.1;
      r.armL.rotation.set(-(t * 5) % (Math.PI * 2), 0, 0);
      r.armR.rotation.set(-(t * 5 + Math.PI) % (Math.PI * 2), 0, 0);
      r.elbowL.rotation.set(0, 0, 0);
      r.elbowR.rotation.set(0, 0, 0);
    };

    // which body is out there: swimwear from halfway through the first change until halfway through the second
    const isWet = at > P.out + P.change / 2 && at < total - P.out - P.change / 2;
    const r = isWet ? wet : dry;
    dry.root.visible = !isWet;
    wet.root.visible = isWet;
    if (at < P.out) path(r, [seat, beside, off], at / P.out);
    else if (at < P.out + P.change) walkTo(r, off, off, 0); // changing, out of sight
    else if (at < swimFrom) path(r, [off, shore, water], (at - P.out - P.change) / P.in);
    else if (at < swimTo) swimming(r);
    else if (at < swimTo + P.in) path(r, [lapEnd, shore, off], (at - swimTo) / P.in);
    else if (at < total - P.out) walkTo(r, off, off, 0); // getting dressed
    else path(r, [off, beside, seat], (at - (total - P.out)) / P.out);
  }

  /** Draw into a rectangle of the main canvas (CSS pixels, y measured from the bottom). */
  render(renderer: THREE.WebGLRenderer, x: number, y: number, w: number, h: number, clip?: [number, number, number, number]): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(...(clip ?? [x, y, w, h]));
    renderer.render(this.scene, this.camera);
  }
}
