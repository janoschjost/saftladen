import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { icon, type IconName } from '../ui/icons';
import { Popover } from '../ui/Popover';
import { walkFree, type WalkColliders } from '../game/walkCollision';
import { blendShot, easeInOut, FLY_TIME, INTRO_TIME, introShot, shotFrom, shotPosition, TRAIL, type Shot } from './cameraFly';
import { IsoCamera } from './IsoCamera';
import { allowedView, DEFAULT_MODE, nextView, PICKABLE, startView } from './viewMode';
import { isTouch } from '../ui/device';
import { ax, az } from './officeModel';
import { WORLD } from './World';

/** Pixels a press may move and still count as a click (trackpad and mouse jitter); past it, it is a drag. */
export const CLICK_SLOP = 8;

/** `third` is the behind-the-shoulder camera of the day-in-the-life mode; it has no segment in the settings popover. */
export type ViewMode = 'iso' | 'orbit' | 'plan' | 'walk' | 'third';

/** Everything needed to put the camera back where it was (saved between visits). */
export interface ViewSnapshot {
  mode: ViewMode;
  iso: { x: number; z: number; zoom: number };
  orbit: { p: number[]; t: number[] };
  plan: { p: number[]; t: number[]; zoom: number };
  walk: { x: number; z: number; yaw: number; pitch: number };
}

/** Mouse gestures in the controls list, by icon name (`src/ui/icons.ts`). */
const GESTURES = {
  drag: 'drag',
  rotate: 'rotate',
  rightDrag: 'hand',
  wheel: 'zoom',
  click: 'pointer',
  person: 'person',
  look: 'eye',
} as const satisfies Record<string, IconName>;

/** One line of the controls list: a mouse gesture (icon, action, how to do it) or keyboard keys and the action. */
type Hint = { icon: keyof typeof GESTURES; text: string; how: string } | { keys: string[]; text: string };
/** The list shows its lines in small titled groups. */
type HintGroup = { title: string; items: Hint[] };

/** two keys per line (forward/back, left/right) keeps the key column narrow; walk mode also takes the arrow keys */
const wasd = (arrows = false): Hint[] => [
  { keys: ['W', 'S'], text: arrows ? 'Vor / zurück (oder ↑ ↓)' : 'Vor / zurück' },
  { keys: ['A', 'D'], text: arrows ? 'Links / rechts (oder ← →)' : 'Links / rechts' },
];
const PERSON: HintGroup = {
  title: 'Ausgewählte Person',
  items: [{ keys: ['F'], text: 'Folgen' }, { keys: ['C'], text: 'Steuern' }, ...wasd(), { keys: ['Shift'], text: 'Rennen' }, { keys: ['Leertaste'], text: 'Springen (beim Steuern)' }],
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
    { title: 'Ansicht', items: [{ keys: ['1–4'], text: 'Ansicht' }, { keys: ['N'], text: 'Namen' }, { keys: ['R'], text: 'Dach' }, { keys: ['H'], text: 'Homeoffice' }] },
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
    { title: 'Ansicht', items: [{ keys: ['1–4'], text: 'Ansicht' }, { keys: ['N'], text: 'Namen' }, { keys: ['R'], text: 'Dach' }] },
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
    { title: 'Ansicht', items: [{ keys: ['1–4'], text: 'Ansicht' }, { keys: ['N'], text: 'Namen' }] },
    PERSON,
  ],
  walk: [
    { title: 'Bewegen', items: [...wasd(true), { keys: ['Shift'], text: 'Rennen' }, { keys: ['Leertaste'], text: 'Springen' }] },
    { title: 'Maus', items: [{ icon: 'look', text: 'Umschauen (Klick fängt die Maus, Esc löst sie)', how: 'Maus bewegen' }, { icon: 'click', text: 'Tür öffnen, Person ansprechen', how: 'Klick' }] },
    { title: 'Ansicht', items: [{ keys: ['E'], text: 'Tür öffnen, Person ansprechen' }, { keys: ['N'], text: 'Namen' }] },
  ],
  third: [
    { title: 'Bewegen', items: [...wasd(true), { keys: ['Shift'], text: 'Rennen' }] },
    { title: 'Maus', items: [{ icon: 'look', text: 'Kamera drehen (Klick fängt die Maus, Esc löst sie)', how: 'Maus bewegen' }, { icon: 'wheel', text: 'Zoomen', how: 'Scrollen' }] },
    { title: 'Tag', items: [{ keys: ['Esc'], text: 'Beenden' }, { keys: ['N'], text: 'Namen' }] },
  ],
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), { className }, text === undefined ? {} : { textContent: text });

