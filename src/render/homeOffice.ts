import * as THREE from 'three';
import type { TeamMember } from '../data/types';
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
export const HOME_COUNT = 8;
/** People with their own special home office (index into STYLES, after the eight regular rooms). */
export const SPECIAL_HOME: Record<string, number> = { 'marco-hefti': 8 };
export const ROOM_COUNT = HOME_COUNT + Object.keys(SPECIAL_HOME).length;

type Color = string;

/** Collects coloured boxes / balls into one merged mesh, plus separate glowing parts (lamps, neon, windows). */
class Room {
  readonly group = new THREE.Group();
  readonly lights: THREE.Light[] = [];
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
  s.bx(0.44, 0.02, 0.15, 0, y + 0.04, 0.55, '#2b2d33'); // keyboard
  s.bx(0.4, 0.005, 0.1, 0, y + 0.06, 0.55, '#4a4d55');
  s.bx(0.06, 0.025, 0.1, 0.4, y + 0.04, 0.55, '#2b2d33'); // mouse
}

function chair(s: Room, c: Color, backH = 0.85): void {
  s.bx(0.5, 0.08, 0.5, 0, 0.32, 0.02, c);
  s.bx(0.54, backH, 0.07, 0, 0.4, -0.3, c);
  s.cy(0.03, 0.03, 0.3, 0, 0.02, 0, '#2a2a2d', 6);
  s.cy(0.26, 0.26, 0.03, 0, 0, 0, '#2a2a2d', 5);
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
  /** body lean while working (negative = leaning back) and gentle swaying (hammock) */
  lean?: number;
  /** lies back at this tilt (radians, negative), hips resting in the hammock */
  recline?: number;
  sway?: number;
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
      // gaming chair
      s.bx(0.55, 0.08, 0.55, 0, 0.32, 0.02, '#17181c');
      s.bx(0.6, 1.0, 0.1, 0, 0.4, -0.32, '#17181c');
      s.bx(0.12, 0.95, 0.12, -0.3, 0.4, -0.3, '#e04c4c');
      s.bx(0.12, 0.95, 0.12, 0.3, 0.4, -0.3, '#e04c4c');
      s.bx(0.3, 0.2, 0.1, 0, 1.4, -0.32, '#17181c');
      s.cy(0.03, 0.03, 0.3, 0, 0.02, 0, '#2a2a2d', 6);
      s.cy(0.28, 0.28, 0.03, 0, 0, 0, '#17181c', 5);
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
    // 8 ---------------------------------------------------------------- Thailand hammock (Marco)
    label: 'Hängematte, Thailand',
    bg: '#8fd8f5',
    hemi: ['#e2f6ff', '#f0dca8', 1.6],
    key: ['#fff1c8', 2.6, [-3, 6, 4]],
    recline: -0.75,
    sway: 0.015,
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
      // longtail boat
      s.bx(1.6, 0.25, 0.4, 2.6, 0.1, -3.2, '#c9573a');
      s.bx(0.5, 0.3, 0.3, 3.4, 0.35, -3.2, '#f2c43a');
      s.bx(0.05, 0.8, 0.05, 1.6, 0.3, -3.2, '#2a2a2d');
      // palm trees + hammock ropes
      for (const [x, pz] of [[0, -2.3], [-1.9, 1.5]] as const) {
        for (let i = 0; i < 10; i++) s.bx(0.22 - i * 0.008, 0.3, 0.22 - i * 0.008, x + i * 0.0, i * 0.3, pz, i % 2 ? '#8a6a42' : '#7a5a38');
        const top = 3.0;
        const cx = x;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2;
          for (let k = 1; k <= 4; k++) s.bx(0.32, 0.04, 0.2, cx + Math.cos(ang) * k * 0.3, top - k * 0.1 - 0.05, pz + Math.sin(ang) * k * 0.3, k % 2 ? '#2f7a3a' : '#3f9244');
        }
        s.ball(0.1, cx + 0.12, top - 0.2, pz + 0.1, '#6a4a30');
        s.ball(0.1, cx - 0.1, top - 0.22, pz - 0.1, '#6a4a30');
      }
      // hammock along z (palm at the back, ropes to a palm in the left foreground): lounge profile, he lies in it
      const stripe = ['#e8645a', '#f2c43a', '#ffffff', '#27a9c9'];
      const prof: Array<[number, number]> = [[-1.6, 1.35], [-1.3, 1.1], [-1.0, 0.88], [-0.7, 0.66], [-0.4, 0.5], [-0.1, 0.36], [0.2, 0.28], [0.5, 0.3], [0.8, 0.4], [1.1, 0.58], [1.4, 0.82]];
      prof.forEach(([z, y], i) => {
        s.bx(1.15, 0.05, 0.31, 0, y - 0.05, z, stripe[i % 4]);
        s.bx(0.05, 0.12, 0.31, -0.6, y - 0.03, z, '#e8e2d4');
        s.bx(0.05, 0.12, 0.31, 0.6, y - 0.03, z, '#e8e2d4');
      });
      for (let k = 0; k < 8; k++) {
        s.bx(0.025, 0.025, 0.2, -0.55 + (k % 2) * 1.1, 1.35 + k * 0.1, -1.7 - k * 0.07, '#e8e2d4');
        s.bx(0.025, 0.025, 0.2, -0.55 + (k % 2) * 1.1, 0.8 + k * 0.07, 1.45 + k * 0.1, '#e8e2d4');
      }
      s.bx(0.55, 0.14, 0.3, 0, 0.9, -0.95, '#ffffff'); // pillow behind the head
      // laptop on his knees (lid towards the camera)
      s.bx(0.46, 0.02, 0.3, 0, 0.9, 0.5, '#c0c2c6');
      s.bx(0.46, 0.28, 0.015, 0, 0.91, 0.36, '#a8aaae');
      s.glow(0.1, 0.1, 0.01, 0, 1.0, 0.352, '#f2f2f2');
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

