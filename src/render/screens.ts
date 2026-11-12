import * as THREE from 'three';
import { seeded, type Rng } from '../game/rng';

/** What a monitor shows, by kind of work. */
export type ScreenKind = 'code' | 'design' | 'data' | 'sheet' | 'docs' | 'media';

const W = 192;
const H = 120;

type Ctx = CanvasRenderingContext2D;
const pick = <T,>(r: Rng, a: readonly T[]): T => a[Math.floor(r() * a.length)];
const rect = (c: Ctx, col: string, x: number, y: number, w: number, h: number): void => {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

/** Rows of "code" / text: indented runs of coloured blocks. */
function textRows(c: Ctx, r: Rng, x0: number, y0: number, w: number, rows: number, colors: readonly string[], step = 7, h = 3): void {
  for (let i = 0; i < rows; i++) {
    let x = x0 + Math.floor(r() * 4) * 8;
    const y = y0 + i * step;
    if (r() < 0.12) continue; // blank line
    const parts = 1 + Math.floor(r() * 3);
    for (let p = 0; p < parts; p++) {
      const len = 6 + r() * Math.min(40, x0 + w - x - 8);
      if (len < 4 || x + len > x0 + w) break;
      rect(c, pick(r, colors), x, y, len, h);
      x += len + 4;
    }
  }
}

const SYNTAX = ['#7fd1b9', '#f2c46d', '#8fb3ff', '#e6e9f2', '#e68aa0', '#c792ea'];
const CHART = ['#3b82f6', '#f2a93b', '#34b38a', '#e5546c', '#8b6fd6'];

type Draw = (c: Ctx, r: Rng) => void;

const code: Draw[] = [
  // dark editor with file tree + gutter
  (c, r) => {
    rect(c, '#14192b', 0, 0, W, H);
    rect(c, '#1b2238', 0, 0, 38, H);
    textRows(c, r, 4, 8, 30, 12, ['#5c6a94', '#7a88b3'], 8);
    rect(c, '#242d4a', 38, 0, W - 38, 8);
    rect(c, '#2d3860', 40, 1, 30, 7);
    rect(c, '#1b2238', 38, 8, 9, H - 8);
    textRows(c, r, 42, 12, 8, 14, ['#46517a'], 7);
    textRows(c, r, 52, 12, W - 56, 14, SYNTAX);
  },
  // light editor
  (c, r) => {
    rect(c, '#fbfbfd', 0, 0, W, H);
    rect(c, '#e9ecf2', 0, 0, W, 8);
    rect(c, '#ffffff', 4, 1, 34, 7);
    rect(c, '#eef0f5', 0, 8, 12, H - 8);
    textRows(c, r, 16, 12, W - 22, 14, ['#2b6cb0', '#c05621', '#2f855a', '#4a5568', '#b83280']);
  },
  // terminal
  (c, r) => {
    rect(c, '#0c0f12', 0, 0, W, H);
    for (let i = 0; i < 13; i++) {
      const y = 6 + i * 8;
      rect(c, '#3ddc84', 6, y, 5, 3);
      textRows(c, r, 14, y, W - 24, 1, ['#d7dde5', '#8a94a3', '#f2c46d', '#7fd1b9'], 7);
    }
    rect(c, '#d7dde5', 14, 6 + 12 * 8, 5, 4);
  },
  // editor + browser preview
  (c, r) => {
    rect(c, '#14192b', 0, 0, W, H);
    textRows(c, r, 6, 8, 82, 14, SYNTAX);
    rect(c, '#2d3860', 94, 0, 1, H);
    rect(c, '#f1f3f7', 95, 0, W - 95, H);
    rect(c, '#dfe3ea', 95, 0, W - 95, 9);
    rect(c, '#ffffff', 100, 2, 62, 5);
    rect(c, pick(r, CHART), 100, 16, 36, 6);
    textRows(c, r, 100, 28, 86, 4, ['#aeb6c4']);
    rect(c, pick(r, CHART), 100, 62, 40, 24);
    rect(c, pick(r, CHART), 146, 62, 40, 24);
    rect(c, '#1b2238', 95, 92, W - 95, 28);
    textRows(c, r, 99, 96, 86, 3, ['#7fd1b9', '#e68aa0', '#8a94a3'], 7);
  },
];

const design: Draw[] = [
  // Figma-like: layers left, artboard, properties right
  (c, r) => {
    rect(c, '#e6e8ec', 0, 0, W, H);
    rect(c, '#ffffff', 0, 0, 36, H);
    textRows(c, r, 4, 10, 28, 12, ['#b5bbc6', '#d4d8df'], 8);
    rect(c, '#ffffff', W - 38, 0, 38, H);
    for (let i = 0; i < 5; i++) rect(c, pick(r, CHART), W - 34, 10 + i * 12, 10, 6);
    rect(c, '#ffffff', 48, 12, 98, 96);
    rect(c, pick(r, CHART), 48, 12, 98, 34);
    rect(c, '#1c2430', 56, 54, 50, 6);
    textRows(c, r, 56, 66, 82, 4, ['#c4c9d2']);
    rect(c, pick(r, CHART), 56, 90, 30, 10);
    c.strokeStyle = '#3b82f6';
    c.lineWidth = 1;
    c.strokeRect(54.5, 50.5, 58, 14);
  },
  // dark photo/illustration tool
  (c, r) => {
    rect(c, '#262a31', 0, 0, W, H);
    rect(c, '#1c1f25', 0, 8, 14, H - 8);
    for (let i = 0; i < 8; i++) rect(c, '#555c68', 4, 14 + i * 12, 6, 6);
    const g = c.createLinearGradient(30, 14, 150, 104);
    g.addColorStop(0, pick(r, ['#f2705a', '#ff9d4d', '#6a8cff']));
    g.addColorStop(1, pick(r, ['#6a3fd6', '#2ec4b6', '#e5546c']));
    c.fillStyle = g;
    c.fillRect(24, 14, 110, 92);
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.arc(60 + r() * 40, 50 + r() * 20, 14 + r() * 8, 0, Math.PI * 2);
    c.fill();
    rect(c, '#1c1f25', W - 52, 8, 52, H - 8);
    for (let i = 0; i < 6; i++) {
      rect(c, '#3a404a', W - 48, 14 + i * 16, 44, 12);
      rect(c, pick(r, CHART), W - 46, 16 + i * 16, 8, 8);
    }
  },
  // page layout spread
  (c, r) => {
    rect(c, '#cfd3da', 0, 0, W, H);
    rect(c, '#ffffff', 16, 10, 78, 100);
    rect(c, '#ffffff', 98, 10, 78, 100);
    rect(c, pick(r, CHART), 20, 14, 70, 36);
    textRows(c, r, 20, 58, 68, 6, ['#9aa1ad', '#c4c9d2']);
    rect(c, '#1c2430', 102, 16, 40, 6);
    textRows(c, r, 102, 28, 70, 3, ['#9aa1ad']);
    rect(c, pick(r, CHART), 102, 50, 32, 26);
    rect(c, pick(r, CHART), 138, 50, 34, 26);
    textRows(c, r, 102, 84, 70, 4, ['#9aa1ad', '#c4c9d2']);
  },
  // three phone mockups on a canvas
  (c, r) => {
    rect(c, '#eef0f4', 0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      const x = 20 + i * 54;
      rect(c, '#1c2430', x, 10, 42, 100);
      rect(c, '#ffffff', x + 2, 13, 38, 94);
      rect(c, pick(r, CHART), x + 2, 13, 38, 20);
      rect(c, '#dfe3ea', x + 5, 38, 32, 10);
      textRows(c, r, x + 5, 54, 30, 5, ['#c4c9d2'], 7);
      rect(c, pick(r, CHART), x + 8, 94, 26, 8);
    }
  },
];

const data: Draw[] = [
  // KPI tiles + bar chart
  (c, r) => {
    rect(c, '#f1f3f7', 0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      rect(c, '#ffffff', 8 + i * 60, 8, 54, 26);
      rect(c, CHART[i], 12 + i * 60, 12, 20, 4);
      rect(c, '#1c2430', 12 + i * 60, 20, 30, 8);
    }
    rect(c, '#ffffff', 8, 42, 120, 70);
    for (let i = 0; i < 9; i++) {
      const h = 10 + r() * 50;
      rect(c, CHART[i % 2 ? 0 : 1], 14 + i * 12, 106 - h, 8, h);
    }
    rect(c, '#ffffff', 134, 42, 50, 70);
    c.fillStyle = CHART[0];
    c.beginPath();
    c.arc(159, 77, 17, 0, Math.PI * 1.4);
    c.lineTo(159, 77);
    c.fill();
    c.fillStyle = CHART[1];
    c.beginPath();
    c.arc(159, 77, 17, Math.PI * 1.4, Math.PI * 2);
    c.lineTo(159, 77);
    c.fill();
  },
  // line / area chart
  (c, r) => {
    rect(c, '#ffffff', 0, 0, W, H);
    rect(c, '#17304f', 0, 0, W, 10);
    for (let i = 0; i < 6; i++) rect(c, '#e3e6ec', 12, 20 + i * 15, W - 20, 1);
    for (const [n, col] of [[0, CHART[0]], [1, CHART[2]]] as const) {
      c.strokeStyle = col;
      c.lineWidth = 1.5;
      c.beginPath();
      let y = 70 - n * 12;
      for (let x = 12; x < W - 8; x += 10) {
        y = Math.min(92, Math.max(24, y + (r() - 0.55) * 16));
        if (x === 12) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    textRows(c, r, 12, 104, W - 24, 1, ['#aeb6c4']);
  },
  // gantt / planning
  (c, r) => {
    rect(c, '#fbfbfd', 0, 0, W, H);
    rect(c, '#17304f', 0, 0, W, 10);
    for (let i = 0; i < 9; i++) rect(c, '#eceff4', 60 + i * 14, 10, 1, H - 10);
    for (let i = 0; i < 11; i++) {
      const y = 15 + i * 9;
      rect(c, '#c4c9d2', 6, y, 14 + r() * 36, 3);
      const x = 60 + r() * 50;
      rect(c, CHART[i % CHART.length], x, y - 1, 12 + r() * 50, 5);
    }
  },
  // kanban board
  (c, r) => {
    rect(c, '#e9ecf2', 0, 0, W, H);
    for (let col = 0; col < 4; col++) {
      const x = 6 + col * 46;
      rect(c, '#dde1e9', x, 8, 42, H - 16);
      rect(c, CHART[col], x + 3, 11, 20, 3);
      const n = 2 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) {
        rect(c, '#ffffff', x + 3, 20 + i * 18, 36, 14);
        rect(c, '#9aa1ad', x + 6, 23 + i * 18, 20 + r() * 10, 2);
        rect(c, pick(r, CHART), x + 6, 28 + i * 18, 8, 3);
      }
    }
  },
];

const sheet: Draw[] = [
  // spreadsheet
  (c, r) => {
    rect(c, '#ffffff', 0, 0, W, H);
    rect(c, '#217346', 0, 0, W, 9);
    for (let x = 0; x < W; x += 28) rect(c, '#d6dbe3', x + 18, 9, 1, H - 9);
    for (let y = 18; y < H; y += 8) rect(c, '#e4e7ed', 0, y, W, 1);
    rect(c, '#eef1f5', 0, 9, 18, H - 9);
    for (let i = 0; i < 40; i++) {
      const x = 20 + Math.floor(r() * 6) * 28;
      const y = 11 + Math.floor(r() * 12) * 8;
      rect(c, r() < 0.2 ? '#cfe8d8' : '#9aa1ad', x, y + 2, 6 + r() * 14, 2);
    }
    rect(c, '#bfe3cd', 48, 51, 56, 8);
  },
  // ledger with totals
  (c, r) => {
    rect(c, '#fffdf6', 0, 0, W, H);
    rect(c, '#17304f', 0, 0, W, 10);
    for (let i = 0; i < 12; i++) {
      const y = 16 + i * 8;
      rect(c, '#b9c0cb', 8, y, 40 + r() * 30, 3);
      rect(c, r() < 0.3 ? '#e5546c' : '#34b38a', 140, y, 14 + r() * 20, 3);
    }
    rect(c, '#1c2430', 140, 112, 36, 3);
  },
];

const docs: Draw[] = [
  // text document
  (c, r) => {
    rect(c, '#e6e9ef', 0, 0, W, H);
    rect(c, '#ffffff', 36, 0, 120, H);
    rect(c, '#17304f', 46, 10, 54, 6);
    textRows(c, r, 46, 24, 100, 12, ['#b9c0cb', '#c9ced7'], 7);
  },
  // mail inbox
  (c, r) => {
    rect(c, '#ffffff', 0, 0, W, H);
    rect(c, '#f1f3f7', 0, 0, 34, H);
    textRows(c, r, 4, 10, 26, 6, ['#9aa1ad'], 10);
    for (let i = 0; i < 9; i++) {
      const y = 6 + i * 12;
      rect(c, i < 3 ? CHART[0] : '#d4d8df', 40, y + 2, 4, 4);
      rect(c, '#1c2430', 50, y, 24, 3);
      rect(c, '#b9c0cb', 50, y + 5, 40 + r() * 70, 2);
      rect(c, '#eceff4', 40, y + 10, W - 44, 1);
    }
  },
  // wireframe
  (c, r) => {
    rect(c, '#f6f7f9', 0, 0, W, H);
    c.strokeStyle = '#8a94a3';
    c.lineWidth = 1;
    for (const [x, y, w, h] of [[10, 8, 172, 14], [10, 28, 80, 50], [98, 28, 84, 22], [98, 56, 84, 22], [10, 84, 172, 26]]) c.strokeRect(x + 0.5, y + 0.5, w, h);
    c.beginPath();
    c.moveTo(10, 28);
    c.lineTo(90, 78);
    c.moveTo(90, 28);
    c.lineTo(10, 78);
    c.stroke();
    textRows(c, r, 14, 90, 160, 3, ['#b9c0cb'], 7);
  },
];

const media: Draw[] = [
  // video editor: preview + timeline
  (c, r) => {
    rect(c, '#1b1d22', 0, 0, W, H);
    const g = c.createLinearGradient(30, 6, 130, 66);
    g.addColorStop(0, pick(r, ['#ff9d4d', '#e5546c', '#34b38a']));
    g.addColorStop(1, pick(r, ['#6a3fd6', '#3b82f6']));
    c.fillStyle = g;
    c.fillRect(46, 6, 100, 58);
    for (let t = 0; t < 4; t++) {
      const y = 72 + t * 11;
      rect(c, '#2a2d34', 4, y, W - 8, 9);
      let x = 6 + r() * 20;
      while (x < W - 30) {
        const w = 14 + r() * 36;
        rect(c, pick(r, CHART), x, y + 1, w, 7);
        x += w + 3 + r() * 10;
      }
    }
    rect(c, '#ffffff', 80, 68, 1, 48);
  },
  // social feed grid
  (c, r) => {
    rect(c, '#fafafa', 0, 0, W, H);
    rect(c, '#ffffff', 0, 0, W, 10);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) rect(c, pick(r, ['#ff9d4d', '#e5546c', '#3b82f6', '#34b38a', '#8b6fd6', '#f2c46d']), 30 + j * 46, 16 + i * 34, 42, 30);
  },
];

const SETS: Record<ScreenKind, Draw[]> = { code, design, data, sheet, docs, media };

/** One shared texture per kind + picture: the still picture, plus the canvas the GPU texture shows. */
interface Entry {
  kind: ScreenKind;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  live: HTMLCanvasElement;
  base: HTMLCanvasElement;
  /** desks showing this picture right now; unused pictures aren't redrawn */
  uses: number;
  /** animation clock, runs faster while somebody types */
  t: number;
  seed: number;
}

const cache = new Map<string, Entry>();
const byMat = new Map<THREE.Material, Entry>();

const mk = (): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
};

