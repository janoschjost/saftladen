import * as THREE from 'three';
import { WORLD } from './World';

const ISO_ELEVATION = Math.atan(1 / Math.SQRT2); // 35.264°, true isometric

/** Orthographic isometric camera with drag-pan and wheel-zoom. */
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
    this.zoomGoal = this.zoom = THREE.MathUtils.clamp(s.zoom, 0.6, 5);
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
      this.dragging = true;
      this.moved = 0;
      this.last = { x: e.clientX, y: e.clientY };
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add('is-dragging');
    });
    on(this.el, 'pointermove', (e: PointerEvent) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.last.x;
      const dy = e.clientY - this.last.y;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.last = { x: e.clientX, y: e.clientY };
      // pixels -> world units on the ground plane
      const h = this.viewHeight / this.zoom;
      const unit = h / this.el.clientHeight;
      const right = new THREE.Vector3(1, 0, -1).normalize();
      const down = new THREE.Vector3(1, 0, 1).normalize();
      this.target.addScaledVector(right, -dx * unit);
      this.target.addScaledVector(down, (-dy * unit) / Math.sin(ISO_ELEVATION));
      this.clampTarget();
    });
    const end = (e: PointerEvent) => {
      this.dragging = false;
      this.el.classList.remove('is-dragging');
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
        this.zoomGoal = THREE.MathUtils.clamp(this.zoomGoal * Math.exp(-e.deltaY * 0.0015), 0.6, 5);
      },
      { passive: false },
    );
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, WORLD.width);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, WORLD.depth);
  }

  destroy(): void {
    this.disposers.forEach((d) => d());
  }
}
