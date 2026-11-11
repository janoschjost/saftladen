import * as THREE from 'three';
import { ANNEX_D, ANNEX_W, OFFICE_D, OFFICE_W } from './officeModel';

export const WORLD = {
  width: OFFICE_W, // x, metres
  depth: OFFICE_D + ANNEX_D, // z, metres (base rectangle + small meeting room annex)
  slab: 0.8, // slab thickness below the floor
};

/** Nav grid resolution in metres (doors are ~0.9 m, desks 0.8 m). */
export const NAV_CELL = 0.5;

/** Mosaic parquet: squares of five strips, alternating direction (4 x 4 squares = 0.64 m per tile). */
function parquetTexture(w: number, d: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const shades = ['#4d3b2b', '#58452f', '#655039', '#715a42', '#5a4632', '#47372a', '#7c6247'];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const horiz = (i + j) % 2 === 0;
      for (let s = 0; s < 5; s++) {
        g.fillStyle = shades[Math.floor(rnd() * shades.length)];
        if (horiz) g.fillRect(i * 64, j * 64 + s * 12.8, 64, 12.8);
        else g.fillRect(i * 64 + s * 12.8, j * 64, 12.8, 64);
      }
      g.strokeStyle = 'rgba(0,0,0,0.22)';
      g.lineWidth = 2;
      g.strokeRect(i * 64, j * 64, 64, 64);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(w / 0.64, d / 0.64);
  tex.anisotropy = 8;
  return tex;
}

/** Parquet floor slab + soft light. Walls and furniture come from the office model (render/officeModel.ts). */
export function buildWorld(scene: THREE.Scene): { sun: THREE.DirectionalLight } {
  const { width: W, slab } = WORLD;
  const D = OFFICE_D;

  const side = new THREE.MeshLambertMaterial({ color: '#dcdcd8' });
  const topMat = new THREE.MeshLambertMaterial({ map: parquetTexture(W, D) });
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W, slab, D), [side, side, topMat, side, side, side]);
  floor.position.set(W / 2, -slab / 2, D / 2);
  floor.receiveShadow = true;
  scene.add(floor);
  // small meeting room annex outside the south wall
  const annexTop = new THREE.MeshLambertMaterial({ map: parquetTexture(ANNEX_W, ANNEX_D) });
  const annex = new THREE.Mesh(new THREE.BoxGeometry(ANNEX_W, slab, ANNEX_D), [side, side, annexTop, side, side, side]);
  annex.position.set(ANNEX_W / 2, -slab / 2, D + ANNEX_D / 2);
  annex.receiveShadow = true;
  scene.add(annex);

  scene.add(new THREE.HemisphereLight('#ffffff', '#c9b8a4', 1.3));
  const sun = new THREE.DirectionalLight('#ffffff', 1.9);
  sun.position.set(W * 0.9, 24, D * 1.6);
  sun.target.position.set(W / 2, 0, D / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const s = 32;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  return { sun };
}
