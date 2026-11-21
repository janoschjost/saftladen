import * as THREE from 'three';
import { buildKind, NOMINAL_D, NOMINAL_W } from './cityBuildings';
import { blocksTheView, cityLayout, heightOf, KINDS, viewOf, type Building, type Rect } from './cityLayout';
import { PORCH } from './officeModel';
import type { ViewMode } from './Views';
import { WORLD } from './World';

/**
 * The tones of the neighbourhood: very light, nearly white greys with a fifth of the office's saturation, so the office is
 * the only thing in real colours and the rest is faded into the background (and solid: nothing is see-through).
 */
const TONES = ['#ededeb', '#e7e7e4', '#e2e3e2', '#ebe9e5', '#dddede', '#e5e4e0'];
const GROUND = '#d6d6d3';

/** Haze: it starts this far behind the office and the city is gone in it `far` metres beyond (measured from the office, not the camera). */
const HAZE = { near: 30, far: 240 };
/** How fast a building that blocks the view fades out and back (per second), and how much of it stays (a ghost). */
const FADE = 3;
const GHOST = 0.25;
/** How much of the haze colour every building takes on, so the neighbourhood is dimmed next to the office (0 = none). */
const DIM = 0.3;
/** The entrance lane in front of the porch stays open: its width beyond the porch on each side (m). */
const LANE_MARGIN = 3;

/**
 * Per-building fade and dimming. A building drawn at `aFade` below 1 loses that share of its coverage (alpha to
 * coverage, with the renderer's multisampling), so it looks see-through yet is drawn solid, in the same pass, with no
 * sorting trouble between the instances. Every building also takes `DIM` of the haze colour. The material is shared.
 */
function fadeable(material: THREE.MeshLambertMaterial): void {
  material.alphaToCoverage = true;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, ${DIM.toFixed(2)});\n#endif`);
  };
}

/**
 * The neighbourhood around the office: one continuous mass of buildings in the office's style (`cityBuildings.ts`),
 * touching each other and the office's walls, low next to the office and rising outwards, very light and hazed into the
 * background. Quiet scenery: no animation, no shadows, one instanced mesh per kind of building plus the ground. The
 * buildings that would stand in the way of the camera's view of the office (Iso and Orbit) fade to a ghost, so the
 * office is never hidden; the low ones against its walls stay.
 */
export class City {
  private buildings: Array<Building & { h: number }>;
  private shown: Float32Array;
  private applied: Float32Array;
  /** one instanced mesh per kind of building, its per-instance fade, and a building's place in it */
  private meshes: Array<{ mesh: THREE.InstancedMesh; fade: THREE.InstancedBufferAttribute } | null> = [];
  private slot: Int32Array;
  private centre: THREE.Vector3;
  private look = new THREE.Vector3();
  private groundY = -WORLD.slab - 0.01;
  private fog = new THREE.Fog('#ffffff', 100, 400);

  constructor(private scene: THREE.Scene, foot: Rect) {
    this.centre = new THREE.Vector3((foot.x0 + foot.x1) / 2, 0, (foot.z0 + foot.z1) / 2);
    const lane = { x0: PORCH.x - LANE_MARGIN, x1: PORCH.x + PORCH.w + LANE_MARGIN };
    this.buildings = cityLayout(foot, lane).map((b) => ({ ...b, h: heightOf(KINDS[b.kind]) }));
    this.shown = new Float32Array(this.buildings.length).fill(1);
    this.applied = new Float32Array(this.buildings.length).fill(1);
    this.slot = new Int32Array(this.buildings.length).fill(-1);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: GROUND }));
    ground.position.set(this.centre.x, this.groundY, this.centre.z);
    scene.add(ground);

    // the buildings: one mesh per kind, painted by vertex colours, tinted by each building's wall tone and placed once
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    fadeable(material);
    const col = new THREE.Color();
    const dummy = new THREE.Object3D();
    KINDS.forEach((kind, k) => {
      const mine = this.buildings.map((b, i) => (b.kind === k ? i : -1)).filter((i) => i >= 0);
      if (!mine.length) return void this.meshes.push(null);
      const geometry = buildKind(kind);
      const fade = new THREE.InstancedBufferAttribute(new Float32Array(mine.length).fill(1), 1);
      fade.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aFade', fade);
      const mesh = new THREE.InstancedMesh(geometry, material, mine.length);
      mine.forEach((bi, n) => {
        const b = this.buildings[bi];
        this.slot[bi] = n;
        dummy.position.set(b.x, this.groundY, b.z);
        dummy.scale.set(b.w / NOMINAL_W, 1, b.d / NOMINAL_D);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, col.set(TONES[b.tone % TONES.length]));
      });
      mesh.frustumCulled = false; // the instances span the whole city
      scene.add(mesh);
      this.meshes.push({ mesh, fade });
    });
    scene.fog = this.fog;
  }

  /**
   * Once a frame: the haze takes the background's colour (so the day cycle, rain and Christmas carry over) and a fixed range
   * behind the office, and the buildings in the way of the camera's view (Iso and Orbit only) fade to a ghost and back.
   */
  update(dt: number, camera: THREE.Camera, mode: ViewMode): void {
    const cam = camera.position;
    if (this.scene.background instanceof THREE.Color) this.fog.color.copy(this.scene.background);
    const away = cam.distanceTo(this.centre);
    this.fog.near = away + HAZE.near;
    this.fog.far = away + HAZE.far;
    const view = mode === 'iso' || mode === 'orbit' ? viewOf(cam, camera.getWorldDirection(this.look), this.centre) : null;
    const step = Math.min(1, dt * FADE);
    const touched = new Set<THREE.InstancedBufferAttribute>();
    this.buildings.forEach((b, i) => {
      const target = view && blocksTheView(b, this.centre, view) ? GHOST : 1;
      this.shown[i] += (target - this.shown[i]) * step;
      if (Math.abs(this.shown[i] - target) < 0.005) this.shown[i] = target;
      if (this.shown[i] === this.applied[i]) return;
      this.applied[i] = this.shown[i];
      const m = this.meshes[b.kind]!;
      m.fade.setX(this.slot[i], this.shown[i]);
      touched.add(m.fade);
    });
    for (const a of touched) a.needsUpdate = true;
  }
}