/** How many different pictures exist for a kind. */
export const screenVariants = (kind: ScreenKind): number => SETS[kind].length;

/** A lit screen for this kind of work; `variant` picks one of its pictures (wraps around). */
export function screenMaterial(kind: ScreenKind, variant: number): THREE.MeshBasicMaterial {
  const set = SETS[kind];
  const v = ((Math.floor(variant) % set.length) + set.length) % set.length;
  const key = `${kind}:${v}`;
  let e = cache.get(key);
  if (!e) {
    const seed = 0x9e3779b1 ^ (v * 7919) ^ kind.length * 131 ^ kind.charCodeAt(0) * 17;
    const base = mk();
    set[v](base.getContext('2d')!, seeded(seed));
    const live = mk();
    live.getContext('2d')!.drawImage(base, 0, 0);
    const tex = new THREE.CanvasTexture(live);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    e = { kind, mat, tex, live, base, uses: 0, t: (seed >>> 8) % 97, seed };
    cache.set(key, e);
    byMat.set(mat, e);
  }
  return e.mat;
}

/** A desk starts (+1) or stops (-1) showing this material; only shown pictures animate. */
export function useScreen(mat: THREE.Material, delta: 1 | -1): void {
  const e = byMat.get(mat);
  if (e) e.uses = Math.max(0, e.uses + delta);
}

