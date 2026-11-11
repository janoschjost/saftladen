import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { NavGrid } from '../game/NavGrid';
import { makeCollapsible } from '../ui/collapsible';
import { IsoCamera } from './IsoCamera';
import { ax, az } from './officeModel';
import { WORLD } from './World';

export type ViewMode = 'iso' | 'orbit' | 'plan' | 'walk';

/** Mouse gestures in the controls panel (24px line icons, drawn with currentColor). */
const ICONS = {
  drag: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v4h-4"/>',
  rightDrag: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 3v7"/><path d="M12 3a6 6 0 0 1 6 6v1h-6z" fill="currentColor"/>',
  wheel: '<rect x="6" y="3" width="12" height="18" rx="6"/><path d="M12 7v4"/>',
  click: '<path d="m6 3 13 7-6 2-2 6z"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
  look: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
} as const;

/** One line of the controls panel: a mouse gesture (icon, action, how to do it) or keyboard keys and the action. */
type Hint = { icon: keyof typeof ICONS; text: string; how: string } | { keys: string[]; text: string };
/** The panel lists its lines in small titled groups. */
type HintGroup = { title: string; items: Hint[] };

/** two keys per line (forward/back, left/right) keeps the key column narrow; walk mode also takes the arrow keys */
const wasd = (arrows = false): Hint[] => [
  { keys: ['W', 'S'], text: arrows ? 'Vor / zurück (oder ↑ ↓)' : 'Vor / zurück' },
  { keys: ['A', 'D'], text: arrows ? 'Links / rechts (oder ← →)' : 'Links / rechts' },
];
const PERSON: HintGroup = {
  title: 'Ausgewählte Person',
  items: [{ keys: ['F'], text: 'Folgen' }, { keys: ['C'], text: 'Steuern' }, ...wasd(), { keys: ['Shift'], text: 'Rennen' }],
};
const HINTS: Record<ViewMode, HintGroup[]> = {
  iso: [
    {
      title: 'Maus',
      items: [
        { icon: 'drag', text: 'Verschieben', how: 'Ziehen' },
        { icon: 'wheel', text: 'Zoomen', how: 'Scrollen' },
        { icon: 'person', text: 'Umsetzen', how: 'Person ziehen' },
      ],
    },
    { title: 'Ansicht', items: [{ keys: ['N'], text: 'Namen' }, { keys: ['R'], text: 'Dach' }, { keys: ['H'], text: 'Homeoffice' }] },
    PERSON,
  ],
  orbit: [
    {
      title: 'Maus',
      items: [
        { icon: 'rotate', text: 'Drehen', how: 'Ziehen' },
        { icon: 'rightDrag', text: 'Verschieben', how: 'Rechtsklick + Ziehen' },
        { icon: 'wheel', text: 'Zoomen', how: 'Scrollen' },
        { icon: 'click', text: 'Auswählen', how: 'Person anklicken' },
      ],
    },
    { title: 'Ansicht', items: [{ keys: ['N'], text: 'Namen' }, { keys: ['R'], text: 'Dach' }] },
    PERSON,
  ],
  plan: [
    {
      title: 'Maus',
      items: [
        { icon: 'drag', text: 'Verschieben', how: 'Ziehen' },
        { icon: 'wheel', text: 'Zoomen', how: 'Scrollen' },
      ],
    },
    { title: 'Ansicht', items: [{ keys: ['N'], text: 'Namen' }] },
    PERSON,
  ],
  walk: [
    { title: 'Bewegen', items: [...wasd(true), { keys: ['Shift'], text: 'Rennen' }] },
    { title: 'Maus', items: [{ icon: 'look', text: 'Umschauen', how: 'Ziehen' }, { icon: 'click', text: 'Tür öffnen, Person ansprechen', how: 'Klick' }] },
    { title: 'Ansicht', items: [{ keys: ['E'], text: 'Tür öffnen, Person ansprechen' }, { keys: ['N'], text: 'Namen' }] },
  ],
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), { className }, text === undefined ? {} : { textContent: text });

function hintItem(h: Hint): HTMLLIElement {
  const li = el('li', 'm-help__item');
  const how = el('span', 'm-help__how');
  const label = el('span', 'm-help__label', h.text);
  if ('icon' in h) {
    how.innerHTML = `<span class="m-help__chip"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[h.icon]}</svg></span>`;
    label.append(el('small', 'm-help__gesture', h.how));
  } else {
    // alternatives (W / S) get a slash between the keys
    h.keys.forEach((k, i) => {
      if (i) how.append(el('span', 'm-help__or', '/'));
      how.append(el('kbd', 'm-help__key', k));
    });
  }
  li.append(how, label);
  return li;
}

function hintGroup(g: HintGroup): HTMLLIElement {
  const li = el('li', 'm-help__group');
  const list = el('ul', 'm-help__items');
  list.append(...g.items.map(hintItem));
  li.append(el('span', 'm-help__group-title', g.title), list);
  return li;
}

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
  /** doorway centres: the nav grid is coarser than a door, so these openings are always passable for the player */
  private doorSpots: Array<{ x: number; z: number; r: number }> = [];
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
    const help = document.getElementById('help');
    if (help) makeCollapsible(help, help.querySelector('.m-help__title') as HTMLElement, 'saftladen.help.collapsed');
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

  setDoorways(spots: Array<{ x: number; z: number; r: number }>): void {
    this.doorSpots = spots;
  }

  /** Where the walk-mode eye is (floor metres) and which way it looks (unit vector on the floor). */
  get eye(): { x: number; z: number; dx: number; dz: number } {
    return { x: this.walkPos.x, z: this.walkPos.z, dx: -Math.sin(this.yaw), dz: -Math.cos(this.yaw) };
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
    this.hint?.replaceChildren(...HINTS[mode].map(hintGroup));
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
    if (k.has('ArrowLeft')) this.yaw += 1.6 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.6 * dt;
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
    if (this.doorSpots.some((d) => Math.hypot(x - d.x, z - d.z) < d.r)) return true;
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
