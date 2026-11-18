import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CreditsScene } from './CreditsScene';
import type { CreditsHook } from './hook';

const stage = document.getElementById('stage') as HTMLElement;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
stage.appendChild(renderer.domElement);

const world = new CreditsScene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);
camera.position.set(2.8, 3.3, 8.6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(world.focus);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 2.5;
controls.maxDistance = 12;
controls.maxPolarAngle = Math.PI * 0.48; // never under the floor
controls.autoRotate = !reduceMotion;
controls.autoRotateSpeed = 0.5;
controls.update();

// idle: the camera drifts to and fro in front of the scene; a drag stops it for a few seconds
const SWAY = { min: -0.1, max: 1.1 };
let idleAt = 0;
controls.addEventListener('start', () => (controls.autoRotate = false));
controls.addEventListener('end', () => {
  idleAt = performance.now() + 4000;
});

// a tap on Clawd (not the end of a drag) makes him spin; the pointer shows a hand over him
const ray = new THREE.Raycaster();
const aim = (e: PointerEvent): THREE.Raycaster => {
  const box = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1), camera);
  return ray;
};
let down: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
renderer.domElement.addEventListener('pointerup', (e) => {
  const moved = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) : Infinity;
  down = null;
  if (moved < 6 && world.hitsClawd(aim(e))) world.clawd.poke();
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) return;
  renderer.domElement.style.cursor = world.hitsClawd(aim(e)) ? 'pointer' : '';
});

const hook: CreditsHook = {
  clawdScreen: () => world.clawdScreen(camera, stage.clientWidth, stage.clientHeight),
  get pokes() {
    return world.clawd.pokes;
  },
};
window.credits = hook;

const resize = (): void => {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // narrow screens: back off so the whole scene still fits
  camera.fov = w / h < 1 ? 46 : 32;
  camera.updateProjectionMatrix();
};
new ResizeObserver(resize).observe(stage);
resize();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!reduceMotion && idleAt && now > idleAt) {
    idleAt = 0;
    controls.autoRotate = true;
  }
  if (controls.autoRotate) {
    const az = controls.getAzimuthalAngle();
    if (az > SWAY.max) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed);
    else if (az < SWAY.min) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed);
  }
  controls.update(dt);
  world.tick(dt);
  renderer.render(world.scene, camera);
});