const TICK = 1 / 10; // screens redraw 10x a second, not every frame
let acc = 0;

/** Animates shown screens at a low frame rate. `typing` = materials whose sitter is working right now (content moves faster). */
export function tickScreens(dt: number, typing: ReadonlySet<THREE.Material>): void {
  acc += dt;
  if (acc < TICK) return;
  const step = Math.min(acc, 0.5);
  acc = 0;
  for (const e of cache.values()) {
    if (e.uses <= 0) continue;
    e.t += step * (typing.has(e.mat) ? 1 : 0.25);
    const c = e.live.getContext('2d')!;
    paint(c, e);
    e.tex.needsUpdate = true;
  }
}

const HEAD = 10; // title / toolbar strip that stays put while the content moves

/** Redraws the base picture and animates on top of it. */
function paint(c: Ctx, e: Entry): void {
  const { t, base } = e;
  c.drawImage(base, 0, 0);
  switch (e.kind) {
    case 'code':
    case 'docs': {
      // content scrolls up in lines, wraps around; a cursor blinks at the bottom
      const off = Math.floor(t * 7) % (H - HEAD);
      c.drawImage(base, 0, HEAD + off, W, H - HEAD - off, 0, HEAD, W, H - HEAD - off);
      c.drawImage(base, 0, HEAD, W, off, 0, H - off, W, off);
      if (Math.floor(t * 2) % 2 === 0) rect(c, e.kind === 'code' ? '#e6e9f2' : '#1c2430', 54 + (Math.floor(t * 3) % 6) * 6, 92, 3, 5);
      break;
    }
    case 'design': {
      // selection box and cursor drifting over the artboard
      const x = 40 + (Math.sin(t * 0.9) * 0.5 + 0.5) * 80;
      const y = 22 + (Math.cos(t * 0.7) * 0.5 + 0.5) * 60;
      c.strokeStyle = '#3b82f6';
      c.lineWidth = 1;
      c.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, 34, 18);
      rect(c, '#3b82f6', x - 1, y - 1, 3, 3);
      rect(c, '#3b82f6', x + 33, y + 17, 3, 3);
      rect(c, '#ffffff', x + 40, y + 24, 5, 5);
      break;
    }
    case 'data': {
      // a sweeping marker over the charts, one bar pulses
      const x = 8 + ((t * 14) % (W - 16));
      rect(c, 'rgba(59,130,246,0.25)', x, 42, 3, 70);
      rect(c, 'rgba(242,169,59,0.45)', 14 + (Math.floor(t * 1.5) % 9) * 12, 96, 8, 10);
      break;
    }
    case 'sheet': {
      // the selected cell hops around, formula bar blinks
      const cx = 20 + (Math.floor(t * 1.3) % 6) * 28;
      const cy = 19 + (Math.floor(t * 0.9) % 11) * 8;
      c.strokeStyle = '#217346';
      c.lineWidth = 1;
      c.strokeRect(cx + 0.5, cy + 0.5, 27, 7);
      if (Math.floor(t * 2) % 2 === 0) rect(c, '#1c2430', cx + 4, cy + 2, 2, 4);
      break;
    }
    case 'media': {
      // playhead runs along the timeline / feed highlights one post after another
      const x = 6 + ((t * 10) % (W - 12));
      rect(c, '#ffffff', x, 68, 1, 48);
      const k = Math.floor(t * 0.8) % 9;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.strokeRect(30 + (k % 3) * 46 - 0.5, 16 + Math.floor(k / 3) * 34 - 0.5, 43, 31);
      break;
    }
  }
}

