import * as THREE from 'three';

/** Seat height drop of a sitting person (hip goes from 0.8 down to 0.4). */
export const SIT_DROP = 0.4;

export interface DeskRig {
  root: THREE.Group;
  screen: THREE.Mesh;
}

// ---- screen textures (one set shared by every monitor)

function makeTexture(draw: (c: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 80;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, canvas.width, canvas.height);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function lines(ctx: CanvasRenderingContext2D, w: number, colors: string[], x0: number, y0: number, step: number, rows: number): void {
  for (let i = 0; i < rows; i++) {
    const indent = Math.floor(Math.random() * 3) * 10;
    const len = 14 + Math.random() * (w - x0 - indent - 18);
    ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillRect(x0 + indent, y0 + i * step, len, 4);
  }
}

let screenMats: THREE.MeshBasicMaterial[] | null = null;
let screenOff: THREE.MeshBasicMaterial | null = null;

/** Dark (idle) screen material. */
export function screenOffMaterial(): THREE.MeshBasicMaterial {
  screenOff ??= new THREE.MeshBasicMaterial({ color: '#1b212c' });
  return screenOff;
}

/** A random lit screen: code editor, text document or design tool. */
export function screenOnMaterial(): THREE.MeshBasicMaterial {
  screenMats ??= [
    makeTexture((c, w, h) => {
      c.fillStyle = '#16213a';
      c.fillRect(0, 0, w, h);
      lines(c, w, ['#7fd1b9', '#f2c46d', '#8fb3ff', '#e6e9f2', '#e68aa0'], 8, 8, 8, 8);
    }),
    makeTexture((c, w, h) => {
      c.fillStyle = '#f6f7f9';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#17304f';
      c.fillRect(10, 8, 54, 7);
      lines(c, w, ['#b9c0cb', '#c9ced7'], 10, 24, 8, 7);
    }),
    makeTexture((c, w, h) => {
      c.fillStyle = '#eceff4';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#17304f';
      c.fillRect(0, 0, 16, h);
      c.fillStyle = '#ffffff';
      c.fillRect(24, 10, 46, 34);
      c.fillStyle = '#f2c46d';
      c.fillRect(76, 10, 40, 22);
      c.fillStyle = '#8fb3ff';
      c.fillRect(24, 50, 28, 22);
      c.fillStyle = '#e68aa0';
      c.fillRect(58, 40, 58, 32);
    }),
  ].map((map) => new THREE.MeshBasicMaterial({ map }));
  return screenMats[Math.floor(Math.random() * screenMats.length)];
}
