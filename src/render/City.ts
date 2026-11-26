import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBlock, groundFloor, roadStrip } from './cityBuildings';
import { blocksTheView, builtOn, cityLayout, groundAt, roadsAt, viewOf, type Building, type Rect } from './cityLayout';
import { TERRAIN } from './cityData';
import { CITY_ORIGIN, cityColours } from './cityWeather';
import { PORCH } from './officeModel';
import type { ViewMode } from './Views';
import { WORLD } from './World';

/** The hairline edges of every building, like the blueprint hologram on /credits, in a quiet grey. */
const LINE = '#a3a4a8';
/** How much of the fill shows: the rest lets the edges behind it and the ground through. */
const FILL = 0.18;
/** Everything of the neighbourhood sits this far below y = 0, under the office's floor slab. */
const SINK = -WORLD.slab - 0.01;

/** Haze: it starts this far behind the office and the city is gone in it `far` metres beyond (measured from the office, not the camera). */
const HAZE = { near: 30, far: 240 };
/** How fast a building that blocks the view fades out and back (per second), and how much of it stays (a ghost). */
const FADE = 3;
const GHOST = 0; // the fill of a building in the way goes (the city is see-through already), its edges stay as a faint trace
const GHOST_EDGES = 0.15;
/** How much of the haze colour every building takes on, so the neighbourhood is dimmed next to the office (0 = none). */
const DIM = 0.3;

/**
 * Per-building fade and dimming. A building drawn at `aFade` below 1 loses that share of its coverage (alpha to
 * coverage, with the renderer's multisampling), so it looks see-through yet is drawn solid, in the same pass, with no
 * sorting trouble between the instances. Every building also takes `DIM` of the haze colour. The material is shared.
 */
function fadeable(material: THREE.Material, dim: number, opacity: number): void {
  material.alphaToCoverage = !material.transparent; // the see-through fill blends instead
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.a *= vFade * ${opacity.toFixed(2)};`)
      .replace('#include <fog_fragment>', `#include <fog_fragment>\n#ifdef USE_FOG\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, ${dim.toFixed(2)});\n#endif`);
  };
}

/**
 * The neighbourhood around the office: the real buildings and hills around Bogenstrasse 7a in St. Gallen (`cityData.ts`),
 * plain blocks with hairline edges like the blueprint on /credits, very light and hazed into the background. Quiet
 * scenery: no animation, no shadows, one mesh for the buildings, one for their edges and the terrain. The buildings that
 * would stand in the way of the camera's view of the office (Iso and Orbit) fade to a ghost, so the office is never
 * hidden; the low ones against its walls stay.
 */
export class City {
  private buildings: Building[];
  private shown: Float32Array;
  /** the vertices of each building in the fill's and the edges' fade attributes: [from, count] */
  private fillRange: Array<[number, number]> = [];
  private edgeRange: Array<[number, number]> = [];
  private fillFade: THREE.BufferAttribute;
  private edgeFade: THREE.BufferAttribute;
  private centre: THREE.Vector3;
  private look = new THREE.Vector3();
  private fog = new THREE.Fog('#ffffff', 100, 400);
  /** nothing is fading and no building is in the way: `update` has nothing to do until a view applies again */
  private settled = true;
  private groundMaterial: THREE.MeshLambertMaterial;
  private roadMaterial: THREE.MeshLambertMaterial;
  private fillMaterial: THREE.MeshLambertMaterial;
  private shownWeather = { wet: -1, cover: -1 };

