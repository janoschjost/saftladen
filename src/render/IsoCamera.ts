import * as THREE from 'three';
import { WORLD } from './World';

const ISO_ELEVATION = Math.atan(1 / Math.SQRT2); // 35.264°, true isometric
/** screen right and screen down, on the floor */
const RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const DOWN = new THREE.Vector3(1, 0, 1).normalize();
/** how far out and in the view zooms (wheel, pinch, a restored view) */
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 5;

/** Orthographic isometric camera with drag-pan and wheel-zoom; on a touch screen one finger pans, two pinch and pan. */
export class IsoCamera {
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 200);
  /** false while another view mode owns the pointer */
  enabled = true;
  private target = new THREE.Vector3(WORLD.width / 2, 0, WORLD.depth / 2);
  private viewHeight = 24; // world units visible vertically at zoom 1
  private zoom = 1;
  private zoomGoal = 1;
  private aspect = 1;
  private dragging = false;
  private last = { x: 0, y: 0 };
  /** fingers on the screen (touch): two of them pinch to zoom and pan with their midpoint */
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; zoom: number } | null = null;
  private moved = 0;
  private disposers: Array<() => void> = [];

  constructor(private el: HTMLElement) {
    this.bind();
  }

  /** true when the last pointer gesture was a drag rather than a click */
  get wasDrag(): boolean {
    return this.moved > 5;
  }

  resize(width: number, height: number): void {
    this.aspect = width / height;
    // fit the whole slab on screen: (W+D)/sqrt2 wide, that times sin(elevation) tall plus wall height and slab
    const diag = (WORLD.width + WORLD.depth) / Math.SQRT2;
    const screenW = diag + 3;
    const screenH = diag * Math.sin(ISO_ELEVATION) + 3.2 * Math.cos(ISO_ELEVATION) + WORLD.slab + 3;
    this.viewHeight = Math.max(screenH, screenW / this.aspect);
    this.apply();
  }

  getState(): { x: number; z: number; zoom: number } {
    return { x: this.target.x, z: this.target.z, zoom: this.zoomGoal };
  }

  setState(s: { x: number; z: number; zoom: number }): void {
    this.target.x = s.x;
    this.target.z = s.z;
    this.clampTarget();
    this.zoomGoal = this.zoom = THREE.MathUtils.clamp(s.zoom, MIN_ZOOM, MAX_ZOOM);
  }

  /** Eases the view centre towards a floor point (used while a person is steered). */
  follow(x: number, z: number, dt: number): void {
    const k = Math.min(1, dt * 4);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.clampTarget();
  }

  update(dt: number): void {
    this.zoom += (this.zoomGoal - this.zoom) * Math.min(1, dt * 10);
    this.apply();
  }

  private apply(): void {
    const h = this.viewHeight / this.zoom;
    const w = h * this.aspect;
    const c = this.camera;
    c.left = -w / 2;
    c.right = w / 2;
    c.top = h / 2;
    c.bottom = -h / 2;
    const dist = 60;
    const flat = Math.cos(ISO_ELEVATION) * dist;
    c.position.set(
      this.target.x + flat * Math.SQRT1_2,
      this.target.y + Math.sin(ISO_ELEVATION) * dist,
      this.target.z + flat * Math.SQRT1_2,
    );
    c.lookAt(this.target);
    c.updateProjectionMatrix();
  }

  private bind(): void {
    const on = <K extends keyof HTMLElementEventMap>(t: HTMLElement | Window, ev: K | string, fn: (e: any) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(ev, fn, opts);
      this.disposers.push(() => t.removeEventListener(ev, fn));
    };

    on(this.el, 'pointerdown', (e: PointerEvent) => {
      if (!this.enabled) return;
      if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.dragging = true;
      this.moved = 0;
      this.last = this.centre(e);
      this.pinch = this.touches.size >= 2 ? { dist: this.spread(), zoom: this.zoomGoal } : null;
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('is-dragging');
    });
    on(this.el, 'pointermove', (e: PointerEvent) => {
      if (!this.dragging) return;
      const finger = this.touches.get(e.pointerId);
      if (finger) {
        finger.x = e.clientX;
        finger.y = e.clientY;
      }
      const at = this.centre(e);
      const dx = at.x - this.last.x;
      const dy = at.y - this.last.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.last = at;
      if (this.pinch && this.pinch.dist > 0) {
        this.zoomGoal = this.zoom = THREE.MathUtils.clamp((this.pinch.zoom * this.spread()) / this.pinch.dist, MIN_ZOOM, MAX_ZOOM);
        this.moved = Infinity; // a pinch is never a tap
      }
      this.pan(dx, dy);
    });
    const end = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      this.pinch = null;
      // one finger left of a pinch: it pans on from where it is, without a jump
      if (this.touches.size) this.last = this.centre(e);
      else {
        this.dragging = false;
        this.el.classList.remove('is-dragging');
      }
      if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    };
    on(this.el, 'pointerup', end);
    on(this.el, 'pointercancel', end);
    on(
      this.el,
      'wheel',
      (e: WheelEvent) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      },
      { passive: false },
    );
  }

  /** Moves the view centre by a drag of (dx, dy) pixels: the floor stays under the pointer. */
  private pan(dx: number, dy: number): void {
    const unit = this.viewHeight / this.zoom / this.el.clientHeight;
    this.target.addScaledVector(RIGHT, -dx * unit);
    this.target.addScaledVector(DOWN, (-dy * unit) / Math.sin(ISO_ELEVATION));
    this.clampTarget();
  }

  /** Where the gesture is: the pointer, or the midpoint of the fingers on the screen. */
  private centre(e: PointerEvent): { x: number; y: number } {
    if (!this.touches.size) return { x: e.clientX, y: e.clientY };
    let x = 0;
    let y = 0;
    for (const t of this.touches.values()) {
      x += t.x / this.touches.size;
      y += t.y / this.touches.size;
    }
    return { x, y };
  }

  /** Distance between the first two fingers (px). */
  private spread(): number {
    const it = this.touches.values();
    const a = it.next().value;
    const b = it.next().value;
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, WORLD.width);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, WORLD.depth);
  }

  destroy(): void {
    this.disposers.forEach((d) => d());
  }
}
