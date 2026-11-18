import * as THREE from 'three';
import { fxRandom, seeded, type Rng } from '../game/rng';

/** What a monitor shows, by kind of work. */
export type ScreenKind = 'code' | 'design' | 'data' | 'sheet' | 'docs' | 'media' | 'photo';

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

/** A product bottle on white (the shoot's subject), `k` = pixels per 0.01 of its size, base centre at x / y. */
function bottle(c: Ctx, x: number, y: number, k: number): void {
  rect(c, '#dcdcd8', x - 5 * k, y - 0.5 * k, 10 * k, 1.5 * k); // soft shadow
  rect(c, '#2d6e5c', x - 2 * k, y - 14 * k, 4 * k, 14 * k); // bottle
  rect(c, '#e8892b', x - 2 * k, y - 9 * k, 4 * k, 5 * k); // label
  rect(c, '#1b1b1d', x - 1 * k, y - 16 * k, 2 * k, 2 * k); // cap
  rect(c, '#f7f6f2', x + 3 * k, y - 9 * k, 3 * k, 9 * k); // its box
  rect(c, '#c9c8c2', x + 3 * k, y - 9 * k, 3 * k, 1 * k);
}

const photo: Draw[] = [
  // photo editor: picture in the middle, sliders on the right, filmstrip below
  (c, r) => {
    rect(c, '#1c1e22', 0, 0, W, H);
    rect(c, '#14151a', 0, 0, W, 9);
    for (let i = 0; i < 5; i++) rect(c, i === 2 ? '#e6e9f2' : '#6b707c', 6 + i * 24, 3, 16, 3);
    rect(c, '#f4f4f2', 4, 12, 128, 72);
    rect(c, '#ebebe8', 4, 66, 128, 18); // the sweep curves into the table
    bottle(c, 68, 80, 4);
    for (let i = 0; i < 6; i++) {
      rect(c, '#8b8f99', 138, 14 + i * 12, 14 + Math.floor(r() * 12), 2);
      rect(c, '#3a3d44', 138, 20 + i * 12, 46, 2);
    }
    for (let i = 0; i < 6; i++) {
      rect(c, '#f4f4f2', 4 + i * 31, 90, 28, 24);
      bottle(c, 18 + i * 31 + (i % 3) * 2 - 2, 111, 0.9 + (i % 2) * 0.1);
    }
  },
  // contact sheet: twelve shots of the product to pick from
  (c, r) => {
    rect(c, '#26282d', 0, 0, W, H);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 4; j++) {
        const x = 6 + j * 46;
        const y = 6 + i * 38;
        rect(c, '#f4f4f2', x, y, 42, 32);
        bottle(c, x + 21 + (r() - 0.5) * 8, y + 29, 1.2 + r() * 0.3);
        if (r() < 0.4) rect(c, '#f2c46d', x + 2, y + 2, 4, 4); // starred
      }
  },
];

const SETS: Record<ScreenKind, Draw[]> = { code, design, data, sheet, docs, media, photo };

/** One shared texture per kind + picture: the still picture, plus the canvas the GPU texture shows. */
interface Entry {
  /** what it shows: a role's work, or Kurt (#32) */
  kind: ScreenKind | 'kurt' | 'clawd';
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  live: HTMLCanvasElement;
  base: HTMLCanvasElement;
  /** desks showing this picture right now; unused pictures aren't redrawn */
  uses: number;
  /** animation clock, runs faster while somebody types */
  t: number;
  seed: number;
  /** which of the kind's pictures this is */
  variant: number;
  /** a pre-rendered loop played on top of `base` (Kurt waving) */
  frames?: HTMLCanvasElement[];
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
    e = { kind, mat, tex, live, base, uses: 0, t: (seed >>> 8) % 97, seed, variant: v };
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
    e.t += step * (typing.has(e.mat) || e.frames ? 1 : 0.25); // a loop plays at its own pace, nobody types at it
    const c = e.live.getContext('2d')!;
    paint(c, e);
    e.tex.needsUpdate = true;
  }
}

const CLAWD = '#d97757';