/** The meeting-room TV: a Mario-Kart-like race, always running. Own texture, redrawn at the same low rate. */
export function raceMaterial(): THREE.MeshBasicMaterial {
  if (race) return race.mat;
  const live = mk();
  const tex = new THREE.CanvasTexture(live);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  race = { mat, tex, live, t: 0, acc: 0 };
  drawRace(live.getContext('2d')!, 0);
  tex.needsUpdate = true;
  return mat;
}

let race: { mat: THREE.MeshBasicMaterial; tex: THREE.CanvasTexture; live: HTMLCanvasElement; t: number; acc: number } | null = null;

/** Advances the race; called once per frame, redraws at 10 fps. */
export function tickRace(dt: number): void {
  if (!race) return;
  race.t += dt;
  race.acc += dt;
  if (race.acc < TICK) return;
  race.acc = 0;
  drawRace(race.live.getContext('2d')!, race.t);
  race.tex.needsUpdate = true;
}

function drawRace(c: Ctx, t: number): void {
  const horizon = 44;
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#5fb8ff');
  sky.addColorStop(1, '#bfe6ff');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, horizon);
  rect(c, '#4b9a52', 0, 30, 60, 14); // hills
  rect(c, '#3f8747', 110, 34, 82, 10);
  const bend = Math.sin(t * 0.5) * 50; // the road swings left and right
  for (let y = horizon; y < H; y++) {
    const d = (y - horizon) / (H - horizon); // 0 far .. 1 near
    const z = 1 / (d + 0.04);
    const stripe = Math.floor(z * 0.9 - t * 9) % 2 === 0;
    const cx = W / 2 + bend * (1 - d) * (1 - d);
    const half = 12 + d * 78;
    rect(c, stripe ? '#58b04e' : '#4da245', 0, y, W, 1);
    rect(c, stripe ? '#e5546c' : '#ffffff', cx - half - 5 * d - 2, y, half * 2 + 10 * d + 4, 1); // kerbs
    rect(c, stripe ? '#6e7480' : '#656b77', cx - half, y, half * 2, 1);
    if (Math.floor(z * 0.45 - t * 4.5) % 2 === 0) rect(c, '#f2f2f2', cx - 1 - d * 2, y, 2 + d * 4, 1); // centre line
  }
  // the kart: wobbles, red cap, tyres
  const kx = W / 2 + Math.sin(t * 1.3) * 22 - Math.cos(t * 0.5) * 8;
  const ky = 92 + Math.sin(t * 9) * 1;
  rect(c, '#222', kx - 14, ky + 12, 8, 6);
  rect(c, '#222', kx + 6, ky + 12, 8, 6);
  rect(c, '#e5342c', kx - 11, ky + 2, 22, 12);
  rect(c, '#ffd23a', kx - 11, ky + 8, 22, 2);
  rect(c, '#f2c9a0', kx - 4, ky - 5, 8, 7);
  rect(c, '#e5342c', kx - 5, ky - 9, 10, 4);
  // a rival kart further up
  const rx = W / 2 + Math.sin(t * 0.8 + 2) * 16 + Math.sin(t * 0.5) * 6;
  rect(c, '#3b82f6', rx - 5, 62, 10, 6);
  rect(c, '#222', rx - 6, 66, 3, 3);
  rect(c, '#222', rx + 3, 66, 3, 3);
  // hud: lap + position
  rect(c, 'rgba(0,0,0,0.45)', 4, 4, 34, 10);
  rect(c, '#ffd23a', 7, 7, 8 + (Math.floor(t / 14) % 3) * 6, 4);
  rect(c, 'rgba(0,0,0,0.45)', W - 26, 4, 22, 14);
  rect(c, '#ffffff', W - 22, 8, 3, 6);
  rect(c, '#ffffff', W - 14, 8, 6, 2);
  rect(c, '#ffffff', W - 14, 12, 6, 2);
}
