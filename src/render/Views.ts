import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { NavGrid } from '../game/NavGrid';
import { IsoCamera } from './IsoCamera';
import { ax, az } from './officeModel';
import { WORLD } from './World';

export type ViewMode = 'iso' | 'orbit' | 'plan' | 'walk';

const HINTS: Record<ViewMode, string> = {
  iso: 'Ziehen zum Verschieben · Scrollen zum Zoomen · Person ziehen · N Namen · R Dach · H Homeoffice · F Folgen · C Auswahl steuern (WASD)',
  orbit: 'Ziehen zum Drehen · Rechtsklick-Ziehen zum Verschieben · Scrollen zum Zoomen · N Namen · R Dach · Person anklicken, F folgen, C zum Steuern (WASD, Shift = rennen)',
  plan: 'Ziehen zum Verschieben · Scrollen zum Zoomen · N Namen · F Folgen · C Auswahl steuern (WASD)',
  walk: 'W A S D / Pfeiltasten zum Gehen · Shift = rennen · Ziehen zum Umschauen · N Namen',
};

const DEFAULT_MODE: ViewMode = 'orbit';
const EYE = 1.65;
const WALK_SPEED = 2.2;
const RUN_SPEED = 5;
const WALK_RADIUS = 0.3;

/** Camera modes: isometric (default), free orbit, top-down floor plan and first-person walk-through. */
export class Views {
  mode: ViewMode = DEFAULT_MODE;
  readonly iso: IsoCamera;
  private persp = new THREE.PerspectiveCamera(60, 1, 0.05, 400);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
  private orbit: OrbitControls;
  private planCtl: OrbitControls;
  private center = new THREE.Vector3(WORLD.width / 2, 0, WORLD.depth / 2);
  private aspect = 1;
  private keys = new Set<string>();
  private yaw = -Math.PI / 2; // looking along +x (down the corridor)
  private pitch = -0.05;
  private walkPos = new THREE.Vector3(ax(-4.2), EYE, az(1.1));
  private look: { id: number } | null = null;
  private moved = 0;
  private buttons: HTMLButtonElement[];
  private hint: HTMLElement | null;