/** Clawd's pixels on a screen, 4 px to the unit: the body, stub arms and four legs (eyes are drawn on top, so they can blink). */
function clawdSprite(c: Ctx, ox: number, oy: number, armUp = 0): void {
  rect(c, CLAWD, ox + 8, oy, 48, 28);
  rect(c, CLAWD, ox, oy + 8 - armUp, 8, 8);
  rect(c, CLAWD, ox + 56, oy + 8, 8, 8);
  for (const x of [12, 20, 40, 48]) rect(c, CLAWD, ox + x, oy + 28, 4, 8);
}

const CLAWD_AT = { x: 14, y: 16 };

/**
 * A laptop showing Claude Code (#232): a terminal with Clawd in the corner, a few lines of work and a prompt.
 * `light` is the light terminal (Marco), otherwise the dark one (Janosch).
 */
export function clawdScreenMaterial(light: boolean): THREE.MeshBasicMaterial {
  const key = `clawd:${light ? 'light' : 'dark'}`;
  let e = cache.get(key);
  if (!e) {
    const bg = light ? '#faf9f5' : '#1f1e1d';
    const ink = light ? '#3d3929' : '#d6d3c9';
    const dim = light ? '#b7b2a0' : '#6b6860';
    const base = mk();
    const c = base.getContext('2d')!;
    rect(c, bg, 0, 0, W, H);
    // the welcome box: Clawd on the left, who he is on the right
    c.strokeStyle = CLAWD;
    c.lineWidth = 1;
    c.strokeRect(5.5, 7.5, W - 11, 50);
    clawdSprite(c, CLAWD_AT.x, CLAWD_AT.y);
    rect(c, ink, 96, 16, 56, 4);
    rect(c, dim, 96, 26, 74, 3);
    rect(c, dim, 96, 34, 62, 3);
    rect(c, dim, 96, 42, 70, 3);
    // the session: what was asked, what was done
    for (const [y, w, mark] of [[66, 96, CLAWD], [76, 120, dim], [84, 84, dim], [92, 108, dim]] as const) {
      rect(c, mark, 8, y, 4, 4);
      rect(c, mark === CLAWD ? ink : dim, 16, y, w, 3);
    }
    const live = mk();
    live.getContext('2d')!.drawImage(base, 0, 0);
    const tex = new THREE.CanvasTexture(live);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    e = { kind: 'clawd', variant: light ? 1 : 0, mat, tex, live, base, uses: 0, t: light ? 0 : 1.7, seed: 0 };
    cache.set(key, e);
    byMat.set(mat, e);
  }
  return e.mat;
}

const LOOP_FPS = 8; // frames per second of a pre-rendered loop (Kurt waving)
const HEAD = 10; // title / toolbar strip that stays put while the content moves

