import * as THREE from 'three';
import type { DogRig } from './dogBuilder';

const SIZE = 192;
const cache = new Map<string, string>();
let renderer: THREE.WebGLRenderer | null = null;

/** Profile picture of a pet: its low-poly head, rendered once from a fresh rig and cached as a data URL. */
export function petPortrait(key: string, build: () => DogRig): string | null {
  const hit = cache.get(key);
  if (hit) return hit;
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
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.root);
    cache.set(key, url);
    return url;
  } catch {
    return null;
  }
}