  constructor(
    private stage: HTMLElement,
    canvas: HTMLElement,
    private nav: NavGrid,
    private onChange: (mode: ViewMode) => void,
  ) {
    this.iso = new IsoCamera(stage);

    // orbit
    this.orbit = new OrbitControls(this.persp, canvas);
    this.orbit.target.copy(this.center);
    this.orbit.maxPolarAngle = Math.PI / 2 - 0.02;
    this.orbit.minDistance = 3;
    this.orbit.maxDistance = 150;
    this.orbit.enableDamping = true;
    this.resetOrbit();

    // plan: orthographic, looking down with -z up the screen (core rooms on top, like the floor plan)
    this.ortho.position.set(this.center.x, 60, this.center.z);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(this.center);
    this.planCtl = new OrbitControls(this.ortho, canvas);
    this.planCtl.target.copy(this.center);
    this.planCtl.enableRotate = false;
    this.planCtl.screenSpacePanning = true;
    this.planCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.planCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.planCtl.update();

    this.buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
    this.hint = document.getElementById('hint');
    this.buttons.forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.view as ViewMode)));
    this.bind();
    // deep link: #orbit | #plan | #walk | #walk@x,z,yaw (game metres, radians)
    const [h, at] = location.hash.slice(1).split('@');
    const start = h as ViewMode;
    if (at) {
      const [x, z, yaw] = at.split(',').map(Number);
      this.walkPos.set(x, EYE, z);
      if (!Number.isNaN(yaw)) this.yaw = yaw;
    }
    this.setMode(['iso', 'orbit', 'plan', 'walk'].includes(start) ? start : DEFAULT_MODE);
  }

  get camera(): THREE.Camera {
    return this.mode === 'iso' ? this.iso.camera : this.mode === 'plan' ? this.ortho : this.persp;
  }

  /** true when the last pointer gesture moved more than a click's worth */
  get wasDrag(): boolean {
    return this.moved > 5;
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.iso.enabled = mode === 'iso';
    this.orbit.enabled = mode === 'orbit';
    this.planCtl.enabled = mode === 'plan';
    this.persp.rotation.order = mode === 'walk' ? 'YXZ' : 'XYZ';
    if (mode === 'orbit') this.resetOrbit();
    if (mode === 'walk') this.applyWalk();
    this.buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === mode)));
    if (this.hint) this.hint.textContent = HINTS[mode];
    this.stage.dataset.view = mode;
    this.onChange(mode);
    this.resize(window.innerWidth, window.innerHeight);
  }

  resize(w: number, h: number): void {
    this.aspect = w / h;
    this.iso.resize(w, h);
    this.persp.aspect = this.aspect;
    this.persp.updateProjectionMatrix();
    const fw = WORLD.width + 4;
    const fh = WORLD.depth + 4;
    const half = Math.max(fw / 2, (fh / 2) * this.aspect);
    Object.assign(this.ortho, { left: -half, right: half, top: half / this.aspect, bottom: -half / this.aspect });
    this.ortho.updateProjectionMatrix();
  }

  update(dt: number): void {
    if (this.mode === 'iso') this.iso.update(dt);
    else if (this.mode === 'orbit') this.orbit.update();
    else if (this.mode === 'plan') this.planCtl.update();
    else this.walk(dt);
  }

  /** Camera tracks a steered person: iso moves its centre, orbit shifts camera and target together. */
  follow(x: number, z: number, dt: number): void {
    if (this.mode === 'iso') this.iso.follow(x, z, dt);
    else if (this.mode === 'orbit') {
      const k = Math.min(1, dt * 4);
      const dx = (x - this.orbit.target.x) * k;
      const dz = (z - this.orbit.target.z) * k;
      this.orbit.target.x += dx;
      this.orbit.target.z += dz;
      this.persp.position.x += dx;
      this.persp.position.z += dz;
    }
  }

  private resetOrbit(): void {
    const k = WORLD.width / 41;
    this.persp.position.set(this.center.x - 4 * k, 22 * k, this.center.z + 22 * k);
    this.orbit.target.copy(this.center);
    this.orbit.update();
  }

  private applyWalk(): void {
    this.persp.position.copy(this.walkPos);
    this.persp.rotation.set(this.pitch, this.yaw, 0);
  }

  private walk(dt: number): void {
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (k.has('ArrowLeft') || k.has('KeyQ')) this.yaw += 1.6 * dt;
    if (k.has('ArrowRight') || k.has('KeyE')) this.yaw -= 1.6 * dt;
    if (f || s) {
      const sp = (run ? RUN_SPEED : WALK_SPEED) * dt;
      const dx = (-Math.sin(this.yaw) * f + Math.cos(this.yaw) * s) * sp;
      const dz = (-Math.cos(this.yaw) * f - Math.sin(this.yaw) * s) * sp;
      // axis-separated so you slide along walls and furniture
      if (this.free(this.walkPos.x + dx, this.walkPos.z)) this.walkPos.x += dx;
      if (this.free(this.walkPos.x, this.walkPos.z + dz)) this.walkPos.z += dz;
    }
    this.applyWalk();
  }

  /** Walkable at p, with a little clearance (checks the four sides of the body). */
  private free(x: number, z: number): boolean {
    const r = WALK_RADIUS;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const c = this.nav.toCell({ x: x + ox, z: z + oz });
      if (!this.nav.walkable(c.cx, c.cz)) return false;
    }
    return true;
  }

  private bind(): void {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      const modes: ViewMode[] = ['iso', 'orbit', 'plan', 'walk'];
      const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (i >= 0) this.setMode(modes[i]);
      if (e.code === 'Escape' && this.mode === 'walk') this.setMode(DEFAULT_MODE);
      if (this.mode === 'walk' && e.code.startsWith('Arrow')) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // click-vs-drag tracking for every mode, and mouse-look for the walk mode
    this.stage.addEventListener('pointerdown', (e) => {
      this.moved = 0;
      if (this.mode === 'walk') {
        this.look = { id: e.pointerId };
        this.stage.setPointerCapture(e.pointerId);
      }
    });
    this.stage.addEventListener('pointermove', (e) => {
      if (e.buttons) this.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      if (this.mode !== 'walk' || !this.look) return;
      this.yaw -= e.movementX * 0.004;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.3, 1.3);
    });
    const end = (e: PointerEvent) => {
      this.look = null;
      if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
  }
}
