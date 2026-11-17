import * as THREE from 'three';

/** Longest stretch one frame may add to the game: a tab that slept does not run the office in one leap. */
export const MAX_FRAME = 0.25;

/** Where the time of a frame comes from. */
export interface FrameTime {
  /** Real seconds the frame at `now` (ms, as `requestAnimationFrame` gives it) adds to the game. */
  since(now: number): number;
}

/** The clock on the wall: what players get. */
export function wallTime(): FrameTime {
  let last = performance.now();
  return {
    since(now) {
      const dt = Math.min(MAX_FRAME, Math.max(0, (now - last) / 1000));
      last = Math.max(last, now); // a timestamp from before the last frame neither runs time backwards nor makes the next frame longer
      return dt;
    },
  };
}

/** Time that stands still between frames: only `Game.advance` moves the game on (the e2e tests). */
export const stillTime: FrameTime = { since: () => 0 };

/** What puts a frame on the screen. */
export interface Drawer {
  /** Its canvas takes the input. */
  readonly renderer: THREE.WebGLRenderer;
  /** whether the office reaches the screen */
  readonly draws: boolean;
  /** One frame of the office. `look` is what reads the scene on the way: picking, labels, bubbles. */
  frame(scene: THREE.Scene, camera: THREE.Camera, look: () => void): void;
  /** The home office rooms behind the feed tiles: `paint` draws them with the renderer. */
  feeds(paint: (r: THREE.WebGLRenderer) => void): void;
}

function newRenderer(): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

/** Draws with WebGL: what players get. */
export function screenDrawer(): Drawer {
  const renderer = newRenderer();
  return {
    renderer,
    draws: true,
    frame(scene, camera, look) {
      look();
      renderer.render(scene, camera);
    },
    feeds: (paint) => paint(renderer),
  };
}

/**
 * Draws nothing (the e2e tests render WebGL in software, which is slow): it only does what drawing does on the side
 * and `look` relies on, bringing the world matrices up to date.
 */
export function blindDrawer(): Drawer {
  return {
    renderer: newRenderer(),
    draws: false,
    frame(scene, camera, look) {
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      look();
    },
    feeds: () => {},
  };
}