function hintItem(h: Hint): HTMLLIElement {
  const li = el('li', 'm-help__item');
  const how = el('span', 'm-help__how');
  const label = el('span', 'm-help__label', h.text);
  if ('icon' in h) {
    how.innerHTML = `<span class="m-help__chip">${icon(GESTURES[h.icon], 16)}</span>`;
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

const EYE = 1.65;
const WALK_SPEED = 2.2;
const RUN_SPEED = 5;
const WALK_RADIUS = 0.3;
const JUMP_SPEED = 3.1; // m/s upwards at take-off of a jump in walk mode (about half a metre)
const GRAVITY = 9.8;
const ACCEL = 14; // m/s²: how fast the walk speed follows the keys (start and stop ease instead of snapping)
const FOV_WALK = 60;
const FOV_RUN = 68;
const LOOK_SMOOTH = 22; // higher = the view follows the mouse more tightly
const FOV_THIRD = 52;
const FOV_THIRD_RUN = 62; // widens while sprinting
const THIRD_DIST = [2.2, 9] as const; // zoom range of the behind-the-shoulder camera (metres)
const THIRD_FOCUS = 1.25; // height of the point the third-person camera looks at (shoulders)

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
  /** smoothed view angles that the camera really uses; yaw / pitch are the targets the mouse sets */
  private viewYaw = -Math.PI / 2;
  private viewPitch = -0.05;
  private vel = { x: 0, z: 0 };
  private bob = 0; // head-bob phase
  private bobAmp = 0;
  private roll = 0;
  private fov = FOV_WALK;
  private walkPos = new THREE.Vector3(ax(-4.2), EYE, az(1.1));
  /** walk mode: height of the jump above the floor and its climb speed */
  private hop = 0;
  private hopSpeed = 0;
  private look: { id: number } | null = null;
  /** third-person camera: where it looks (smoothed), the mouse targets, the smoothed angles and the distance */
  private thirdGoal = new THREE.Vector3();
  private thirdAt = new THREE.Vector3();
  private thirdYaw = 0;
  private thirdElev = 0.5;
  private thirdViewYaw = 0;
  private thirdViewElev = 0.5;
  private thirdDist = 4.6;
  /** 0..1 eased: the player is sprinting (wider view, camera drops back a little) */
  private sprint = 0;
  private sprintGoal = 0;
  private moved = 0;
  private pressAt = { x: 0, y: 0 };
  private hint: HTMLElement | null;
  /** Orbit camera flight (Aktionen): from a shot to a fixed shot, or to a moving one it keeps trailing after arrival */
  private fly: { from: Shot; to: Shot | (() => Shot); t: number; dur: number } | null = null;
  /** the player grabbed the Orbit camera (drag, wheel, touch): a running flight stops first */
  onUserCamera: (() => void) | null = null;

  constructor(
    private stage: HTMLElement,
    canvas: HTMLElement,
    private colliders: WalkColliders,
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
    this.orbit.addEventListener('start', () => {
      this.fly = null;
      this.onUserCamera?.();
    });
    this.resetOrbit();

    // plan: orthographic, looking down with -z up the screen (core rooms on top, like the floor plan)
    this.ortho.position.set(this.center.x, 60, this.center.z);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(this.center);
    this.planCtl = new OrbitControls(this.ortho, canvas);
    this.planCtl.target.copy(this.center);
    this.planCtl.enableRotate = false;
    this.planCtl.minZoom = 0.3; // zoomed out no further than the city reaches: the screen stays full of it
    this.planCtl.screenSpacePanning = true;
    this.planCtl.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.planCtl.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.planCtl.update();

    this.hint = document.getElementById('hint');
    const help = document.getElementById('help');
    // the ? button next to the sun and gear opens the controls list of the current view
    if (help) new Popover(help, document.getElementById('open-help') as HTMLButtonElement, { close: document.getElementById('help-close') });
    document.getElementById('walk-exit')?.addEventListener('click', () => this.setMode(DEFAULT_MODE));
    // phone bar: one button steps through Iso, Orbit and Grundriss
    document.getElementById('cycle-view')?.addEventListener('click', () => this.setMode(nextView(this.mode)));
    this.bind();
    // deep link: #orbit | #plan | #walk | #walk@x,z,yaw (game metres, radians); a touch screen gets Orbit for #walk
    const start = startView(location.hash, isTouch());
    if (start.at) {
      this.walkPos.set(start.at.x, EYE, start.at.z);
      if (!Number.isNaN(start.at.yaw)) this.yaw = start.at.yaw;
    }
    this.setMode(start.mode);
  }

  get camera(): THREE.Camera {
    return this.mode === 'iso' ? this.iso.camera : this.mode === 'plan' ? this.ortho : this.persp;
  }

  snapshot(): ViewSnapshot {
    return {
      mode: this.mode,
      iso: this.iso.getState(),
      orbit: { p: this.persp.position.toArray(), t: this.orbit.target.toArray() },
      plan: { p: this.ortho.position.toArray(), t: this.planCtl.target.toArray(), zoom: this.ortho.zoom },
      walk: { x: this.walkPos.x, z: this.walkPos.z, yaw: this.yaw, pitch: this.pitch },
    };
  }

  /** Puts all four cameras back; the mode is only switched when `withMode` (a deep link in the URL wins). */
  restore(s: Partial<ViewSnapshot>, withMode: boolean): void {
    const ok = (a: unknown, n: number): a is number[] => Array.isArray(a) && a.length === n && a.every((v) => Number.isFinite(v));
    if (s.iso && [s.iso.x, s.iso.z, s.iso.zoom].every(Number.isFinite)) this.iso.setState(s.iso);
    if (s.walk && [s.walk.x, s.walk.z, s.walk.yaw, s.walk.pitch].every(Number.isFinite)) {
      this.walkPos.set(s.walk.x, EYE, s.walk.z);
      this.yaw = s.walk.yaw;
      this.pitch = s.walk.pitch;
    }
    if (s.orbit && ok(s.orbit.p, 3) && ok(s.orbit.t, 3)) {
      this.persp.position.fromArray(s.orbit.p);
      this.orbit.target.fromArray(s.orbit.t);
      this.orbit.update();
    }
    if (s.plan && ok(s.plan.p, 3) && ok(s.plan.t, 3) && Number.isFinite(s.plan.zoom)) {
      this.ortho.position.fromArray(s.plan.p);
      this.planCtl.target.fromArray(s.plan.t);
      this.ortho.zoom = s.plan.zoom;
      this.ortho.updateProjectionMatrix();
      this.planCtl.update();
    }
    if (withMode && s.mode && s.mode !== this.mode && PICKABLE.includes(s.mode)) this.setMode(s.mode, true);
  }

  /** Where the walk-mode eye is (floor metres) and which way it looks (unit vector on the floor). */
  get eye(): { x: number; z: number; dx: number; dz: number } {
    return { x: this.walkPos.x, z: this.walkPos.z, dx: -Math.sin(this.yaw), dz: -Math.cos(this.yaw) };
  }

  /** true when the last pointer gesture moved more than a click's worth */
  get wasDrag(): boolean {
    return this.moved > CLICK_SLOP;
  }

  /** `keepCamera`: the orbit camera stays where `restore` put it instead of jumping back to the default spot. Walk mode on a touch screen: Orbit. */
  setMode(asked: ViewMode, keepCamera = false): void {
    const mode = allowedView(asked, isTouch());
    this.mode = mode;
    this.iso.enabled = mode === 'iso';
    this.orbit.enabled = mode === 'orbit';
    this.planCtl.enabled = mode === 'plan';
    this.persp.rotation.order = mode === 'walk' ? 'YXZ' : 'XYZ';
    if (mode !== 'walk' && mode !== 'third') {
      if (this.locked) document.exitPointerLock();
      this.fov = this.persp.fov = FOV_WALK;
      this.persp.updateProjectionMatrix();
    }
    if (mode === 'third') {
      this.fov = this.persp.fov = FOV_THIRD;
      this.persp.updateProjectionMatrix();
    }
    if (mode !== 'orbit') this.fly = null;
    if (mode === 'orbit' && !keepCamera) this.resetOrbit();
    if (mode === 'walk') this.applyWalk();
    this.hint?.replaceChildren(...HINTS[mode].map(hintGroup));
    this.stage.dataset.view = mode;
    document.body.dataset.view = mode; // the HUD hides gear and Aktionen in walk and day mode
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
    else if (this.mode === 'orbit') {
      if (this.fly) this.updateFly(dt);
      this.orbit.update();
    }
    else if (this.mode === 'plan') this.planCtl.update();
    else if (this.mode === 'third') this.third(dt);
    else this.walk(dt);
  }

  /** Switches to the third-person camera, right behind somebody at (x, z) who faces `facing` (radians, the walker's yaw). */
  enterThird(x: number, z: number, facing: number): void {
    this.sprint = this.sprintGoal = 0;
    this.thirdYaw = this.thirdViewYaw = facing + Math.PI;
    this.thirdElev = this.thirdViewElev = 0.5;
    this.thirdGoal.set(x, THIRD_FOCUS, z);
    this.thirdAt.copy(this.thirdGoal);
    this.setMode('third');
    this.third(0);
  }

  /** Sprinting in third person: the view widens and the camera trails further back. */
  setSprint(on: boolean): void {
    this.sprintGoal = on ? 1 : 0;
  }

  /** Where the third-person camera looks (floor metres); it eases there. */
  setThirdTarget(x: number, z: number): void {
    this.thirdGoal.set(x, THIRD_FOCUS, z);
  }

  /** Eases the camera behind the target; the mouse sets the angles, the wheel the distance. */
  private third(dt: number): void {
    const lk = 1 - Math.exp(-LOOK_SMOOTH * dt);
    this.thirdViewYaw += (this.thirdYaw - this.thirdViewYaw) * lk;
    this.thirdViewElev += (this.thirdElev - this.thirdViewElev) * lk;
    this.thirdAt.lerp(this.thirdGoal, Math.min(1, dt * 12));
    this.sprint += (this.sprintGoal - this.sprint) * Math.min(1, dt * 5);
    const fov = FOV_THIRD + (FOV_THIRD_RUN - FOV_THIRD) * this.sprint;
    if (Math.abs(this.persp.fov - fov) > 0.01) {
      this.persp.fov = fov;
      this.persp.updateProjectionMatrix();
    }
    const dist = this.thirdDist * (1 + 0.12 * this.sprint);
    const flat = Math.cos(this.thirdViewElev) * dist;
    this.persp.position.set(
      this.thirdAt.x + Math.sin(this.thirdViewYaw) * flat,
      this.thirdAt.y + Math.sin(this.thirdViewElev) * dist,
      this.thirdAt.z + Math.cos(this.thirdViewYaw) * flat,
    );
    this.persp.lookAt(this.thirdAt);
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
    this.applyShot(this.overviewShot());
    this.orbit.update();
  }

  /** The default Orbit shot: the whole office from the front, slightly from the left. */
  overviewShot(): Shot {
    const k = WORLD.width / 41;
    return shotFrom({ x: this.center.x - 4 * k, y: 22 * k, z: this.center.z + 22 * k }, this.center);
  }

  /** Where the Orbit camera looks from right now. */
  get orbitShot(): Shot {
    return shotFrom(this.persp.position, this.orbit.target);
  }

  get flying(): boolean {
    return !!this.fly;
  }

  /**
   * Flies the Orbit camera to a shot in `duration` seconds (eased, the azimuth the short way round). A function goal
   * is a moving shot (a walking person): it is read every frame and trailed after arrival until `stopFly`.
   * Only in Orbit; with reduced motion the camera cuts instead.
   */
  flyTo(goal: Shot | (() => Shot), duration = FLY_TIME): void {
    if (this.mode !== 'orbit') return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fly = { from: this.orbitShot, to: goal, t: 0, dur: still ? 0 : duration };
  }

  /** Where the fly-in starts and the Orbit camera's field of view: the origin-story intro ends on this picture (#322). */
  get flyInStart(): { shot: Shot; fov: number } {
    return { shot: introShot(this.overviewShot()), fov: this.persp.fov };
  }

  /** Reload: jumps to a far, high shot and flies to the neutral overview. Orbit only. */
  flyIn(): void {
    if (this.mode !== 'orbit') return;
    const to = this.overviewShot();
    this.applyShot(introShot(to));
    this.orbit.update();
    this.flyTo(to, INTRO_TIME);
  }

  stopFly(): void {
    this.fly = null;
  }

  private updateFly(dt: number): void {
    const f = this.fly!;
    const goal = typeof f.to === 'function' ? f.to() : f.to;
    if (f.t < 1) {
      f.t = f.dur > 0 ? Math.min(1, f.t + dt / f.dur) : 1;
      this.applyShot(blendShot(f.from, goal, easeInOut(f.t)));
    } else if (typeof f.to === 'function') {
      this.applyShot(blendShot(this.orbitShot, goal, 1 - Math.exp(-TRAIL * dt)));
    } else {
      this.applyShot(goal);
      this.fly = null;
    }
  }

  private applyShot(s: Shot): void {
    const p = shotPosition(s);
    this.persp.position.set(p.x, p.y, p.z);
    this.orbit.target.set(s.x, s.y, s.z);
  }

  private applyWalk(): void {
    this.viewYaw = this.yaw;
    this.viewPitch = this.pitch;
    this.vel.x = this.vel.z = 0;
    this.hop = this.hopSpeed = 0;
    this.persp.position.copy(this.walkPos);
    this.persp.rotation.set(this.pitch, this.yaw, 0);
  }

  /** Pointer-locked mouse look (no button held). */
  get locked(): boolean {
    return document.pointerLockElement === this.stage;
  }

  private walk(dt: number): void {
    const k = this.keys;
    const run = k.has('ShiftLeft') || k.has('ShiftRight');
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    if (k.has('ArrowLeft')) this.yaw += 1.6 * dt;
    if (k.has('ArrowRight')) this.yaw -= 1.6 * dt;
    if (this.hopSpeed > 0 || this.hop > 0) {
      this.hop += this.hopSpeed * dt;
      this.hopSpeed -= GRAVITY * dt;
      if (this.hop <= 0) this.hop = this.hopSpeed = 0;
    }

    // wish direction -> eased velocity (diagonals no faster, backing up slower)
    const len = Math.hypot(f, s) || 1;
    const top = (run && f > 0 ? RUN_SPEED : f < 0 ? WALK_SPEED * 0.7 : WALK_SPEED) / len;
    const wx = (-Math.sin(this.viewYaw) * f + Math.cos(this.viewYaw) * s) * top;
    const wz = (-Math.cos(this.viewYaw) * f - Math.sin(this.viewYaw) * s) * top;
    const a = 1 - Math.exp(-ACCEL * dt * (f || s ? 0.6 : 1));
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.z += (wz - this.vel.z) * a;
    const dx = this.vel.x * dt;
    const dz = this.vel.z * dt;
    const before = { x: this.walkPos.x, z: this.walkPos.z };
    // axis-separated so you slide along walls and furniture
    if (this.free(this.walkPos.x + dx, this.walkPos.z)) this.walkPos.x += dx;
    else this.vel.x = 0;
    if (this.free(this.walkPos.x, this.walkPos.z + dz)) this.walkPos.z += dz;
    else this.vel.z = 0;
    const speed = Math.hypot(this.walkPos.x - before.x, this.walkPos.z - before.z) / Math.max(dt, 1e-4);

    // view: eased towards the mouse target, head bob while moving, lean into sideways steps, FOV kick when running
    const lk = 1 - Math.exp(-LOOK_SMOOTH * dt);
    this.viewYaw += (this.yaw - this.viewYaw) * lk;
    this.viewPitch += (this.pitch - this.viewPitch) * lk;
    this.bob += speed * dt * 4.2;
    this.bobAmp += (Math.min(speed / WALK_SPEED, 1.6) - this.bobAmp) * Math.min(1, dt * 8);
    const sideways = this.vel.x * Math.cos(this.viewYaw) - this.vel.z * Math.sin(this.viewYaw);
    this.roll += (-sideways * 0.012 - this.roll) * Math.min(1, dt * 8);
    this.fov += ((run && speed > WALK_SPEED * 1.2 ? FOV_RUN : FOV_WALK) - this.fov) * Math.min(1, dt * 6);
    if (Math.abs(this.persp.fov - this.fov) > 0.01) {
      this.persp.fov = this.fov;
      this.persp.updateProjectionMatrix();
    }
    this.persp.position.set(
      this.walkPos.x,
      EYE + this.hop + Math.sin(this.bob * 2) * 0.022 * this.bobAmp,
      this.walkPos.z,
    );
    this.persp.rotation.set(this.viewPitch + Math.sin(this.bob * 2 + 1) * 0.004 * this.bobAmp, this.viewYaw, this.roll + Math.sin(this.bob) * 0.004 * this.bobAmp);
  }

  /** The player's body fits at (x, z): clear of walls and furniture, on the office floor. */
  private free(x: number, z: number): boolean {
    return walkFree(x, z, WALK_RADIUS, this.colliders);
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
      if (this.mode === 'walk' && e.code === 'Space') {
        e.preventDefault(); // no scrolling, no focused button pressed
        if (!e.repeat && this.hop === 0) this.hopSpeed = JUMP_SPEED;
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    // click-vs-drag tracking for every mode, and mouse-look for the walk mode
    this.stage.addEventListener('pointerdown', (e) => {
      this.moved = 0;
      this.pressAt = { x: e.clientX, y: e.clientY };
      if (this.mode === 'walk' || this.mode === 'third') {
        this.look = { id: e.pointerId };
        this.stage.setPointerCapture(e.pointerId);
      }
    });
    this.stage.addEventListener('pointermove', (e) => {
      // how far from the press, so jitter back and forth stays a click; with the pointer locked it does not move, so the path counts
      if (e.buttons) this.moved = this.locked ? this.moved + Math.abs(e.movementX) + Math.abs(e.movementY) : Math.max(this.moved, Math.hypot(e.clientX - this.pressAt.x, e.clientY - this.pressAt.y));
      if (!(this.look || this.locked)) return;
      if (this.mode === 'third') {
        this.thirdYaw -= e.movementX * 0.004;
        this.thirdElev = THREE.MathUtils.clamp(this.thirdElev + e.movementY * 0.004, 0.08, 1.35);
      } else if (this.mode === 'walk') {
        this.yaw -= e.movementX * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.3, 1.3);
      }
    });
    this.stage.addEventListener(
      'wheel',
      (e) => {
        if (this.mode !== 'third') return;
        e.preventDefault();
        this.thirdDist = THREE.MathUtils.clamp(this.thirdDist * Math.exp(e.deltaY * 0.001), THIRD_DIST[0], THIRD_DIST[1]);
      },
      { passive: false },
    );
    // first plain click captures the mouse (look without holding a button); Esc releases it
    this.stage.addEventListener('click', () => {
      if ((this.mode === 'walk' || this.mode === 'third') && !this.locked && !this.wasDrag && this.stage.requestPointerLock) {
        try {
          void (this.stage.requestPointerLock() as unknown as Promise<void> | undefined)?.catch?.(() => {});
        } catch {
          /* not allowed: drag-look still works */
        }
      }
    });
    const end = (e: PointerEvent) => {
      this.look = null;
      if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    };
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
  }
}
