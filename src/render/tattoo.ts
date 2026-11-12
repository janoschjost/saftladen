import * as THREE from 'three';
import { seeded } from '../game/rng';

export type TattooKind = 'vine' | 'script' | 'dark';

const W = 128;
const H = 384;
const cache = new Map<string, THREE.CanvasTexture>();

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, ang: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0);
  ctx.fill();
  ctx.restore();
}

function vine(ctx: CanvasRenderingContext2D, r: () => number, y0: number, y1: number, amp: number, heavy: boolean) {
  const cx = W / 2;
  ctx.lineWidth = heavy ? 4 : 3;
  ctx.beginPath();
  const x = (y: number) => cx + Math.sin((y - y0) / 38) * amp;
  ctx.moveTo(x(y0), y0);
  for (let y = y0; y <= y1; y += 4) ctx.lineTo(x(y), y);
  ctx.stroke();
  for (let y = y0 + 10, i = 0; y < y1; y += 18 + r() * 10, i++) {
    const dir = i % 2 ? 1 : -1;
    const len = (heavy ? 22 : 16) + r() * 14;
    leaf(ctx, x(y), y, len, (dir > 0 ? 0 : Math.PI) + (r() - 0.5) * 0.9 - dir * 0.35);
    if (r() < 0.45) {
      ctx.beginPath();
      ctx.arc(x(y) + dir * (len + 4), y - 6, 2 + r() * 2, 0, 7);
      ctx.fill();
    }
  }
}

function draw(kind: TattooKind, face: 'front' | 'outer', seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const r = seeded(seed);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // ink under skin: soft blue-black, slightly translucent
  const ink = kind === 'dark' ? 'rgba(16,19,26,0.93)' : 'rgba(34,42,58,0.86)';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  if (kind === 'vine') {
    if (face === 'outer') {
      // heavy dark patch near the elbow, then a winding botanical vine
      ctx.beginPath();
      ctx.ellipse(W / 2, 40, 40, 34, 0.3, 0, 7);
      ctx.fill();
      vine(ctx, r, 70, H - 24, 22, true);
    } else {
      vine(ctx, r, 120, H - 40, 12, false);
    }
  } else if (kind === 'script') {
    ctx.lineWidth = 2;
    const rows = face === 'outer' ? [W * 0.38, W * 0.62] : [W * 0.5];
    for (const rx of rows) {
      // handwriting-like squiggles running down the forearm
      let y = 150;
      while (y < H - 70) {
        const run = 6 + r() * 14;
        ctx.beginPath();
        ctx.moveTo(rx - 5, y);
        for (let k = 0; k <= 6; k++) ctx.lineTo(rx + (k % 2 ? 5 : -5), y + (k / 6) * run);
        ctx.stroke();
        y += run + 5 + r() * 4;
      }
    }
    if (face === 'outer') {
      // small ornament near the top
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(W / 2, 62, 24, 0, 7);
      ctx.stroke();
      for (let k = 0; k < 8; k++) leaf(ctx, W / 2, 62, 34, (k / 8) * 6.283);
    }
  } else {
    // dark: solid hand illustration under the sleeve, snake down the forearm, lattice band at the wrist
    ctx.beginPath();
    ctx.ellipse(W / 2, 74, 30, 28, 0, 0, 7);
    ctx.fill();
    for (let k = 0; k < 4; k++) {
      const fx = W / 2 - 27 + k * 18;
      ctx.beginPath();
      ctx.roundRect(fx - 7, 12 + Math.abs(k - 1.5) * 8, 14, 52, 7);
      ctx.fill();
    }
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(W / 2, 80, 6, 0, 7);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = ink;
    // snake
    ctx.beginPath();
    for (let y = 130; y <= 310; y += 3) {
      const x = W / 2 + Math.sin((y - 130) / 17) * 32 * (face === 'outer' ? 0.9 : 1);
      if (y === 130) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(16,19,26,0.8)';
    for (let y = 134; y < 306; y += 7) {
      const x = W / 2 + Math.sin((y - 130) / 17) * 32;
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 8, y + 4);
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.ellipse(W / 2, 124, 9, 13, 0, 0, 7);
    ctx.fill();
    // lattice band
    ctx.fillRect(0, 330, W, 54);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let yy = 336; yy < 384; yy += 12) {
      for (let xx = (yy / 12) % 2 ? 8 : 20; xx < W; xx += 24) {
        ctx.beginPath();
        ctx.moveTo(xx, yy - 4);
        ctx.lineTo(xx + 5, yy + 2);
        ctx.lineTo(xx, yy + 8);
        ctx.lineTo(xx - 5, yy + 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  return c;
}

function texture(kind: TattooKind, face: 'front' | 'outer', seed: number): THREE.CanvasTexture {
  const key = `${kind}:${face}:${seed}`;
  let t = cache.get(key);
  if (!t) {
    t = new THREE.CanvasTexture(draw(kind, face, seed));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    cache.set(key, t);
  }
  return t;
}

/** Flat ink drawn onto a texture and wrapped over the skin of an arm segment (no geometry bulk). */
export function tattooOverlay(w: number, h: number, d: number, side: 1 | -1, kind: TattooKind): THREE.Mesh {
  const e = 0.0015;
  const g = new THREE.BoxGeometry(w + e * 2, h, d + e * 2);
  const mk = (face: 'front' | 'outer') =>
    new THREE.MeshLambertMaterial({
      map: texture(kind, face, face === 'front' ? 3 : side === 1 ? 7 : 11),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const mats = [hidden, hidden, hidden, hidden, mk('front'), hidden];
  mats[side === 1 ? 0 : 1] = mk('outer');
  const m = new THREE.Mesh(g, mats);
  m.renderOrder = 1;
  m.userData.nonav = true;
  return m;
}
