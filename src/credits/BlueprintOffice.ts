import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildOffice, OFFICE_D, OFFICE_W, ANNEX_D } from '../render/officeModel';

/** Cheap stable noise in 0..1 for a piece's place. */
const hash = (x: number, z: number): number => {
  const n = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

/** What a piece is, which decides when and how it appears: floors first, then wall after wall, then the furniture. */
type Kind = 'floor' | 'wall' | 'thing';

function classify(size: THREE.Vector3): Kind {
  if (size.y < 0.35 && (size.x > 3 || size.z > 3)) return 'floor';
  if (size.y > 1.2 && Math.max(size.x, size.z) > 1.5 && Math.min(size.x, size.z) < 0.8) return 'wall';
  return 'thing';
}

/** Splits a (non-indexed) mesh into the pieces that are not connected to each other: the single walls of a merged mesh. */
function pieces(g: THREE.BufferGeometry): THREE.BufferGeometry[] {
  const pos = g.attributes.position;
  const ids = new Map<string, number>();
  const parent: number[] = [];
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const idOf = (i: number): number => {
    const key = `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = parent.length;
      ids.set(key, id);
      parent.push(id);
    }
    return id;
  };
  const tris = pos.count / 3;
  const of: number[] = [];
  for (let t = 0; t < tris; t++) {
    const a = idOf(t * 3);
    const b = idOf(t * 3 + 1);
    const c = idOf(t * 3 + 2);
    parent[find(a)] = find(b);
    parent[find(b)] = find(c);
    of.push(a);
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tris; t++) {
    const r = find(of[t]);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(t);
  }
  return [...groups.values()].map((list) => {
    const out = new Float32Array(list.length * 9);
    list.forEach((t, n) => {
      for (let v = 0; v < 3; v++) {
        out[n * 9 + v * 3] = pos.getX(t * 3 + v);
        out[n * 9 + v * 3 + 1] = pos.getY(t * 3 + v);
        out[n * 9 + v * 3 + 2] = pos.getZ(t * 3 + v);
      }
    });
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', new THREE.BufferAttribute(out, 3));
    return part;
  });
}

/** Where and when a piece appears (x, z in model metres): what the mascot walks to. */
export interface BuildMark {
  order: number;
  x: number;
  z: number;
}

/** Which part of the cycle the blueprint is in. */
export type BuildPhase = 'pad' | 'build' | 'hold' | 'melt' | 'rest';

interface Piece {
  faces: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  kind: Kind;
  min: number;
  height: number;
  at: THREE.Vector3;
}

/** Gives every vertex of a piece when it appears (`aOrder`), how long it takes (`aDur`), its lowest point and height (`aPiece`) and how it appears (`aMode`: 0 grows up from its base, 1 comes down from its top). */
function stamp(geo: THREE.BufferGeometry, p: Piece, order: number, dur: number): void {
  const n = geo.attributes.position.count;
  const fill = (v: number[]): Float32Array => {
    const a = new Float32Array(n * v.length);
    for (let i = 0; i < n; i++) a.set(v, i * v.length);
    return a;
  };
  geo.setAttribute('aOrder', new THREE.BufferAttribute(fill([order]), 1));
  geo.setAttribute('aDur', new THREE.BufferAttribute(fill([dur]), 1));
  geo.setAttribute('aPiece', new THREE.BufferAttribute(fill([p.min, p.height]), 2));
  geo.setAttribute('aMode', new THREE.BufferAttribute(fill([p.kind === 'wall' ? 1 : 0]), 1));
}

/** Walls and furniture of the real office model, baked into two meshes: translucent faces and their edges (world space, metres). */
function bake(): { faces: THREE.BufferGeometry; edges: THREE.BufferGeometry; marks: BuildMark[] } {
  const scene = new THREE.Scene();
  const model = buildOffice(scene);
  model.roof.visible = false;
  scene.updateMatrixWorld(true);
  const all: Piece[] = [];
  const hidden = (o: THREE.Object3D): boolean => {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible || p === model.roof) return true;
    return false;
  };
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || hidden(m)) return;
    const mat = m.material as THREE.Material;
    if (Array.isArray(mat) || (mat.transparent && mat.opacity < 0.05)) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', m.geometry.attributes.position.clone());
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(m.matrixWorld);
    const flat = g.index ? g.toNonIndexed() : g;
    flat.computeBoundingBox();
    const size = flat.boundingBox!.getSize(new THREE.Vector3());
    // a big merged mesh holds many separate walls and things: each becomes its own piece
    for (const part of size.x > 4 || size.z > 4 ? pieces(flat) : [flat]) {
      part.computeBoundingBox();
      const b = part.boundingBox!;
      all.push({ faces: part, edges: new THREE.EdgesGeometry(part, 25), kind: classify(b.getSize(new THREE.Vector3())), min: b.min.y, height: Math.max(0.05, b.max.y - b.min.y), at: b.getCenter(new THREE.Vector3()) });
    }
  });
  // floors first, then the build sweeps across the office from left to right: each wall, then the furniture behind it
  const floors = all.filter((p) => p.kind === 'floor').sort((a, b) => hash(a.at.x, a.at.z) - hash(b.at.x, b.at.z));
  const marks: BuildMark[] = [];
  for (const p of all) {
    const sweep = Math.min(1, Math.max(0, p.at.x / OFFICE_W));
    const order = p.kind === 'floor' ? (0.06 * floors.indexOf(p)) / Math.max(1, floors.length) : 0.07 + 0.86 * sweep + (p.kind === 'thing' ? 0.05 : 0) + hash(p.at.x, p.at.z) * 0.01;
    stamp(p.faces, p, order, p.kind === 'floor' ? 0.04 : p.kind === 'wall' ? 0.03 : 0.05);
    if (p.kind !== 'floor') marks.push({ order, x: p.at.x, z: p.at.z });
    for (const attr of ['aOrder', 'aDur', 'aPiece', 'aMode']) p.edges.setAttribute(attr, p.faces.getAttribute(attr).count === p.edges.attributes.position.count ? p.faces.getAttribute(attr).clone() : expand(p.faces.getAttribute(attr), p.edges.attributes.position.count));
  }
  marks.sort((a, b) => a.order - b.order);
  return { faces: mergeGeometries(all.map((p) => p.faces))!, edges: mergeGeometries(all.map((p) => p.edges))!, marks };
}

/** The same value on every vertex of a piece, for as many vertices as its edges have. */
function expand(a: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, count: number): THREE.BufferAttribute {
  const out = new Float32Array(count * a.itemSize);
  for (let i = 0; i < count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.array[k];
  return new THREE.BufferAttribute(out, a.itemSize);
}

/** Seconds of one cycle: the pad lights up, the build sweeps across the office, it holds, it dissolves again. */
const CYCLE = { pad: 1.5, build: 36, hold: 8, melt: 3, rest: 1.5 };
/** the last piece (furniture) takes this share of the build to grow, on top of 1 */
const RISE = 0.05;

const VERTEX = `
attribute float aOrder;
attribute float aDur;
attribute float aMode;
attribute vec2 aPiece;
varying float vOrder;
varying float vDur;
varying float vMode;
varying vec2 vPiece;
varying float vY;
void main() {
  vOrder = aOrder;
  vDur = aDur;
  vMode = aMode;
  vPiece = aPiece;
  vY = position.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** A piece shows from its moment on, flashing white while it grows (up from its base, or a wall down from its top), then settles to the blueprint blue. */
const FRAGMENT = `
uniform float uProgress;
uniform vec3 uColor;
uniform float uOpacity;
varying float vOrder;
varying float vDur;
varying float vMode;
varying vec2 vPiece;
varying float vY;
void main() {
  float k = (uProgress - vOrder) / vDur;
  if (k <= 0.0) discard;
  k = min(k, 1.0);
  float reach = k * vPiece.y;
  if (vMode > 0.5) {
    if (vY < vPiece.x + vPiece.y - reach - 0.0005) discard;
  } else if (vY > vPiece.x + reach + 0.0005) discard;
  float flash = 1.0 - k;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), flash * 0.9), uOpacity + flash * 0.6);
}`;

const TOTAL = CYCLE.pad + CYCLE.build + CYCLE.hold + CYCLE.melt + CYCLE.rest;

/**
 * The office as a blueprint hologram: the real model as hairlines on a glowing pad, built up from the floor like a
 * 3D print with a scan plane at the current height. The two devs "build" it.
 */
export class BlueprintOffice {
  readonly root = new THREE.Group();
  private readonly progress = { value: 0 };
  private readonly lines: THREE.ShaderMaterial;
  private readonly pad: THREE.MeshBasicMaterial;
  private clock = 0;
  /** how far the build is (0..1 + RISE) and the part of the cycle, for whoever builds along */
  level = 0;
  phase: BuildPhase = 'pad';
  /** every piece in the order it appears, in world metres */
  readonly marks: BuildMark[];
  /** the pad's footprint on the floor (world metres) */
  readonly footprint: { x0: number; z0: number; x1: number; z1: number };

  /** `scale` shrinks the office (42 m wide) to the table; `at` is the middle of its footprint on the floor, `lift` how far it floats. */
  constructor(scale: number, at: { x: number; z: number }, lift: number) {
    const { faces, edges, marks } = bake();
    const w = OFFICE_W;
    const d = OFFICE_D + ANNEX_D;

    const body = new THREE.Group();
    body.scale.setScalar(scale);
    body.position.set(at.x - (w * scale) / 2, lift, at.z - (d * scale) / 2);
    this.root.add(body);
    this.marks = marks.map((m) => ({ order: m.order, x: body.position.x + m.x * scale, z: body.position.z + m.z * scale }));
    const shader = (color: string, opacity: number): THREE.ShaderMaterial =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: { uProgress: this.progress, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    this.lines = shader('#8fd8ff', 0.85);
    body.add(new THREE.Mesh(faces, shader('#1d6fb8', 0.16)), new THREE.LineSegments(edges, this.lines));

    // the pad it is projected onto: a dark plate with a blueprint grid and a glowing rim
    const px = w * scale + 0.3;
    const pz = d * scale + 0.3;
    this.footprint = { x0: at.x - px / 2, z0: at.z - pz / 2, x1: at.x + px / 2, z1: at.z + pz / 2 };
    const grid = document.createElement('canvas');
    grid.width = grid.height = 64;
    const g = grid.getContext('2d')!;
    g.strokeStyle = 'rgba(120, 200, 255, 0.5)';
    g.lineWidth = 2;
    g.strokeRect(0, 0, 64, 64);
    const map = new THREE.CanvasTexture(grid);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(px / 0.12, pz / 0.12);
    map.colorSpace = THREE.SRGBColorSpace;
    this.pad = new THREE.MeshBasicMaterial({ map, color: '#1a4f86', transparent: true, opacity: 0.9 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(px, 0.04, pz), [new THREE.MeshLambertMaterial({ color: '#10141c' }), new THREE.MeshLambertMaterial({ color: '#10141c' }), this.pad, new THREE.MeshLambertMaterial({ color: '#10141c' }), new THREE.MeshLambertMaterial({ color: '#10141c' }), new THREE.MeshLambertMaterial({ color: '#10141c' })]);
    plate.position.set(at.x, lift - 0.02, at.z);
    plate.castShadow = true;
    plate.receiveShadow = true;
    this.root.add(plate);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(px, 0.04, pz)), new THREE.LineBasicMaterial({ color: '#8fd8ff' }));
    rim.position.copy(plate.position);
    this.root.add(rim);

    this.tick(0);
  }

  tick(dt: number): void {
    this.clock = (this.clock + dt) % TOTAL;
    const t = this.clock;
    const { pad, build, hold, melt } = CYCLE;
    const full = 1 + RISE; // the last piece has finished growing
    let level = 0;
    if (t >= pad && t < pad + build) level = ((t - pad) / build) * full;
    else if (t >= pad + build && t < pad + build + hold) level = full;
    else if (t >= pad + build + hold && t < pad + build + hold + melt) level = (1 - (t - pad - build - hold) / melt) * full;
    this.progress.value = this.level = level;
    this.phase = t < pad ? 'pad' : t < pad + build ? 'build' : t < pad + build + hold ? 'hold' : t < pad + build + hold + melt ? 'melt' : 'rest';
    this.pad.opacity = t < pad ? t / pad : 0.9;
  }
}
