import * as THREE from 'three';
import type { CharacterRig } from './characterBuilder';
import { propMaterial } from './geo';

/** How see-through the ghost is (0 invisible .. 1 solid). */
const GHOST_OPACITY = 0.45;
/** Cool blue the rig's colours are multiplied with, and the glow that shows in the dark. */
const TINT = '#a9c7ff';
const GLOW = '#4f7fe0';
/** How strong the halo around him and the pool of light on the floor are (0..1), and their size (m). */
const HALO = 0.55;
const POOL = 0.5;
const HALO_SIZE = 3.2;
const POOL_SIZE = 3.6;

/** A soft round blob (white in the middle, nothing at the edge), made from numbers: no canvas needed. Built once, for every visit. */
let blob: THREE.DataTexture | null = null;
function blobTexture(): THREE.DataTexture {
  if (blob) return blob;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot((x + 0.5) / n - 0.5, (y + 0.5) / n - 0.5) * 2; // 0 in the middle, 1 at the edge
      const a = Math.pow(Math.max(0, 1 - d), 2);
      data.set([255, 255, 255, Math.round(a * 255)], (y * n + x) * 4);
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.needsUpdate = true;
  return (blob = tex);
}

/**
 * Turns a person's rig into a ghost (#255): the shared prop material is swapped for a see-through, blue-tinted copy of its
 * own, that casts no shadow. `set(alpha, t)` fades it (0..1 of `GHOST_OPACITY`) and adds a soft flicker; `dispose` frees the
 * material, the halo and the pool of light (the rig's own geometry is the owner's to dispose).
 */
export function ghostify(rig: CharacterRig): { set(alpha: number, t: number): void; dispose(): void } {
  const mat = propMaterial.clone();
  mat.transparent = true;
  mat.depthWrite = false; // limbs do not cut holes in each other
  mat.color.set(TINT);
  mat.emissive.set(GLOW);
  mat.emissiveIntensity = 1;
  rig.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.castShadow = false;
    if (o.material === propMaterial) o.material = mat;
  });
  // he lights up the dark: a halo around him and a pool of blue light on the floor, both additive, so they cost no scene light
  const tex = blobTexture();
  const glow = { map: tex, color: new THREE.Color(GLOW), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const haloMat = new THREE.SpriteMaterial(glow);
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(HALO_SIZE);
  halo.position.y = 0.95;
  const poolMat = new THREE.MeshBasicMaterial(glow);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(POOL_SIZE, POOL_SIZE), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.02;
  pool.renderOrder = 1;
  rig.root.add(halo, pool);
  return {
    set(alpha, t) {
      // a soft flicker: now and then he thins out for a moment
      const flicker = 1 - 0.28 * Math.max(0, Math.sin(t * 9.1) * Math.sin(t * 2.3 + 1));
      mat.opacity = GHOST_OPACITY * alpha * flicker;
      haloMat.opacity = HALO * alpha * flicker;
      poolMat.opacity = POOL * alpha * flicker;
    },
    dispose() {
      mat.dispose();
      haloMat.dispose();
      poolMat.dispose();
      pool.geometry.dispose(); // (the blob texture is shared by every visit and stays)
    },
  };
}