/** Redraws the base picture and animates on top of it. */
function paint(c: Ctx, e: Entry): void {
  const { t, base } = e;
  c.drawImage(base, 0, 0);
  if (e.frames?.length) {
    const s = H - 20;
    c.drawImage(e.frames[Math.floor(t * LOOP_FPS) % e.frames.length], (W - s) / 2, 0, s, s);
    return;
  }
  switch (e.kind) {
    case 'clawd': {
      // eyes (shut for a moment every few seconds), the arm waves now and then, a spinner and a cursor on the prompt
      const light = e.variant === 1;
      const { x, y } = CLAWD_AT;
      const blink = (e.t % 3.4) > 3.2;
      const wave = (e.t % 7) > 6.2 && Math.floor(e.t * 4) % 2 === 0;
      if (wave) {
        rect(c, light ? '#faf9f5' : '#1f1e1d', x, y + 8, 8, 8);
        rect(c, CLAWD, x, y, 8, 8);
      }
      if (blink) for (const ex of [20, 40]) rect(c, '#1b1b22', x + ex, y + 14, 4, 2);
      else for (const ex of [20, 40]) rect(c, '#1b1b22', x + ex, y + 8, 4, 8);
      const k = Math.floor(e.t * 4) % 4;
      rect(c, CLAWD, 8 + (k % 2) * 4, 104 + Math.floor(k / 2) * 4, 3, 3); // a little spinner: one of four dots lit
      if (Math.floor(e.t * 2) % 2 === 0) rect(c, light ? '#3d3929' : '#d6d3c9', 20, 105, 4, 6);
      break;
    }
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
    case 'photo': {
      if (e.variant === 0) {
        // the sliders move, the picture brightens and dims, the filmstrip frame hops from shot to shot
        for (let i = 0; i < 6; i++) rect(c, '#e6e9f2', 140 + (Math.sin(t * 0.8 + i * 1.3) * 0.5 + 0.5) * 40, 18 + i * 12, 3, 6);
        rect(c, `rgba(255,255,255,${0.1 + Math.sin(t * 0.9) * 0.08})`, 4, 12, 128, 54);
        c.strokeStyle = '#3b82f6';
        c.lineWidth = 1;
        c.strokeRect(4.5 + (Math.floor(t * 0.6) % 6) * 31, 90.5, 27, 23);
      } else {
        // the pick hops over the sheet
        const k = Math.floor(t * 0.8) % 12;
        c.strokeStyle = '#3b82f6';
        c.lineWidth = 1;
        c.strokeRect(5.5 + (k % 4) * 46, 5.5 + Math.floor(k / 4) * 38, 43, 33);
        rect(c, '#34b38a', 8 + (k % 4) * 46, 8 + Math.floor(k / 4) * 38 + 24, 5, 5);
      }
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

/** What the meeting-room TV shows: nothing, a slide deck (a meeting is running) or a round of kart racing (lunch break). */
export type TvMode = 'off' | 'slides' | 'kart';

interface Tv {
  mat: THREE.MeshBasicMaterial;
  tex: THREE.CanvasTexture;
  live: HTMLCanvasElement;
  mode: TvMode;
  t: number;
  acc: number;
}
let tv: Tv | null = null;
/** deck colours of the current meeting (effects RNG: slides never change a seeded run) */
let deck = 0;

/** The meeting-room TV: own texture, black until a mode is set, redrawn at the same low rate while it shows something. */
export function tvMaterial(): THREE.MeshBasicMaterial {
  if (tv) return tv.mat;
  const live = mk();
  const tex = new THREE.CanvasTexture(live);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  tv = { mat, tex, live, mode: 'off', t: 0, acc: 0 };
  drawTv(tv);
  return mat;
}

export const tvMode = (): TvMode => tv?.mode ?? 'off';

/** Switches the picture; a new mode starts from its beginning. */
export function setTvMode(mode: TvMode): void {
  if (!tv || tv.mode === mode) return;
  tv.mode = mode;
  tv.t = 0;
  deck = Math.floor(fxRandom() * DECKS.length);
  drawTv(tv);
}

/** Advances the picture; called once per frame, redraws at 10 fps (and not at all while the TV is off). */
export function tickTv(dt: number): void {
  if (!tv || tv.mode === 'off') return;
  tv.t += dt;
  tv.acc += dt;
  if (tv.acc < TICK) return;
  tv.acc = 0;
  drawTv(tv);
}

function drawTv(s: Tv): void {
  const c = s.live.getContext('2d')!;
  if (s.mode === 'kart') drawRace(c, s.t);
  else if (s.mode === 'slides') drawSlide(c, s.t);
  else {
    rect(c, '#07080a', 0, 0, W, H);
    rect(c, '#101216', 0, 0, W, 2); // faint glass edge
  }
  s.tex.needsUpdate = true;
}

const SLIDE_SECONDS = 9;
const DECKS: readonly { bg: string; ink: string; accent: string; soft: string }[] = [
  { bg: '#ffffff', ink: '#1c2430', accent: '#2f6fed', soft: '#e6edfb' },
  { bg: '#16213a', ink: '#f2f5fb', accent: '#f2a93b', soft: '#25345a' },
  { bg: '#fdf6ec', ink: '#3a2c20', accent: '#d9534f', soft: '#f3e2c9' },
];

/** A slide deck: one slide every few seconds, five layouts, the colours stay per deck (a new deck per meeting). */
function drawSlide(c: Ctx, t: number): void {
  const n = Math.floor(t / SLIDE_SECONDS);
  const k = DECKS[deck];
  const local = t - n * SLIDE_SECONDS;
  const layout = n % 5;
  rect(c, k.bg, 0, 0, W, H);
  rect(c, k.accent, 0, 0, W, 3);
  if (layout === 0) {
    // title slide
    rect(c, k.ink, 18, 40, 120, 9);
    rect(c, k.ink, 18, 54, 84, 9);
    rect(c, k.accent, 18, 72, 36, 3);
    rect(c, k.soft, 18, 82, 70, 4);
    rect(c, k.soft, 150, 20, 28, 28);
    rect(c, k.accent, 158, 28, 12, 12);
  } else if (layout === 1) {
    // bullets appear one after the other
    rect(c, k.ink, 14, 12, 90, 7);
    const shown = Math.min(5, 1 + Math.floor(local / 1.6));
    for (let i = 0; i < shown; i++) {
      const y = 34 + i * 15;
      rect(c, k.accent, 16, y, 4, 4);
      rect(c, i % 2 ? k.soft : k.ink, 26, y, 50 + ((i * 37) % 80), 4);
      rect(c, k.soft, 26, y + 6, 30 + ((i * 53) % 60), 3);
    }
  } else if (layout === 2) {
    // bar chart grows
    rect(c, k.ink, 14, 12, 70, 7);
    const grow = Math.min(1, local / 3);
    for (let i = 0; i < 6; i++) {
      const h = (14 + ((i * 29) % 52)) * grow;
      rect(c, i === 4 ? k.accent : k.soft, 24 + i * 24, 108 - h, 16, h);
    }
    rect(c, k.ink, 18, 108, W - 36, 1);
  } else if (layout === 3) {
    // picture left, text right
    rect(c, k.soft, 12, 18, 84, 84);
    rect(c, k.accent, 24, 60, 30, 42);
    rect(c, k.ink, 60, 44, 24, 58);
    rect(c, k.ink, 106, 22, 70, 7);
    rect(c, k.ink, 106, 36, 56, 4);
    rect(c, k.soft, 106, 46, 66, 4);
    rect(c, k.soft, 106, 56, 60, 4);
    rect(c, k.soft, 106, 66, 44, 4);
  } else {
    // one big number
    rect(c, k.accent, 20, 30, 26, 44);
    rect(c, k.accent, 54, 30, 26, 44);
    rect(c, k.ink, 92, 62, 8, 12);
    rect(c, k.soft, 20, 86, 120, 5);
    rect(c, k.soft, 20, 96, 90, 5);
  }
  // footer: slide dots
  for (let i = 0; i < 5; i++) rect(c, i === layout ? k.accent : k.soft, 14 + i * 7, 112, 4, 3);
  // laser pointer dot wandering over the slide
  if (layout !== 0) rect(c, '#e5342c', 40 + (Math.sin(t * 0.8) * 0.5 + 0.5) * 120, 40 + (Math.cos(t * 0.6) * 0.5 + 0.5) * 50, 3, 3);
}


const LANES = 0.62;

/** Kart racing, seen from behind the driver: bending road, item boxes, coins, a rival, the HUD of the genre. */
function drawRace(c: Ctx, t: number): void {
  const horizon = 46;
  const sky = c.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#3f9cf5');
  sky.addColorStop(1, '#bfe9ff');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, horizon);
  // clouds drift, mountains and a castle stay on the horizon
  for (let i = 0; i < 3; i++) {
    const x = ((i * 70 + t * 3) % (W + 40)) - 20;
    rect(c, '#ffffff', x, 8 + i * 6, 22, 5);
    rect(c, '#ffffff', x + 5, 5 + i * 6, 12, 4);
  }
  const mountains = [[10, 26, 22], [40, 18, 30], [86, 24, 24], [130, 14, 34], [166, 24, 22]];
  for (const [x, h, w] of mountains) {
    for (let r = 0; r < h; r++) {
      const half = (w * (r + 1)) / h / 2;
      rect(c, r < 5 ? '#f4f8ff' : '#5f8fd0', x + w / 2 - half, horizon - h + r, half * 2, 1);
    }
  }
  rect(c, '#e8d8b8', 150, horizon - 14, 14, 14);
  rect(c, '#d9534f', 148, horizon - 20, 18, 6);
  rect(c, '#4b9a52', 0, horizon - 5, W, 5); // tree line
  const bend = Math.sin(t * 0.5) * 50; // the road swings left and right
  const cxAt = (d: number) => W / 2 + bend * (1 - d) * (1 - d);
  const halfAt = (d: number) => 12 + d * 78;
  const lap = 20; // seconds per lap
  for (let y = horizon; y < H; y++) {
    const d = (y - horizon) / (H - horizon); // 0 far .. 1 near
    const z = 1 / (d + 0.04);
    const phase = z * 0.9 + t * 9; // grows with time: the road rushes towards us
    const stripe = Math.floor(phase) % 2 === 0;
    const cx = cxAt(d);
    const half = halfAt(d);
    rect(c, stripe ? '#58b04e' : '#4da245', 0, y, W, 1);
    rect(c, stripe ? '#e5342c' : '#ffffff', cx - half - 5 * d - 2, y, half * 2 + 10 * d + 4, 1); // kerbs
    rect(c, stripe ? '#6e7480' : '#656b77', cx - half, y, half * 2, 1);
    if (Math.floor(z * 0.45 + t * 4.5) % 2 === 0) rect(c, '#f2f2f2', cx - 1 - d * 2, y, 2 + d * 4, 1); // centre line
    // start / finish line once a lap
    const lz = ((t % lap) / lap) * 30;
    if (Math.abs(z - (30 - lz)) < 0.55) {
      for (let i = 0; i < 10; i++) rect(c, (i + Math.floor(y / 2)) % 2 ? '#ffffff' : '#111111', cx - half + (i * half * 2) / 10, y, (half * 2) / 10 + 1, 1);
    }
  }
  // things on the road, far to near: item boxes, coins, bananas
  const things: { d: number; lane: number; kind: number; i: number }[] = [];
  for (let i = 0; i < 9; i++) {
    const zo = 26 - ((t * 10 + i * 5.3) % 25);
    const d = 1 / zo - 0.04;
    if (d <= 0.02 || d > 0.95) continue;
    const lane = ((i * 0.73) % 1.6) - 0.8;
    things.push({ d, lane: lane * LANES / 0.8, kind: i % 3, i });
  }
  things.sort((a, b) => a.d - b.d);
  for (const th of things) {
    const x = cxAt(th.d) + th.lane * halfAt(th.d);
    const y = horizon + th.d * (H - horizon);
    const s = 2 + th.d * 11;
    if (th.kind === 0) {
      // item box: cycling rainbow with a question mark
      const hue = (t * 240 + th.i * 50) % 360;
      rect(c, `hsl(${hue} 90% 55%)`, x - s / 2, y - s, s, s);
      rect(c, '#ffffff', x - s / 2, y - s, s, Math.max(1, s * 0.12));
      if (s > 6) rect(c, '#ffffff', x - 1, y - s * 0.7, Math.max(1, s * 0.2), s * 0.4);
    } else if (th.kind === 1) {
      // coin
      const w = Math.max(1, s * (0.4 + 0.6 * Math.abs(Math.cos(t * 6 + th.i))));
      rect(c, '#ffd23a', x - w / 2, y - s, w, s);
      rect(c, '#c98f0a', x - w / 2, y - s, w, 1);
    } else {
      // banana peel
      rect(c, '#ffe14a', x - s / 2, y - s * 0.6, s, s * 0.6);
      rect(c, '#9a7b1a', x - s / 2, y - s * 0.6, s * 0.25, s * 0.25);
    }
  }
  // rival (green cap) a bit ahead
  const rd = 0.3 + Math.sin(t * 0.4) * 0.04;
  const rx = cxAt(rd) + Math.sin(t * 0.8 + 2) * halfAt(rd) * 0.5;
  const ry = horizon + rd * (H - horizon);
  kart(c, rx, ry, 0.55, '#27a844', '#1b7a31', t + 1);
  // our kart: wobbles through the bends
  const kx = W / 2 + Math.sin(t * 1.3) * 18 - Math.cos(t * 0.5) * 9;
  const ky = 98 + Math.sin(t * 9) * 1;
  kart(c, kx, ky, 1, '#e5342c', '#a81f19', t);
  // HUD: lap, position, item roulette, coins
  rect(c, 'rgba(0,0,0,0.5)', 4, 4, 44, 12);
  hudText(c, `LAP ${Math.floor(t / lap) % 3 + 1}/3`, 8, 13, 8, '#ffffff');
  const first = Math.sin(t * 0.25) > -0.3;
  hudText(c, first ? '1st' : '2nd', W - 38, 20, 16, first ? '#ffd23a' : '#e8edf5');
  rect(c, 'rgba(255,255,255,0.75)', 4, 20, 20, 20);
  rect(c, 'rgba(0,0,0,0.35)', 6, 22, 16, 16);
  const item = Math.floor(t * 2) % 3;
  rect(c, ['#e5342c', '#27a844', '#ffe14a'][item], 9, 25, 10, 10);
  rect(c, '#ffffff', 9, 25, 10, 2);
  rect(c, '#ffd23a', W - 44, 104, 7, 7);
  hudText(c, `x${String(3 + (Math.floor(t * 1.2) % 8)).padStart(2, '0')}`, W - 34, 112, 8, '#ffffff');
}

/** A kart from behind: tyres, body, exhaust flame, driver with a cap. `s` scales it down for far karts. */
function kart(c: Ctx, x: number, y: number, s: number, body: string, dark: string, t: number): void {
  const r = (col: string, dx: number, dy: number, w: number, h: number) => rect(c, col, x + dx * s, y + dy * s, w * s, h * s);
  r('rgba(0,0,0,0.3)', -17, 14, 34, 4); // shadow
  r('#1a1a1a', -18, 6, 9, 11); // rear tyres
  r('#1a1a1a', 9, 6, 9, 11);
  r('#555b66', -16, 8, 5, 2);
  r('#555b66', 11, 8, 5, 2);
  r(dark, -12, 4, 24, 12); // body
  r(body, -12, 2, 24, 9);
  r('#ffd23a', -12, 9, 24, 2);
  r('#2a2f3a', -5, 12, 4, 3); // exhaust
  r('#2a2f3a', 1, 12, 4, 3);
  if (Math.floor(t * 20) % 2 === 0) r('#ffb02e', -4, 15, 2, 2);
  r('#2f56c2', -6, -3, 12, 7); // overalls / shoulders
  r('#f2c9a0', -4, -9, 8, 6); // head
  r(body, -5, -13, 10, 5); // cap
  r(body, -6, -9, 12, 2);
  r('#ffffff', -2, -12, 4, 3);
}

function hudText(c: Ctx, text: string, x: number, y: number, size: number, col: string): void {
  c.font = `italic 800 ${size}px "Arial Black", Arial, sans-serif`;
  c.lineWidth = Math.max(2, size / 4);
  c.strokeStyle = '#1a1a1a';
  c.lineJoin = 'round';
  c.strokeText(text, x, y);
  c.fillStyle = col;
  c.fillText(text, x, y);
}

/** Marco's monitor while he is away during block times (#32): Kurt waving on a warm background, below "KOMPENSIERT". */
export function kurtScreenMaterial(frames: HTMLCanvasElement[] | null): THREE.MeshBasicMaterial {
  let e = cache.get('kurt');
  if (!e) {
    const base = mk();
    const c = base.getContext('2d')!;
    rect(c, '#f3d9a8', 0, 0, W, H);
    rect(c, '#5f6b2a', 0, H - 18, W, 18);
    c.fillStyle = '#f3d9a8';
    c.font = '700 11px "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    c.textAlign = 'center';
    c.fillText('KOMPENSIERT', W / 2, H - 5);
    const live = mk();
    const tex = new THREE.CanvasTexture(live);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    e = { kind: 'kurt', variant: 0, mat, tex, live, base, uses: 0, t: 0, seed: 0, frames: frames ?? undefined };
    paint(live.getContext('2d')!, e);
    cache.set('kurt', e);
    byMat.set(mat, e);
  }
  return e.mat;
}