const ACTIVITIES = ['type', 'type', 'type', 'sip', 'stretch', 'think', 'call', 'wave', 'away'] as const;
type Activity = (typeof ACTIVITIES)[number];
const ACTIVITY_LABEL: Record<Activity, string> = {
  type: 'Tippt',
  sip: 'Kaffeepause',
  stretch: 'Streckt sich',
  think: 'Denkt nach',
  call: 'Im Telefonat',
  wave: 'Winkt',
  away: 'Schaut weg',
};
const ACTIVITY_TIME: Record<Activity, [number, number]> = {
  type: [4, 10],
  sip: [2.6, 3.6],
  stretch: [2.4, 3.2],
  think: [2.5, 4],
  call: [5, 10],
  wave: [2, 3],
  away: [1.6, 2.6],
};

interface Occupant {
  rig: CharacterRig;
  pets: Array<{ rig: DogRig; spot: THREE.Vector3; yaw: number; onDesk: boolean }>;
  headset?: THREE.Object3D;
}

const occupants = new Map<string, Occupant>();

function occupantOf(member: TeamMember): Occupant {
  let o = occupants.get(member.id);
  if (o) return o;
  const rig = buildCharacter(member.look);
  const pets: Occupant['pets'] = [];
  if (member.dog) pets.push({ rig: buildDog(member.dog), spot: new THREE.Vector3(-1.15, 0, 0.35), yaw: 0.5, onDesk: false });
  for (const [i, c] of (member.cats ?? []).entries()) pets.push({ rig: buildCat(c.kind), spot: new THREE.Vector3(0.62 + i * 0.3, 0.74, 0.88), yaw: 0.3 - i * 0.5, onDesk: true });
  o = { rig, pets };
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
  private armL = -1.2;
  private armR = -1.2;
  private lean = 0;

  constructor(readonly variant: number) {
    this.style = STYLES[variant];
    this.scene.background = new THREE.Color(this.style.bg);
    seed = 7 + variant * 31;
    const set = new Room();
    this.style.build(set);
    set.finish();
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
    // the monitor's glow on the face (the webcam sits on it)
    const screen = new THREE.PointLight('#dfeaff', 0.9, 4, 2);
    screen.position.set(0, 1.35, 1.1);
    this.scene.add(screen);

    this.camera.position.set(0, 1.38, 2.0);
    this.camera.lookAt(0, 1.1, 0);
  }

  get activityLabel(): string {
    return ACTIVITY_LABEL[this.activity];
  }

  get occupied(): boolean {
    return !!this.member;
  }

  get occupantId(): string | null {
    return this.member?.id ?? null;
  }

  /** Put somebody into the room (or empty it with null). */
  setOccupant(member: TeamMember | null): void {
    if (this.occupant) {
      this.scene.remove(this.occupant.rig.root);
      for (const p of this.occupant.pets) this.scene.remove(p.rig.root);
      if (this.occupant.headset) this.occupant.rig.body.remove(this.occupant.headset);
    }
    this.member = member;
    this.occupant = member ? occupantOf(member) : null;
    if (!this.occupant) return;
    const { rig, pets } = this.occupant;
    rig.root.position.set(0, 0, 0);
    const tilt = this.style.recline ?? 0;
    if (tilt) {
      // pivot around the hips (0.4 above the root origin), hips resting in the hammock
      const hip = 0.4 * rig.root.scale.y;
      rig.root.position.set(0, 0.42 - hip * Math.cos(tilt), 0.1 - hip * Math.sin(tilt));
    }
    rig.root.rotation.y = 0;
    rig.root.rotation.z = 0;
    this.scene.add(rig.root);
    if (this.variant === 7) {
      this.occupant.headset ??= headset();
      rig.body.add(this.occupant.headset);
    }
    for (const p of pets) {
      p.rig.root.position.copy(p.spot);
      p.rig.root.rotation.y = p.yaw;
      this.scene.add(p.rig.root);
    }
    this.setActivity('wave'); // says hi when they sit down
  }

  private setActivity(a: Activity): void {
    this.activity = a;
    this.actT = 0;
    this.actLeft = rand(ACTIVITY_TIME[a]);
  }

  update(dt: number): void {
    if (!this.occupant) return;
    this.clock += dt;
    this.actT += dt;
    this.actLeft -= dt;
    if (this.actLeft <= 0) this.setActivity(this.activity === 'type' ? ACTIVITIES[Math.floor(Math.random() * ACTIVITIES.length)] : 'type');
    const t = this.clock;
    const r = this.occupant.rig;
    const k = Math.min(1, dt * 7);
    const a = this.activity;

    // targets (arm x rotation: 0 = hanging, -pi/2 = straight forward, -3 = straight up)
    const typeL = -1.22 + Math.sin(t * 17) * 0.05 + Math.sin(t * 5.3) * 0.04;
    const typeR = -1.22 + Math.sin(t * 14 + 2) * 0.05 + Math.sin(t * 4.1) * 0.04;
    let tl = typeL;
    let tr = typeR;
    let z = 0;
    let lean = this.style.lean ?? 0;
    let yaw = 0;
    let hop = 0;
    switch (a) {
      case 'sip': {
        const up = Math.min(1, this.actT / 0.7) * Math.min(1, Math.max(0, (this.actLeft + 0.2) / 0.7));
        tr = lerp(typeR, -2.45, up);
        lean += -0.04 * up;
        break;
      }
      case 'stretch': {
        const up = Math.min(1, this.actT / 0.6) * Math.min(1, Math.max(0, this.actLeft / 0.6));
        tl = lerp(typeL, -3.05, up);
        tr = lerp(typeR, -3.05, up);
        z = up * 0.35;
        lean += -0.12 * up;
        break;
      }
      case 'think':
        tr = -2.5;
        lean += 0.05;
        yaw = Math.sin(t * 0.8) * 0.12;
        break;
      case 'call': {
        // talking with the hands, nodding along
        tr = -0.9 + Math.sin(t * 8) * 0.5;
        tl = -0.6 + Math.sin(t * 6.3 + 1) * 0.4;
        hop = Math.abs(Math.sin(t * 5)) * 0.02;
        yaw = Math.sin(t * 1.4) * 0.1;
        break;
      }
      case 'wave':
        tr = -2.85;
        z = Math.sin(t * 9) * 0.35;
        lean += 0.02;
        break;
      case 'away':
        yaw = (Math.floor(this.clock / 4) % 2 ? 1 : -1) * 0.55 * Math.min(1, this.actT / 0.4);
        break;
      default:
        break;
    }
    const tilt = this.style.recline ?? 0;
    this.armL = lerp(this.armL, tl - tilt, k);
    this.armR = lerp(this.armR, tr - tilt, k);
    this.lean = lerp(this.lean, lean, k);
    this.yaw = lerp(this.yaw, yaw, Math.min(1, dt * 5));

    // sitting pose (same numbers as the office view)
    r.legL.rotation.x = r.legR.rotation.x = tilt ? -1.9 - tilt : -1.5; // lying: thighs raised, knees bent
    r.kneeL.rotation.x = r.kneeR.rotation.x = tilt ? 1.1 : 1.5;
    r.legL.position.y = r.legR.position.y = 0.8 - SIT_DROP;
    r.armL.rotation.x = this.armL;
    r.armR.rotation.x = this.armR;
    r.armR.rotation.z = a === 'wave' ? z : 0;
    r.armL.rotation.z = a === 'stretch' ? -z : 0;
    r.body.position.y = -SIT_DROP + Math.sin(t * 1.3) * 0.006 + hop;
    r.root.rotation.x = tilt;
    r.body.rotation.x = this.lean;
    r.body.rotation.y = this.yaw;
    r.root.rotation.z = Math.sin(t * 0.9) * (this.style.sway ?? 0);

    for (const p of this.occupant.pets) {
      const pr = p.rig;
      pr.tail.rotation.y = Math.sin(t * 6 + p.spot.x) * (p.onDesk ? 0.25 : 0.55);
      pr.body.position.y = Math.sin(t * 1.6 + p.spot.x) * 0.008;
      pr.root.rotation.y = p.yaw + Math.sin(t * 0.4 + p.spot.x * 3) * 0.15;
    }
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