  constructor(private scene: THREE.Scene, foot: Rect) {
    this.centre = new THREE.Vector3((foot.x0 + foot.x1) / 2, 0, (foot.z0 + foot.z1) / 2);
    const origin = CITY_ORIGIN; // the real building's centre: the middle of the main body, the annex hangs out of it
    this.buildings = cityLayout(foot, origin);
    // the ground floor under the office: a plain block of its footprint from the street up to the slab, drawn like the rest
    const street = groundAt(foot, origin, this.centre.x, this.centre.z);
    this.buildings.push({
      p: [foot.x0, foot.z0, foot.x1, foot.z0, foot.x1, foot.z1, foot.x0, foot.z1],
      x: this.centre.x,
      z: this.centre.z,
      base: street,
      h: 0,
      geometry: groundFloor(foot, street, PORCH.x + 4),
    });
    this.shown = new Float32Array(this.buildings.length).fill(1);

    // the terrain: the hills of St. Gallen, levelled around the office
    const { half } = TERRAIN;
    const seg = (2 * half) / 10;
    const ground = new THREE.PlaneGeometry(2 * half, 2 * half, seg, seg).rotateX(-Math.PI / 2);
    const gp = ground.getAttribute('position');
    for (let i = 0; i < gp.count; i++) {
      const x = gp.getX(i) + origin.x;
      const z = gp.getZ(i) + origin.z;
      gp.setXYZ(i, x, groundAt(foot, origin, x, z) + SINK, z);
    }
    ground.computeVertexNormals();
    this.groundMaterial = new THREE.MeshLambertMaterial();
    scene.add(new THREE.Mesh(ground, this.groundMaterial));
    // the main roads: stylised light ribbons on the terrain, a hair above it
    const lift = SINK + 0.4; // well above the terrain mesh, which cuts the corners of the heights the road follows
    const built = builtOn(this.buildings.map((b) => b.p));
    const strips = roadsAt(origin).map((r) => roadStrip(r.p, r.w, (x, z) => groundAt(foot, origin, x, z) + lift, built));
    const roads = mergeGeometries(strips.filter((g) => g.getIndex()!.count > 0))!;
    const roadMesh = new THREE.Mesh(roads, (this.roadMaterial = new THREE.MeshLambertMaterial({ polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false })));
    roadMesh.renderOrder = 1; // after the ground, and the strips of crossing roads do not fight each other
    scene.add(roadMesh);

    // the buildings: blocks (see-through fill) and their edges, each building's vertices in a known range so it can fade
    const fills: THREE.BufferGeometry[] = [];
    const lines: THREE.BufferGeometry[] = [];
    let fromFill = 0;
    let fromEdge = 0;
    for (const b of this.buildings) {
      const block = b.geometry ?? buildBlock(b);
      block.translate(0, SINK, 0);
      const edges = new THREE.EdgesGeometry(block, 30);
      this.fillRange.push([fromFill, block.getAttribute('position').count]);
      this.edgeRange.push([fromEdge, edges.getAttribute('position').count]);
      fromFill += block.getAttribute('position').count;
      fromEdge += edges.getAttribute('position').count;
      fills.push(block);
      lines.push(edges);
    }
    this.fillFade = new THREE.BufferAttribute(new Float32Array(fromFill).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    this.edgeFade = new THREE.BufferAttribute(new Float32Array(fromEdge).fill(1), 1).setUsage(THREE.DynamicDrawUsage);
    const fill = mergeGeometries(fills)!.setAttribute('aFade', this.fillFade);
    const outline = mergeGeometries(lines)!.setAttribute('aFade', this.edgeFade);
    // the fill is see-through like the blueprint on /credits: it blends and writes no depth, so the edges behind it show
    const lineMaterial = new THREE.LineBasicMaterial({ color: LINE });
    const material = (this.fillMaterial = new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false }));
    fadeable(material, DIM, FILL);
    fadeable(lineMaterial, 0, 1); // the lines keep their contrast; the haze still fades them with distance
    for (const o of [new THREE.Mesh(fill, material), new THREE.LineSegments(outline, lineMaterial)]) {
      o.frustumCulled = false;
      scene.add(o);
    }
    scene.fog = this.fog;
    this.weather(0, 0);
  }

  /** The weather on the city: rain (`wet`, weather.wet) darkens the ground, roads and roofs, snow (`cover`, weather.cover) whitens them. Dry and unchanged costs nothing. */
  weather(wet: number, cover: number): void {
    if (wet === this.shownWeather.wet && cover === this.shownWeather.cover) return;
    this.shownWeather = { wet, cover };
    const c = cityColours(wet, cover);
    this.groundMaterial.color.copy(c.ground);
    this.roadMaterial.color.copy(c.road);
    this.fillMaterial.color.copy(c.fill);
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
    if (!view && this.settled) return;
    const step = Math.min(1, dt * FADE);
    let changed = false;
    let moving = false;
    this.buildings.forEach((b, i) => {
      const target = view && blocksTheView(b, this.centre, view) ? GHOST : 1;
      const before = this.shown[i];
      this.shown[i] += (target - before) * step;
      if (Math.abs(this.shown[i] - target) < 0.005) this.shown[i] = target;
      if (this.shown[i] !== target) moving = true;
      if (this.shown[i] === before) return;
      const [fillFrom, fillCount] = this.fillRange[i];
      const [edgeFrom, edgeCount] = this.edgeRange[i];
      this.fillFade.array.fill(this.shown[i], fillFrom, fillFrom + fillCount);
      this.edgeFade.array.fill(GHOST_EDGES + (1 - GHOST_EDGES) * this.shown[i], edgeFrom, edgeFrom + edgeCount);
      changed = true;
    });
    this.settled = !view && !moving;
    if (changed) this.fillFade.needsUpdate = this.edgeFade.needsUpdate = true;
  }
}
