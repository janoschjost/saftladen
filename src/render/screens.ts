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

const cache = new Map<string, THREE.MeshBasicMaterial>();

/** How many different pictures exist for a kind. */
export const screenVariants = (kind: ScreenKind): number => SETS[kind].length;

/** A lit screen for this kind of work; `variant` picks one of its pictures (wraps around). */
export function screenMaterial(kind: ScreenKind, variant: number): THREE.MeshBasicMaterial {
  const set = SETS[kind];
  const v = ((Math.floor(variant) % set.length) + set.length) % set.length;
  const key = `${kind}:${v}`;
  let m = cache.get(key);
  if (!m) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    set[v](canvas.getContext('2d')!, seeded(0x9e3779b1 ^ (v * 7919) ^ kind.length * 131 ^ kind.charCodeAt(0) * 17));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: tex });
    cache.set(key, m);
  }
  return m;
}
