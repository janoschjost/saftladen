import * as THREE from 'three';

const SIZE = 192;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;

/** Something with a head to frame: `face` is the head centre (y, z) and radius in rig units (before the root scale). */
export interface PortraitRig {
  root: THREE.Object3D;
  face: { r: number; y: number; z: number };
}

/**
 * Renders a fresh rig, framed on its face, slightly from the side. `pose` runs before each of the `count` shots
 * (frame index); every shot is copied onto its own canvas. Null without WebGL.
 */
function shoot<R extends PortraitRig>(build: () => R, count: number, pose?: (rig: R, i: number) => void): HTMLCanvasElement[] | null {
  try {
    renderer ??= new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    const rig = build();
    const k = rig.root.scale.x;
    const scene = new THREE.Scene();
    scene.add(rig.root);
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(1.5, 2, 3);
    scene.add(sun);
    const fov = 28;
    const f = rig.face;
    const dist = (f.r * k * 1.25) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const cam = new THREE.PerspectiveCamera(fov, 1, 0.05, 20);
    const target = new THREE.Vector3(0, f.y * k, f.z * k);
    cam.position.set(Math.sin(0.5) * dist, target.y + dist * 0.12, target.z + Math.cos(0.5) * dist); // slightly from the side, facing the front
    cam.lookAt(target);
    const shots: HTMLCanvasElement[] = [];
    for (let i = 0; i < count; i++) {
      pose?.(rig, i);
      renderer.render(scene, cam);
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      c.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
      shots.push(c);
    }
    scene.remove(rig.root);
    return shots;
  } catch {
    return null;
  }
}

/** Profile picture of a pet (or Kurt): its low-poly head, rendered once from a fresh rig and cached as a data URL. */
export function petPortrait(key: string, build: () => PortraitRig): string | null {
  const hit = cache.get(key);
  if (hit) return hit;
  const url = shoot(build, 1)?.[0].toDataURL('image/png') ?? null;
  if (url) cache.set(key, url);
  return url;
}

/** A short loop of a rig (e.g. Kurt waving on a monitor), rendered once: `count` frames, each posed by `pose`. */
export function portraitFrames<R extends PortraitRig>(build: () => R, count: number, pose: (rig: R, i: number) => void): HTMLCanvasElement[] | null {
  return shoot(build, count, pose);
}
