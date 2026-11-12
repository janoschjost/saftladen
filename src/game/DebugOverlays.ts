import * as THREE from 'three';
import { WORLD } from '../render/World';
import type { NavGrid } from './NavGrid';
import type { Walker } from './Walker';
import { describeState, gridPixels, pathPoints, type DebugWalker } from './debugView';

export type OverlayKind = 'grid' | 'states' | 'paths';
export const OVERLAY_KINDS: readonly OverlayKind[] = ['grid', 'states', 'paths'];

const MAX_SEGMENTS = 4000;
const GRID_REFRESH = 0.25; // game seconds between two looks at the nav grid (it changes with the layout editor)

/**
 * Dev only: debug overlays in the 3D view. All off by default and never saved. They only read the simulation
 * (no random numbers, nothing written back), so a seeded replay runs the same with or without them.
 *  - grid: walkable (green) and blocked (red) nav cells
 *  - states: what each person / pet is doing, above their head
 *  - paths: the route each walking person or pet still has ahead
 */
export class DebugOverlays {
  readonly on: Record<OverlayKind, boolean> = { grid: false, states: false, paths: false };

  private group = new THREE.Group();
  private gridMesh: THREE.Mesh;
  private gridTexture: THREE.DataTexture | null = null;
  private gridKey = '';
  private gridAt = 0;
  private lines: THREE.LineSegments;
  private positions = new Float32Array(MAX_SEGMENTS * 6);
  private labels = new Map<string, HTMLElement>();
  private layer = document.getElementById('labels') as HTMLElement;
  private v = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.gridMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD.width, WORLD.depth),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.gridMesh.rotation.x = -Math.PI / 2;
    this.gridMesh.position.set(WORLD.width / 2, 0.04, WORLD.depth / 2);
    this.gridMesh.renderOrder = 5;
    this.gridMesh.visible = false;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xf5c518, depthTest: false, toneMapped: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    this.lines.visible = false;
    this.group.add(this.gridMesh, this.lines);
    scene.add(this.group);
  }

  set(kind: OverlayKind, on: boolean): void {
    this.on[kind] = on;
    if (kind === 'grid') {
      this.gridMesh.visible = on;
      this.gridKey = ''; // redraw at once
    }
    if (kind === 'paths') {
      this.lines.visible = on;
      if (!on) this.lines.geometry.setDrawRange(0, 0);
    }
    if (kind === 'states' && !on) for (const el of this.labels.values()) el.hidden = true;
  }

  /** Once per drawn frame, after the poses are set. `clock` is the game time in seconds. */
  update(clock: number, walkers: readonly Walker[], nav: NavGrid, camera: THREE.Camera): void {
    if (this.on.grid) this.updateGrid(clock, nav);
    if (this.on.paths) this.updatePaths(walkers);
    if (this.on.states) this.updateLabels(walkers, camera);
  }

  private updateGrid(clock: number, nav: NavGrid): void {
    if (this.gridKey && clock - this.gridAt < GRID_REFRESH) return;
    this.gridAt = clock;
    const px = gridPixels(nav);
    // a cheap fingerprint: only upload the texture when a cell changed
    let key = 0;
    for (let i = 0; i < px.length; i += 4) key = (key * 31 + px[i]) | 0;
    const full = `${nav.cols}x${nav.rows}:${key}`;
    if (full === this.gridKey) return;
    this.gridKey = full;
    if (!this.gridTexture || this.gridTexture.image.width !== nav.cols || this.gridTexture.image.height !== nav.rows) {
      this.gridTexture?.dispose();
      this.gridTexture = new THREE.DataTexture(new Uint8Array(px.length), nav.cols, nav.rows, THREE.RGBAFormat);
      this.gridTexture.magFilter = THREE.NearestFilter;
      this.gridTexture.minFilter = THREE.NearestFilter;
      this.gridTexture.flipY = true; // row 0 (z = 0) lies at the north edge of the plane
      (this.gridMesh.material as THREE.MeshBasicMaterial).map = this.gridTexture;
      (this.gridMesh.material as THREE.MeshBasicMaterial).needsUpdate = true;
    }
    (this.gridTexture.image.data as Uint8Array).set(px);
    this.gridTexture.needsUpdate = true;
  }

  private updatePaths(walkers: readonly Walker[]): void {
    let n = 0;
    for (const w of walkers) {
      const pts = pathPoints(w as DebugWalker, { x: w.root.position.x, z: w.root.position.z });
      for (let i = 0; i + 1 < pts.length && n < MAX_SEGMENTS; i++, n++) {
        const o = n * 6;
        this.positions[o] = pts[i].x;
        this.positions[o + 1] = 0.12;
        this.positions[o + 2] = pts[i].z;
        this.positions[o + 3] = pts[i + 1].x;
        this.positions[o + 4] = 0.12;
        this.positions[o + 5] = pts[i + 1].z;
      }
    }
    this.lines.geometry.setDrawRange(0, n * 2);
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateLabels(walkers: readonly Walker[], camera: THREE.Camera): void {
    for (const w of walkers) {
      let el = this.labels.get(w.id);
      if (!el) {
        el = document.createElement('span');
        el.className = 'm-label m-label--debug';
        this.layer.appendChild(el);
        this.labels.set(w.id, el);
      }
      this.v.set(w.root.position.x, w.headHeight + 0.45, w.root.position.z).project(camera);
      const hidden = !!w.away || this.v.z > 1 || this.v.z < -1;
      el.hidden = hidden;
      if (hidden) continue;
      const text = describeState(w as DebugWalker);
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(${Math.round((this.v.x * 0.5 + 0.5) * window.innerWidth - el.offsetWidth / 2)}px, ${Math.round((-this.v.y * 0.5 + 0.5) * window.innerHeight - el.offsetHeight)}px)`;
    }
  }
}
