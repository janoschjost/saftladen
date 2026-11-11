import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec2 } from '../game/NavGrid';
import { screenOffMaterial, type DeskRig } from './officeBuilder';

/**
 * The agency office, reconstructed from the walkthrough photos (see office-model/index.html for the standalone viewer).
 * Model coordinates are metres: X = along the corridor (entrance -> far end), Z = across (negative = core side).
 *
 * Game adaptations:
 *  - the floor plan (walls, rooms, corridors) is scaled by SCALE; furniture keeps its size and is placed by anchor
 *    (groups such as desk islands move rigidly, see `within`),
 *  - interior walls are solid up to CUT metres and see-through "ghost" above, so the iso camera sees into every room
 *    while the lettering on the text wall still sits where it does in real life,
 *  - the front/east exterior walls are left out, the roof + hanging decoration live in `roof` (toggle with R).
 */
export const B = { x0: -9.5, x1: 32.5, z0: -5.5, z1: 9.5 }; // x1 was 31.5
/**
 * EXACT = true: the standalone office-model/index.html 1:1 (real size, full-height walls incl. front/east exterior,
 * original lettering). EXACT = false: the game adaptation (plan scaled by 1.4, cutaway see-through walls).
 */
export const EXACT = true;
/** Floor plan scale: rooms, corridors and walls grow by this factor, furniture and people keep their size. */
export const SCALE = EXACT ? 1 : 1.4;
/** Model coordinates -> game coordinates (building corner at 0/0, plan scaled). */
export const ax = (x: number): number => (x - B.x0) * SCALE;
export const az = (z: number): number => (z - B.z0) * SCALE;
export const OFFICE_W = (B.x1 - B.x0) * SCALE;
export const OFFICE_D = (B.z1 - B.z0) * SCALE;
/** A point in the middle of the main corridor, in game coordinates. */
export const CORRIDOR_POINT: Vec2 = { x: ax(12), z: az(1.1) };

/** Debug: red numbered label above every desk row (to refer to rows by number). */
const DEBUG_ROW_LABELS = true;
let rowCount = 0;

const CORR = 2.2; // z where the hallway ends (desk zone starts)
const CZ = -1.0; // z of the core's south wall (rooms z B.z0..CZ), hallway CZ..CORR
const H_LOW = 2.8; // flat ceiling along window walls
const H_CORE = 3.3; // top of core box / text wall
const BAND = 6.7; // z where the high folded roof ends and the low window band begins
const TEETH = [-5, 1.3, 7.9, 14.5, 21.1, 27.7]; // sawtooth roof fold lines (x)
const CUT = 1.2; // interior walls are solid up to here, see-through above
const DOOR_MAX = 1.3; // openings up to this width are doors and keep their size when the plan is scaled

export interface DeskPlacement {
  rig: DeskRig;
  /** where the sitter's hips end up (game coordinates) */
  seat: Vec2;
  /** direction the sitter faces (yaw, 0 = +z) */
  yaw: number;
  /** unit vector pointing from the desk towards the space behind the chair */
  back: Vec2;
}

export interface OfficeModel {
  desks: DeskPlacement[];
  /** footprints (game space) that block walking, for the nav grid */
  blockers: THREE.Box3[];
  /** ceiling, beams, clerestory, bunting, string lights (hidden by default) */
  roof: THREE.Group;
  /** front door leaf, hinged at its pivot; rotation.y = 0 is closed, negative swings it outwards */
  entrance: THREE.Group;
  /** printer in the archive: where people stand (game coordinates), facing yaw, and the paper that shows while printing */
  printer: { stand: Vec2; yaw: number; paper: THREE.Mesh };
}

type Mat = THREE.Material;

interface Opening {
  a: number;
  b: number;
  bottom?: number;
  top?: number;
  fill?: 'glass' | 'frosted' | 'door';
  /** people can walk through (door / glass door) */
  pass?: boolean;
}

export function buildOffice(scene: THREE.Scene): OfficeModel {
  rowCount = 0;
  const world = new THREE.Group();
  const roof = new THREE.Group();
  const deskSpecs: Array<{ x: number; z: number; rot: number; white: boolean; w: number; stand: boolean }> = [];

  /* ---------- placement: anchors scale, groups stay rigid ---------- */
  let cluster: { x: number; z: number } | null = null;
  /** Furniture x/z (model coords) -> game coords. Inside `within` everything keeps its offset from the cluster anchor. */
  const gx = (x: number) => (cluster ? ax(cluster.x) + (x - cluster.x) : ax(x));
  const gz = (z: number) => (cluster ? az(cluster.z) + (z - cluster.z) : az(z));
  /** Place a group of furniture rigidly: the anchor (cx, cz) is scaled with the plan, the rest keeps its offsets. */
  const within = (cx: number, cz: number, fn: () => void): void => {
    const prev = cluster;
    cluster = { x: cx, z: cz };
    fn();
    cluster = prev;
  };

  /* ---------- materials ---------- */
  const L = (color: number, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...o });
  const mat = {
    wall: L(0xf3f1ec),
    ghost: new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }),
    black: L(0x1b1b1d),
    dark: L(0x2a2a2d),
    grey: L(0x9a9c9f),
    lightgrey: L(0xcfd0d0),
    white: L(0xf7f6f2),
    ply: L(0xc98b47),
    plyLight: L(0xd9b47c),
    wood: L(0xc8935a),
    woodDark: L(0x7a4f2c),
    steel: L(0xb9bcc0),
    green: L(0x2f6b2d),
    greenL: L(0x4c8a3a),
    pot: L(0x3a3a3c),
    terracotta: L(0xb5653c),
    potWhite: L(0xe8e2d4),
    cactus: L(0x3f8a4a),
    succ: L(0x8fb59a),
    succLight: L(0xb9d6bf),
    flowerPink: L(0xe87a9c),
    flowerYellow: L(0xf2c43a),
    glass: new THREE.MeshLambertMaterial({ color: 0xbfe0ea, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    frosted: new THREE.MeshLambertMaterial({ color: 0xd3e3e3, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }),
    glassBlock: L(0x4a5356),
    fabric: L(0x77787a),
    cardboard: L(0xb89468),
    crate: L(0x8d9499),
    lampWarm: new THREE.MeshBasicMaterial({ color: 0xffd98a }),
    cage: L(0xe2b84f),
  };

  /* ---------- textures ---------- */
  function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!, w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  const slats = canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#f6f5f1';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9c9c6';
    for (let y = 8; y < h; y += 16) g.fillRect(0, y, w, 2);
  });

  /* ---------- primitives ---------- */
  /** Raw box in game coordinates (architecture). `y` is the bottom. */
  function rbox(w: number, h: number, d: number, x: number, y: number, z: number, m: Mat, ry = 0, parent: THREE.Object3D = world): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = ry;
    parent.add(mesh);
    return mesh;
  }
  /** Furniture box: world-level positions go through the placement transform, children of groups stay local. */
  function box(w: number, h: number, d: number, x: number, y: number, z: number, m: Mat, ry = 0, parent: THREE.Object3D = world): THREE.Mesh {
    return parent === world ? rbox(w, h, d, gx(x), y, gz(z), m, ry, parent) : rbox(w, h, d, x, y, z, m, ry, parent);
  }
  function cyl(r1: number, r2: number, h: number, x: number, y: number, z: number, m: Mat, parent: THREE.Object3D = world, seg = 16): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
    if (parent === world) mesh.position.set(gx(x), y + h / 2, gz(z));
    else mesh.position.set(x, y + h / 2, z);
    parent.add(mesh);
    return mesh;
  }
  type P3 = [number, number, number];

  /** Thin rod between two points (local space of `parent`). */
  function chairRod(parent: THREE.Object3D, a: P3, b: P3, r: number, m: Mat): void {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), m);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);
  }
  /** Moulded one-piece seat + back shell: side profile swept across a tapering width, rims curled up/forward. Local +x = front. */
  function shellChairGeometry(): THREE.BufferGeometry {
    const prof = new THREE.CatmullRomCurve3(
      [[0.24, 0.47], [0.16, 0.43], [0.02, 0.415], [-0.11, 0.435], [-0.2, 0.51], [-0.25, 0.63], [-0.275, 0.76], [-0.27, 0.83]].map(([x, y]) => new THREE.Vector3(x, y, 0))
    );
    const widths: [number, number][] = [[0, 0.17], [0.07, 0.225], [0.17, 0.25], [0.4, 0.245], [0.55, 0.225], [0.75, 0.215], [1, 0.19]];
    const halfW = (u: number): number => {
      let i = 0;
      while (i < widths.length - 2 && u > widths[i + 1][0]) i++;
      const [u0, w0] = widths[i], [u1, w1] = widths[i + 1];
      const w = w0 + ((w1 - w0) * (u - u0)) / (u1 - u0);
      const endF = Math.min(u / 0.05, 1), endB = Math.min((1 - u) / 0.07, 1); // round the front edge and the top edge
      return w * Math.sqrt(1 - (1 - endF) ** 2) * Math.sqrt(1 - (1 - endB) ** 2);
    };
    const nu = 28, nv = 14;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = prof.getPoint(u), t = prof.getTangent(u);
      const nx = t.y, ny = -t.x; // normal pointing at the sitter
      for (let j = 0; j <= nv; j++) {
        const v = (j / nv) * 2 - 1;
        const rim = 0.045 * v * v * Math.min(1, 0.4 + u * 1.5);
        pos.push(p.x + nx * rim, p.y + ny * rim, v * halfW(Math.max(u, 0.0001)));
      }
    }
    for (let i = 0; i < nu; i++)
      for (let j = 0; j < nv; j++) {
        const a = i * (nv + 1) + j, b = a + 1, c = a + nv + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function quad(pts: P3[], m: Mat, parent: THREE.Object3D = world): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    const idx = pts.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    g.setAttribute('position', new THREE.Float32BufferAttribute(idx.flatMap((i) => pts[i]), 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, m);
    parent.add(mesh);
    return mesh;
  }
  /** Raw axis-aligned wall slab between two game-space points. */
  function seg(x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, m: Mat = mat.wall, t = 0.12, parent: THREE.Object3D = world): THREE.Mesh | undefined {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (len < 0.01 || y1 - y0 < 0.01) return undefined;
    return rbox(len, y1 - y0, t, (x1 + x2) / 2, y0, (z1 + z2) / 2, m, -Math.atan2(z2 - z1, x2 - x1), parent);
  }
  /** Same, with model coordinates (scaled with the plan). */
  const segM = (x1: number, z1: number, x2: number, z2: number, y0: number, y1: number, m: Mat = mat.wall, t = 0.12) =>
    seg(ax(x1), az(z1), ax(x2), az(z2), y0, y1, m, t);
  /** Axis-aligned architectural slab covering the model-space rectangle (thin sides get thickness t). */
  function slab(xa: number, xb: number, za: number, zb: number, y0: number, y1: number, m: Mat, t = 0.1, parent: THREE.Object3D = world): THREE.Mesh {
    const w = Math.max(ax(xb) - ax(xa), t);
    const d = Math.max(az(zb) - az(za), t);
    return rbox(w, y1 - y0, d, (ax(xa) + ax(xb)) / 2, y0, (az(za) + az(zb)) / 2, m, 0, parent);
  }

  /**
   * Wall with openings (model coordinates, axis aligned): solid up to CUT, see-through ghost above up to `hFull`.
   * Doors keep their size when the plan is scaled, wide openings scale with it. `outer` walls are fully solid.
   */
  function wall(x1: number, z1: number, x2: number, z2: number, hFull = H_CORE, openings: Opening[] = [], o: { t?: number; outer?: boolean } = {}): void {
    const t = o.t || 0.12;
    const alongX = Math.abs(z2 - z1) < 1e-6;
    const gx1 = ax(x1);
    const gz1 = az(z1);
    const P = (s: number): [number, number] => (alongX ? [s, gz1] : [gx1, s]);
    const conv = (op: Opening): Opening => {
      const w = op.b - op.a;
      const W = w <= DOOR_MAX ? w : w * SCALE;
      const C = alongX ? ax((op.a + op.b) / 2) : az((op.a + op.b) / 2);
      return { ...op, a: C - W / 2, b: C + W / 2 };
    };
    let s0 = alongX ? Math.min(ax(x1), ax(x2)) : Math.min(az(z1), az(z2));
    const s1 = alongX ? Math.max(ax(x1), ax(x2)) : Math.max(az(z1), az(z2));
    const put = (a: number, b: number, y0: number, y1: number, mm: Mat = mat.wall, tt = t) => {
      const [pa, pb] = [P(a), P(b)];
      if (mm !== mat.wall || o.outer || EXACT) return seg(pa[0], pa[1], pb[0], pb[1], y0, y1, mm, tt);
      // wall plaster: solid below CUT, ghost above
      const lower = seg(pa[0], pa[1], pb[0], pb[1], y0, Math.min(y1, CUT), mm, tt);
      const upper = seg(pa[0], pa[1], pb[0], pb[1], Math.max(y0, CUT), y1, mat.ghost, tt);
      if (upper) upper.userData.nonav = true;
      return lower;
    };
    openings
      .map(conv)
      .sort((p, q) => p.a - q.a)
      .forEach((op) => {
        const bottom = op.bottom || 0;
        const top = op.top ?? 2.1;
        put(s0, op.a, 0, hFull);
        put(op.a, op.b, top, hFull);
        if (bottom > 0) put(op.a, op.b, 0, bottom);
        let fill: THREE.Mesh | undefined;
        if (op.fill === 'glass') fill = put(op.a, op.b, bottom, top, mat.glass, 0.03);
        if (op.fill === 'frosted') fill = put(op.a, op.b, bottom, top, mat.frosted, 0.03);
        if (op.fill === 'door') fill = put(op.a + 0.03, op.b - 0.03, 0, top - 0.03, mat.lightgrey, t + 0.03);
        if (fill && op.pass) fill.userData.nonav = true;
        s0 = op.b;
      });
    put(s0, s1, 0, hFull);
  }
  /** Exterior window wall: parapet + glazing band with mullions + lintel (model coordinates). */
  function windowWall(x1: number, z1: number, x2: number, z2: number): void {
    const h = H_LOW;
    const sill = 0.85;
    const top = 2.55;
    const bay = 1.1;
    const [gx1, gz1, gx2, gz2] = [ax(x1), az(z1), ax(x2), az(z2)];
    seg(gx1, gz1, gx2, gz2, 0, sill, mat.wall, 0.3);
    seg(gx1, gz1, gx2, gz2, top, h, mat.wall, 0.3);
    seg(gx1, gz1, gx2, gz2, sill, top, mat.glass, 0.03);
    seg(gx1, gz1, gx2, gz2, sill + 0.5, sill + 0.56, mat.white, 0.08);
    const len = Math.hypot(gx2 - gx1, gz2 - gz1);
    const n = Math.round(len / bay);
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const wide = i % 4 === 0;
      rbox(wide ? 0.22 : 0.07, top - sill, wide ? 0.3 : 0.1, gx1 + (gx2 - gx1) * f, sill, gz1 + (gz2 - gz1) * f, mat.white, -Math.atan2(gz2 - gz1, gx2 - gx1));
    }
  }

  /* ---------- furniture ---------- */
  /** Desk template (1.6 x 0.8, chair on local +Z, monitor at local -Z), static parts merged per material. */
  function deskTemplate(white: boolean, w = 1.6, stand = false): THREE.Group {
    const g = new THREE.Group();
    rbox(w, 0.03, 0.8, 0, 0.72, 0, white ? mat.white : mat.black, 0, g);
    if (stand) {
      // sit-stand desk: black column with a T-shaped foot under each end
      for (const sx of [-(w / 2 - 0.2), w / 2 - 0.2]) {
        rbox(0.07, 0.7, 0.07, sx, 0.02, 0, mat.black, 0, g);
        rbox(0.06, 0.04, 0.7, sx, 0, 0, mat.black, 0, g);
      }
    } else {
      for (const sx of [-(w / 2 - 0.06), w / 2 - 0.06]) for (const sz of [-0.34, 0.34]) rbox(0.05, 0.72, 0.05, sx, 0, sz, mat.lightgrey, 0, g);
    }
    rbox(0.58, 0.34, 0.03, 0, 0.86, -0.22, mat.black, 0, g);
    rbox(0.06, 0.12, 0.06, 0, 0.75, -0.24, mat.black, 0, g);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8), mat.dark);
    stem.position.set(0, 0.04 + 0.21, 0.75);
    const star = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.04, 5), mat.dark);
    star.position.set(0, 0.02, 0.75);
    g.add(stem, star);
    rbox(0.46, 0.07, 0.46, 0, 0.45, 0.75, mat.black, 0, g);
    rbox(0.44, 0.5, 0.05, 0, 0.55, 0.98, mat.black, 0, g);
    return mergeStatic(g, false);
  }
  const tplCache = new Map<string, { group: THREE.Group; box: THREE.Box3 }>();
  const tplFor = (white: boolean, w: number, stand: boolean) => {
    const key = `${white}-${w}-${stand}`;
    let t = tplCache.get(key);
    if (!t) {
      const group = deskTemplate(white, w, stand);
      t = { group, box: new THREE.Box3().setFromObject(group) };
      tplCache.set(key, t);
    }
    return t;
  };
  const screenGeo = new THREE.PlaneGeometry(0.54, 0.3);

  /** Tiny cactus / succulent in a pot (about 0.2 m), built in the local space of `parent` (a desk group) on its top at y. */
  function deskPlant(parent: THREE.Object3D, kind: number, x: number, z: number, y: number, pot: Mat): void {
    const ball = (r: number, px: number, py: number, pz: number, m: Mat, sy = 1) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m);
      mesh.scale.y = sy;
      mesh.position.set(px, py + r * sy, pz);
      parent.add(mesh);
    };
    cyl(0.065, 0.05, 0.08, x, y, z, pot, parent, 10);
    const b = y + 0.08;
    switch (kind % 4) {
      case 0: // columnar cactus with two arms
        cyl(0.032, 0.036, 0.16, x, b, z, mat.cactus, parent, 8);
        rbox(0.06, 0.02, 0.02, x + 0.045, b + 0.07, z, mat.cactus, 0, parent);
        cyl(0.015, 0.017, 0.06, x + 0.07, b + 0.07, z, mat.cactus, parent, 6);
        rbox(0.05, 0.02, 0.02, x - 0.04, b + 0.05, z, mat.cactus, 0, parent);
        cyl(0.014, 0.016, 0.045, x - 0.062, b + 0.05, z, mat.cactus, parent, 6);
        ball(0.02, x, b + 0.16, z, mat.flowerPink);
        break;
      case 1: // barrel cactus
        ball(0.065, x, b - 0.01, z, mat.cactus, 0.9);
        ball(0.02, x, b + 0.105, z, mat.flowerYellow);
        break;
      case 2: // rosette succulent
        for (let i = 0; i < 6; i++) ball(0.036, x + Math.cos(i * 1.047) * 0.05, b, z + Math.sin(i * 1.047) * 0.05, mat.succ, 0.45);
        for (let i = 0; i < 5; i++) ball(0.03, x + Math.cos(i * 1.257 + 0.5) * 0.03, b + 0.025, z + Math.sin(i * 1.257 + 0.5) * 0.03, mat.succLight, 0.55);
        ball(0.03, x, b + 0.05, z, mat.succLight, 0.7);
        break;
      default: // aloe
        for (let i = 0; i < 7; i++) {
          const a = i * 0.898;
          const h = 0.11 + (i % 3) * 0.035;
          const horiz = i % 2 === 0;
          rbox(horiz ? 0.035 : 0.014, h, horiz ? 0.014 : 0.035, x + Math.cos(a) * 0.03, b, z + Math.sin(a) * 0.03, i % 2 ? mat.greenL : mat.green, 0, parent);
        }
    }
  }

  function desk(x: number, z: number, rot = 0, o: { white?: boolean; w?: number; stand?: boolean } = {}): void {
    deskSpecs.push({ x: gx(x), z: gz(z), rot, white: !!o.white, w: o.w ?? 1.6, stand: !!o.stand });
  }
  /** Open shelf unit (white boards): w along local X. */
  function shelf(x: number, z: number, w: number, h: number, d = 0.4, rot = 0, fill = true): void {
    const g = new THREE.Group();
    g.position.set(gx(x), 0, gz(z));
    g.rotation.y = rot;
    world.add(g);
    const levels = Math.max(2, Math.round(h / 0.4));
    for (let i = 0; i <= levels; i++) box(w, 0.03, d, 0, Math.max(0.04, (i * (h - 0.03)) / levels), 0, mat.white, 0, g);
    const bays = Math.max(1, Math.round(w / 0.8));
    for (let i = 0; i <= bays; i++) box(0.03, h, d, -w / 2 + (i * w) / bays, 0, 0, mat.white, 0, g);
    if (fill) {
      const cols = [0x8c2f2a, 0xd9d6cf, 0x2e4a6b, 0xe0a13a, 0x222222, 0xf1efe9];
      for (let i = 0; i < bays; i++) {
        for (let l = 0; l < levels; l++) {
          if ((i * 7 + l * 3) % 3 === 0) continue;
          const bw = (w / bays) * (0.45 + ((i + l) % 3) * 0.15);
          const lh = (h - 0.03) / levels;
          box(bw, lh * 0.65, d * 0.7, -w / 2 + ((i + 0.5) * w) / bays, l * lh + 0.06, 0, L(cols[(i * 5 + l * 2) % cols.length]), 0, g);
        }
      }
    }
  }
  function plant(x: number, z: number, h = 1.6, base = 0, spiky = false): void {
    cyl(0.2, 0.15, 0.32, x, base, z, spiky ? mat.terracotta : mat.pot);
    cyl(0.03, 0.03, h * 0.5, x, base + 0.3, z, mat.woodDark, world, 6);
    const n = spiky ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4;
      const r = spiky ? 0.25 : 0.22 + (i % 3) * 0.08;
      const s = new THREE.Mesh(spiky ? new THREE.ConeGeometry(0.09, h * 0.6, 5) : new THREE.SphereGeometry(0.24 + (i % 2) * 0.08, 8, 6), i % 2 ? mat.green : mat.greenL);
      s.position.set(gx(x + Math.cos(a) * r), base + h * (spiky ? 0.75 : 0.5 + i * 0.09), gz(z + Math.sin(a) * r));
      if (spiky) {
        s.rotation.z = Math.cos(a) * -0.5;
        s.rotation.x = Math.sin(a) * 0.5;
      }
      world.add(s);
    }
  }
  function pendant(x: number, z: number, type: 'steel' | 'black' | 'cage' = 'steel', bottom = 2.0, ceil = 3.6): void {
    cyl(0.008, 0.008, EXACT ? ceil - bottom - 0.3 : Math.min(ceil - bottom - 0.3, 0.8), x, bottom + 0.3, z, mat.black, world, 4);
    if (type === 'steel') cyl(0.06, 0.2, 0.3, x, bottom, z, mat.steel);
    if (type === 'black') cyl(0.05, 0.28, 0.3, x, bottom, z, mat.black);
    if (type === 'cage') cyl(0.06, 0.17, 0.3, x, bottom, z, mat.cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat.lampWarm);
    bulb.position.set(gx(x), bottom + 0.05, gz(z));
    world.add(bulb);
  }
  function coatRack(x: number, z: number, dark = true): void {
    cyl(0.2, 0.2, 0.04, x, 0, z, dark ? mat.black : mat.white);
    cyl(0.025, 0.025, 1.75, x, 0, z, dark ? mat.black : mat.plyLight, world, 8);
    box(0.45, 0.9, 0.3, x, 0.75, z, L(dark ? 0x2b2523 : 0xb9b3ab));
  }
  function deskRowZ(x: number, zs: number[], chairSide: number, o: { white?: boolean; w?: number; stand?: boolean } = {}): void {
    if (DEBUG_ROW_LABELS) {
      const n = ++rowCount;
      const tex = canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#d8322a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff';
        g.font = 'bold 84px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(n), w / 2, h / 2 + 4);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      const zm = (Math.min(...zs) + Math.max(...zs)) / 2;
      sp.position.set(gx(x), 1.6, gz(zm));
      sp.scale.set(0.6, 0.6, 1);
      sp.renderOrder = 999;
      scene.add(sp);
      console.log(`desk row ${n}: x=${x} z=${zs.join(',')}`);
    }
    zs.forEach((z) => desk(x, z, chairSide > 0 ? Math.PI / 2 : -Math.PI / 2, o));
  }

  /** Row of desks along x at a fixed z; chairSide > 0 = chairs on the +z side. */
  function deskRowX(z: number, xs: number[], chairSide: number, o: { white?: boolean; w?: number; stand?: boolean } = {}): void {
    if (DEBUG_ROW_LABELS) {
      const n = ++rowCount;
      const tex = canvasTex(128, 128, (g, w, h) => {
        g.fillStyle = '#d8322a';
        g.fillRect(0, 0, w, h);
        g.fillStyle = '#fff';
        g.font = 'bold 84px sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(String(n), w / 2, h / 2 + 4);
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.position.set(gx((Math.min(...xs) + Math.max(...xs)) / 2), 1.6, gz(z));
      sp.scale.set(0.6, 0.6, 1);
      sp.renderOrder = 999;
      scene.add(sp);
    }
    xs.forEach((x) => desk(x, z, chairSide > 0 ? 0 : Math.PI, o));
  }

  /* =================================================================
     EXTERIOR WALLS (only the two cutaway back edges + the west window end)
  ================================================================= */
  wall(B.x0, B.z0, B.x1, B.z0, H_CORE, [], { t: 0.3, outer: true }); // core-side long wall
  windowWall(B.x0, B.z0, B.x0, B.z1); // west end: Wassermelonen windows
  if (EXACT) {
    windowWall(B.x1, B.z0, B.x1, B.z1); // east end windows
    wall(B.x0, B.z1, 7.5, B.z1, H_LOW, [{ a: -4.4, b: -3.4 }], { t: 0.3, outer: true }); // solid part, open doorway (the leaf is dynamic, see `entrance`)
    windowWall(7.5, B.z1, B.x1, B.z1); // long window wall
  }
  for (const [a, b] of [
    [4.3, 10.2],
    [11, 18],
    [27.2, 32.0],
  ]) slab(a, b, B.z0, B.z0, 1.95, 2.65, mat.glassBlock, 0.06).position.z = az(B.z0) + 0.18; // glass-block strips

  /* =================================================================
     CORE (z < 0): text wall + rooms
  ================================================================= */
  wall(-5, CZ, 26, CZ, H_CORE, [
    { a: -3.0, b: -2.0 }, // storage door (open)
    { a: 2.5, b: 3.4, fill: 'door', pass: true }, // closed door under "RISCHE"
    { a: 4.9, b: 5.8 }, // kitchen/dining door
    { a: 6.2, b: 9.5, top: 2.4, fill: 'glass' }, // glazed panel into dining
    { a: 14.4, b: 15.3 }, // "Archiv"
    { a: 18.5, b: 23, top: 2.5 }, // dark room, black curtain
    { a: 23.4, b: 24.3, top: 2.2, fill: 'glass', pass: true }, // booth glass door
  ]);
  for (const x of [0, 4, 10.5, 18.5, 23]) wall(x, B.z0, x, CZ, H_CORE);
  wall(26, B.z0, 26, CZ, H_CORE);
  wall(23, -2.2, 26, -2.2, H_CORE);
  // big wall lettering, up on the wall above the door heads like in the photos
  {
    const text = 'FRISCHE IDEEN, DIE WIRKEN';
    const W = ax(15.5) - ax(0.3); // plan-scaled span of the lettering
    const Hh = EXACT ? 0.95 : 1.25;
    const pxPerM = 4096 / 15.2;
    const tex = canvasTex(Math.round(W * pxPerM), 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#0d0d0f';
      g.textBaseline = 'alphabetic';
      g.font = `${EXACT ? 700 : 800} ${EXACT ? 250 : 252}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      const widths = [...text].map((ch) => g.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      const track = (w - 20 - total) / (text.length - 1);
      let x = 10;
      [...text].forEach((ch, i) => {
        g.fillText(ch, x, EXACT ? 218 : 222);
        x += widths[i] + track;
      });
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    m.position.set(ax(0.3) + W / 2, (EXACT ? 2.2 : 1.95) + Hh / 2, az(CZ) + (EXACT ? 0.07 : 0.08));
    m.userData.nonav = true;
    world.add(m);
  }
  // storage room (dark, boxes)
  within(-3.7, -2.7, () => {
    for (let i = 0; i < 9; i++) box(0.6, 0.4 + (i % 3) * 0.25, 0.5, -4.4 + (i % 3) * 0.75, 0, -1.2 - Math.floor(i / 3) * 1.3, i % 2 ? mat.cardboard : mat.dark);
  });
  // kitchen (x 4..10.5): fridge + counter line on the west wall, dining table east
  within(4.0, B.z0, () => {
    box(0.62, 2.0, 0.65, 4.4, 0, -1.5, mat.white);
    box(0.62, 0.86, 2.7, 4.4, 0, -3.2, mat.white);
    box(0.66, 0.04, 2.7, 4.4, 0.86, -3.2, mat.woodDark);
    box(0.36, 0.55, 2.2, 4.26, 1.5, -3.0, mat.white);
    box(0.5, 0.42, 0.9, 4.42, 0.9, -2.4, mat.steel); // espresso machine
    box(0.12, EXACT ? 2.6 : CUT, 4.2, 4.07, 0, -3.1, mat.black); // dark splash wall
    cyl(0.18, 0.18, 0.55, 5.3, 0, -5.1, mat.steel);
    cyl(0.2, 0.18, 0.5, 5.8, 0, -5.1, mat.grey);
  });
  within(8.1, -3.6, () => {
    box(2.8, 0.05, 0.9, 8.1, 0.72, -3.6, mat.black);
    for (const sx of [-1.3, 1.3]) for (const sz of [-0.38, 0.38]) box(0.07, 0.72, 0.07, 8.1 + sx, 0, -3.6 + sz, mat.lightgrey);
    for (const sz of [-0.85, 0.85]) {
      box(2.8, 0.05, 0.35, 8.1, 0.42, -3.6 + sz, mat.black);
      for (const sx of [-1.3, 1.3]) box(0.07, 0.42, 0.3, 8.1 + sx, 0, -3.6 + sz, mat.lightgrey);
    }
    for (const x of [7.2, 8.1, 9.0]) pendant(x, -3.6, 'black', 1.55, 2.9);
  });
  within(7.6, 0, () => {
    for (const x of [7.2, 8.0]) {
      cyl(0.17, 0.17, 0.05, x, 0.7, -1.55, mat.white);
      cyl(0.025, 0.025, 0.7, x, 0, -1.55, mat.steel, world, 8);
    }
    box(2.6, 0.05, 0.35, 7.8, 1.0, -1.25, mat.white);
  });
  // washroom (x 0..4, left of the kitchen): purple walls, black floor, trough sink with mirror on the south wall next to the door, shower + 3 colored WC cabins on the north wall
  {
    const purple = L(0x3b1f5e);
    const floor = L(0x141416);
    const tile = L(0x4a4d52);
    const mirror = L(0xcfe3ea);
    const lightStrip = new THREE.MeshBasicMaterial({ color: 0xeaf6ff });
    const frame = L(0xf3f1ec);
    const cabinColors = [0xdcdcd8, 0x2fa39a, 0xd9619b, 0xe0502e]; // shower (plain), then 3 WC cabins
    const X_W = 0.07; // inner face of west wall
    const X_E = 3.93; // inner face of east wall (kitchen wall)
    const Z_N = -5.33; // inner face of north wall
    const Z_S = CZ - 0.07; // inner face of south wall
    const ZF = -4.15; // cabin front line
    const edges = [0.07, 1.04, 2.01, 2.98, 3.93];

    slab(0.05, 3.95, -5.35, Z_S, 0.005, 0.025, floor);
    // purple wall paint on the inner faces
    box(0.02, H_CORE, Z_S - Z_N, X_W, 0, (Z_N + Z_S) / 2, purple);
    box(X_E - X_W, H_CORE, 0.02, (X_W + X_E) / 2, 0, Z_N, purple);
    box(2.5 - X_W, H_CORE, 0.02, (X_W + 2.5) / 2, 0, Z_S - 0.01, purple);
    box(X_E - 3.4, H_CORE, 0.02, (3.4 + X_E) / 2, 0, Z_S - 0.01, purple);
    box(0.9, H_CORE - 2.1, 0.02, 2.95, 2.1, Z_S - 0.01, purple); // over the entrance door

    // sink counter with trough basin, tiled ledge, mirror + light strip, plants, towels (south wall, west of the entrance door)
    const SX = 1.25; // sink centre x
    box(2.1, 0.82, 0.5, SX, 0, CZ - 0.38, tile);
    box(2.1, 0.06, 0.6, SX, 0.82, CZ - 0.37, mat.ply);
    box(1.3, 0.12, 0.4, SX, 0.88, CZ - 0.4, mat.white);
    for (const x of [SX - 0.4, SX + 0.4]) {
      box(0.06, 0.06, 0.04, x, 1.08, CZ - 0.12, mat.steel);
      box(0.04, 0.04, 0.2, x, 1.1, CZ - 0.22, mat.steel);
    }
    box(2.1, 0.3, 0.14, SX, 0.88, CZ - 0.14, tile); // tiled back ledge
    box(2.1, 1.35, 0.02, SX, 1.2, Z_S - 0.03, mirror);
    box(2.1, 0.08, 0.08, SX, 2.6, Z_S - 0.05, lightStrip);
    for (const x of [SX - 0.8, SX - 0.45, SX + 0.8]) plant(x, CZ - 0.14, 0.45, 1.18, true);
    for (const z of [-2.0, -2.3]) box(0.04, 0.42, 0.22, X_W + 0.03, 1.1, z, mat.fabric);
    box(0.3, 0.3, 0.3, 0.4, 0, -2.7, mat.dark); // bin

    // cabins along the north wall, doors facing south
    for (let i = 0; i < 4; i++) {
      const x0 = edges[i];
      const x1 = edges[i + 1];
      const xm = (x0 + x1) / 2;
      const col = L(cabinColors[i]);
      const dep = ZF - Z_N;
      const cz = (ZF + Z_N) / 2;
      // colored upper part + grey lower part (inside)
      box(0.03, H_CORE - 1.05, dep, x0 + 0.06, 1.05, cz, col);
      box(0.03, H_CORE - 1.05, dep, x1 - 0.06, 1.05, cz, col);
      box(x1 - x0 - 0.12, H_CORE - 1.05, 0.03, xm, 1.05, Z_N + 0.03, col);
      box(0.03, 1.05, dep, x0 + 0.06, 0, cz, mat.lightgrey);
      box(0.03, 1.05, dep, x1 - 0.06, 0, cz, mat.lightgrey);
      box(x1 - x0 - 0.12, 1.05, 0.03, xm, 0, Z_N + 0.03, mat.lightgrey);
      box(x1 - x0 - 0.1, 0.05, dep, xm, 2.5, cz, col); // low colored ceiling
      // core partition (purple) + front wall with door opening
      box(0.08, H_CORE, dep, x0, 0, cz, purple);
      box(xm - 0.4 - x0, H_CORE, 0.1, (x0 + xm - 0.4) / 2, 0, ZF, purple);
      box(x1 - xm - 0.4, H_CORE, 0.1, (xm + 0.4 + x1) / 2, 0, ZF, purple);
      box(0.8, H_CORE - 2.05, 0.1, xm, 2.05, ZF, purple);
      box(0.05, 2.05, 0.12, xm - 0.4, 0, ZF, frame);
      box(0.05, 2.05, 0.12, xm + 0.4, 0, ZF, frame);
      box(0.85, 0.05, 0.12, xm, 2.05, ZF, frame);
      // door leaf: closed on 1 + 3, ajar on 2 + 4
      if (i % 2 === 0) box(0.78, 2.0, 0.04, xm, 0, ZF + 0.03, frame);
      else {
        const th = (75 * Math.PI) / 180;
        box(0.78, 2.0, 0.04, xm - 0.4 + Math.cos(th) * 0.39, 0, ZF + 0.03 + Math.sin(th) * 0.39, frame, -th);
      }
      // fixtures: 1 = shower, 2 + 3 = toilet, 4 = urinal
      if (i === 0) {
        box(x1 - x0 - 0.3, 0.06, dep - 0.3, xm, 0, cz, mat.white); // shower tray
        cyl(0.02, 0.02, 1.2, xm, 1.0, Z_N + 0.1, mat.steel, world, 8); // riser pipe
        cyl(0.11, 0.11, 0.03, xm, 2.15, Z_N + 0.25, mat.steel); // rain head
      } else if (i === 3) box(0.3, 0.55, 0.28, xm, 0.8, Z_N + 0.2, mat.white); // urinal
      else {
        box(0.4, 0.38, 0.5, xm, 0, Z_N + 0.35, mat.white); // bowl
        box(0.4, 0.35, 0.2, xm, 0.38, Z_N + 0.12, mat.white); // cistern
      }
    }
  }
  // archive: grey shelving
  within(14.1, B.z0, () => {
    for (const x of [11.4, 13.2, 15.0, 16.8]) {
      box(1.6, 2.0, 0.5, x, 0, -5.0, mat.grey);
      for (let i = 0; i < 3; i++) box(0.45, 0.28, 0.4, x - 0.5 + i * 0.5, 2.0, -5.0, mat.crate);
    }
  });
  within(18.5, -2.4, () => box(0.5, 2.0, 2.4, 17.9, 0, -2.8, mat.grey));
  within(10.5, -2.6, () => box(0.5, 2.0, 2.4, 10.9, 0, -2.6, mat.grey));
  // printer corner (south wall of the archive) + server rack (east wall)
  {
    const ledG = new THREE.MeshBasicMaterial({ color: 0x3cff7a });
    const ledA = new THREE.MeshBasicMaterial({ color: 0xffb02e });
    const PX = 12.4;
    const PZ = CZ - 0.45;
    box(1.0, 0.75, 0.6, PX, 0, PZ, mat.plyLight); // table
    box(0.62, 0.36, 0.5, PX, 0.75, PZ, mat.white); // printer body
    box(0.6, 0.04, 0.3, PX, 1.11, PZ, mat.dark); // scanner lid
    box(0.4, 0.02, 0.22, PX, 0.82, PZ - 0.33, mat.lightgrey); // output tray
    box(0.05, 0.02, 0.02, PX + 0.22, 1.0, PZ - 0.26, ledG);
    box(0.25, 0.4, 0.2, PX + 0.65, 0, PZ + 0.05, mat.cardboard); // paper stack on the floor
    const RX = 18.1;
    const RZ = -4.0;
    box(0.7, 2.0, 0.6, RX, 0, RZ, mat.black);
    for (let i = 0; i < 8; i++) {
      const y = 0.15 + i * 0.22;
      box(0.02, 0.16, 0.52, RX - 0.36, y, RZ, mat.dark);
      box(0.02, 0.025, 0.025, RX - 0.375, y + 0.07, RZ - 0.2, i % 3 === 2 ? ledA : ledG);
      box(0.02, 0.025, 0.025, RX - 0.375, y + 0.07, RZ - 0.15, ledG);
    }
    box(0.8, 0.02, 0.62, RX, 2.0, RZ, mat.grey);
  }
  // dark room behind the curtain
  slab(18.6, 22.9, B.z0, B.z0, 0, 3.2, mat.black, 0.05).position.z = az(B.z0) + 0.2;
  slab(18.6, 18.6, B.z0 + 0.15, CZ - 0.15, 0, EXACT ? 3.2 : CUT, mat.black, 0.05);
  slab(22.9, 22.9, B.z0 + 0.15, -2.25, 0, EXACT ? 3.2 : CUT, mat.black, 0.05);
  slab(18.6, 22.9, B.z0 + 0.15, CZ - 0.15, 0.005, 0.025, L(0x1a1a1a));
  within(19.4, 0, () => box(1.6, EXACT ? 2.45 : CUT, 0.12, 19.4, 0, CZ - 0.15, L(0x0c0c0d))); // curtain (drawn part)
  within(20.6, -3.4, () => {
    for (const x of [20.2, 21.0]) {
      cyl(0.17, 0.17, 0.05, x, 0.72, -3.4, mat.white);
      cyl(0.025, 0.025, 0.72, x, 0, -3.4, mat.steel, world, 8);
    }
  });
  // booth interior + shelf niche on east face of core, pallet sofa
  box(0.9, 0.04, 0.5, 25.3, 0.74, -1.8, mat.white);
  within(26, -1.1, () => shelf(26.28, -1.1, 1.9, 2.0, 0.4, Math.PI / 2));
  within(26, -4.2, () => {
    box(0.9, 0.3, 2.0, 26.6, 0, -4.2, mat.plyLight);
    box(0.9, 0.18, 2.0, 26.6, 0.3, -4.2, mat.fabric);
    box(0.25, 0.4, 0.5, 26.3, 0.48, -4.9, mat.black);
  });

  /* =================================================================
     WEST END: entry corridor, Wassermelonen room
  ================================================================= */
  wall(-5, B.z0, -5, B.z1, 3.8, [
    { a: 0.1, b: 2.1, top: 2.6, fill: 'glass', pass: true }, // glass partition + glass door
    { a: 3.6, b: 8.6, bottom: 0.9, top: 2.2 }, // interior window lounge <-> Wassermelonen
  ]);
  wall(-5, CORR, -0.5, CORR, 3.8); // partition entry corridor | lounge (pod stands against it)
  const POD_SHIFT = -3.3; // desks 1-6 sit this much further towards desk 7, makes room for the small meeting room at the south end
  for (const z0 of [1.3, 4.6, 7.7].map((z) => z + POD_SHIFT)) {
    within(-8.3, z0, () => {
      desk(-8.3, z0 - 0.41, Math.PI);
      desk(-8.3, z0 + 0.41, 0);
      shelf(-7.25, z0, 1.6, 1.15, 0.4, Math.PI / 2);
      pendant(-8.3, z0, 'cage', 1.95, 2.8);
      plant(-9.1, z0 + 1.5, 0.9, 0.85);
    });
  }
  desk(-7.6, -4.9, Math.PI, { white: true });
  shelf(-5.9, -5.2, 1.0, 1.0, 0.35);
  coatRack(-5.5, -1.8, false);
  // small meeting room behind desk 6: partition wall with a doorway towards the lounge, sofa and wall-mounted screen
  const MEET_Z = 6.5;
  const meetX = -7.25;
  wall(B.x0, MEET_Z, -5, MEET_Z, H_LOW, [{ a: -6.7, b: -5.6 }]);
  box(1.6, 0.9, 0.05, meetX, 1.0, MEET_Z + 0.085, mat.black); // screen on the partition, facing the sofa
  box(1.52, 0.82, 0.01, meetX, 1.04, MEET_Z + 0.115, L(0x20262c));
  box(2.1, 0.4, 0.9, meetX, 0, 8.75, mat.fabric); // sofa seat
  box(2.1, 0.5, 0.2, meetX, 0.4, 9.15, mat.fabric); // backrest
  for (const dx of [-1.0, 1.0]) box(0.2, 0.28, 0.9, meetX + dx, 0.4, 8.75, mat.dark); // armrests
  box(0.9, 0.38, 0.5, meetX, 0, 7.6, mat.plyLight); // coffee table
  plant(-5.6, -3.5, 1.5);

  /* =================================================================
     LOUNGE: pod, foosball, reception counter
  ================================================================= */
  within(-1.9, CORR, () => {
    // house-shaped pod: black shell, plywood interior, opens to +z
    const g = new THREE.Group();
    // stretches from the west wall to its old right edge, backs onto the corridor partition
    const wallX = ax(-5) + 0.06;
    const right = gx(-1.9) + 1.15;
    const w = right - wallX;
    const d = 2.2;
    const eave = 2.0;
    const rise = 1.4;
    g.position.set((wallX + right) / 2, 0, az(CORR) + 0.06 + d / 2);
    world.add(g);
    box(w, 0.14, d, 0, 0, 0, mat.ply, 0, g);
    for (const s of [-1, 1]) {
      box(0.1, eave, d, s * (w / 2 - 0.05), 0, 0, mat.black, 0, g);
      box(0.03, eave, d - 0.1, s * (w / 2 - 0.12), 0.1, 0, mat.ply, 0, g);
    }
    box(w, eave, 0.08, 0, 0, -d / 2 + 0.04, mat.black, 0, g);
    box(w - 0.2, eave, 0.03, 0, 0.1, -d / 2 + 0.1, mat.ply, 0, g);
    const len = Math.hypot(w / 2, rise);
    const ang = Math.atan2(rise, w / 2);
    for (const s of [-1, 1]) {
      const r = box(len + 0.08, 0.1, d, (s * w) / 4, eave + rise / 2 - 0.05, 0, mat.black, 0, g);
      r.rotation.z = -s * ang;
      const r2 = box(len - 0.1, 0.03, d - 0.1, (s * w) / 4, eave + rise / 2 - 0.13, 0, mat.ply, 0, g);
      r2.rotation.z = -s * ang;
    }
    quad(
      [
        [-w / 2, eave, -d / 2 + 0.1],
        [w / 2, eave, -d / 2 + 0.1],
        [0, eave + rise, -d / 2 + 0.1],
      ],
      L(0xc98b47, { side: THREE.DoubleSide }),
      g,
    );
    box(w - 0.3, 0.45, 0.45, 0, 0.14, -d / 2 + 0.35, mat.black, 0, g);
    box(w - 0.3, 0.45, 0.1, 0, 0.59, -d / 2 + 0.17, mat.black, 0, g);
    box(0.45, 0.45, 1.0, w / 2 - 0.4, 0.14, 0.2, mat.black, 0, g);
    box(1.1, 0.04, 0.6, -0.25, 0.86, 0.15, mat.ply, 0, g);
    box(0.06, 0.72, 0.06, -0.25, 0.14, 0.15, mat.black, 0, g);
    for (const x of [-0.5, -0.3, -0.1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat.lampWarm);
      b.position.set(x, 1.55 + x * 0.3, -0.3);
      g.add(b);
    }
  });
  plant(-4.3, 4.7, 2.2);
  {
    // foosball table: wooden body, green field, handled rods with little players
    const g = new THREE.Group();
    g.position.set(gx(-4.3), 0, gz(8.4)); // SW corner of lounge, long side along west wall
    g.rotation.y = Math.PI / 2;
    world.add(g);
    box(1.45, 0.3, 0.78, 0, 0.6, 0, mat.wood, 0, g);
    box(1.3, 0.02, 0.66, 0, 0.9, 0, L(0x3f7d4a), 0, g);
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.3, 0.3]) box(0.09, 0.62, 0.09, sx, 0, sz, mat.black, 0, g);
    for (let i = 0; i < 8; i++) {
      const rx = -0.56 + i * 0.16;
      const rod = cyl(0.012, 0.012, 1.2, rx, 0, 0, mat.steel, g, 6);
      rod.position.y = 0.97;
      rod.rotation.x = Math.PI / 2;
      for (const sz of [-1, 1]) box(0.035, 0.035, 0.12, rx, 0.95, sz * 0.62, mat.black, 0, g); // handles
      for (const pz of [-0.18, 0, 0.18]) if ((i + (pz > 0 ? 1 : 0)) % 3 !== 2) box(0.05, 0.1, 0.04, rx, 0.9, pz, i % 2 ? mat.white : L(0xd8322a), 0, g);
    }
  }
  // reception counter (white, slatted front) dividing lounge from first desk row
  {
    const m = new THREE.MeshLambertMaterial({ map: slats });
    const zc = az(6.025);
    const len = 6.65 * SCALE; // runs to the window wall
    rbox(0.6, 1.12, len, ax(2.0), 0, zc, m);
    rbox(0.7, 0.05, len + 0.1, ax(2.0), 1.12, zc, mat.white);
  }
  // bunting + string lights (hang from the ceiling -> part of the roof layer)
  const sagLine = (a: THREE.Vector3, b: THREE.Vector3, n: number, sag: number, fn: (p: THREE.Vector3, i: number) => void) => {
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      fn(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, -sag * 4 * t * (1 - t), 0)), i);
    }
  };
  const bunting = (a: THREE.Vector3, b: THREE.Vector3, colors: number[]) => {
    const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize().multiplyScalar(0.11);
    const n = Math.round(a.distanceTo(b) / 0.3);
    const pts: THREE.Vector3[] = [];
    sagLine(a, b, n, 0.35, (p, i) => {
      pts.push(p);
      quad(
        [
          [p.x - dir.x, p.y, p.z - dir.z],
          [p.x + dir.x, p.y, p.z + dir.z],
          [p.x, p.y - 0.27, p.z],
        ],
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], side: THREE.DoubleSide }),
        roof,
      );
    });
    roof.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x333333 })));
  };
  const stringLights = (a: THREE.Vector3, b: THREE.Vector3) => {
    const pts: THREE.Vector3[] = [];
    sagLine(a, b, Math.round(a.distanceTo(b) / 0.5), 0.4, (p) => {
      pts.push(p);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 5), mat.lampWarm);
      s.position.copy(p).y -= 0.04;
      roof.add(s);
    });
    roof.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x111111 })));
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(ax(x), y, az(z));
  const blues = [0x6f8ea3, 0x9fb7c4, 0x55707f, 0xb9c9cf];
  const warm = [0xe58b4e, 0xf0b9a8, 0xe9d27a, 0x7fc0b0];
  bunting(V(-4.8, 3.5, 3.0), V(4.4, 3.3, 9.0), blues);
  bunting(V(-0.6, 3.6, 2.4), V(4.4, 3.2, 8.2), blues);
  bunting(V(-4.8, 3.6, 8.8), V(4.4, 3.4, 3.0), warm);
  bunting(V(-4.8, 3.3, 6.0), V(4.4, 3.5, 6.2), blues);
  stringLights(V(-4.8, 3.7, 9.0), V(4.4, 3.4, 2.6));
  stringLights(V(-4.8, 3.6, 4.0), V(4.4, 3.5, 7.4));
  stringLights(V(-2.0, 3.8, 2.4), V(1.0, 3.6, 9.2));

  /* =================================================================
     OPEN OFFICE: three desk clusters between corridor and long window wall
  ================================================================= */
  // rows of 3 wider desks, the same total width as the old rows of 4 (z 2.9..9.3)
  const ROW3_W = 6.4 / 3;
  const ROW3 = [2.9 + ROW3_W / 2, 6.1, 9.3 - ROW3_W / 2];
  const ROW3_OPT = { w: ROW3_W };
  // Hashtag-Himbeeren (x 4.8..9.5)
  within(7.1, 6.1, () => {
    deskRowZ(2.72, ROW3, 1, ROW3_OPT); // flipped, back against the reception counter (face x=2.3)
    box(0.42, 1.3, 6.45, 5.696, 0, 6.125, mat.white); // white divider units, ~1.1 m behind the chairs
    for (const z of [4.5, 7.2]) pendant(3.0, z, 'steel', 2.1, 4.2);
  });
  // Kreative Kiwis (x 9.7..12.483)
  within(9.08, 5.9, () => {
    deskRowZ(8.672, ROW3, -1, ROW3_OPT);
    deskRowZ(9.492, ROW3, 1, ROW3_OPT);
    shelf(9.08, 2.65, 2.0, 1.3, 0.4);
    for (const z of [4.6, 7.0]) pendant(9.08, z, 'steel', 2.1, 4.2);
    box(0.25, 3.8, 0.25, 12.483, 0, 3.0, mat.white); // structural column
    box(0.45, 1.25, 6.15, 12.483, 0, 6.275, mat.white); // planter / divider wall
    seg(gx(12.483), gz(5.2), gx(12.483), gz(8.0), 1.25, 2.1, mat.glass, 0.03);
    plant(12.483, 3.5, 1.9, 1.25, true);
    plant(12.483, 6.5, 0.9, 1.25, true);
    coatRack(12.083, 2.65);
  });
  // Digitale Birnen (x 14.7..19.5)
  within(15.884, 6.1, () => {
    deskRowZ(15.474, ROW3, -1, ROW3_OPT);
    deskRowZ(16.294, ROW3, 1, ROW3_OPT);
    shelf(15.884, 2.65, 2.4, 1.3, 0.4);
    for (const z of [4.8, 7.2]) pendant(15.884, z, 'steel', 2.1, 4.2);
    plant(18.6, 8.9, 1.0, 0.85);
  });
  // frosted glass wall on low cabinet (Birnen | glass room)
  slab(19.06, 19.5, CORR + 0.15, B.z1, 0, 1.1, mat.white);
  segM(19.5, CORR, 19.5, B.z1, 1.1, 2.7, mat.frosted, 0.04);
  segM(19.5, CORR, 19.5, B.z1, 2.7, 2.8, mat.white, 0.1);
  box(0.3, 0.14, 0.5, 19.2, 1.1, 5.0, L(0xd8322a));

  /* =================================================================
     GLASS ROOM (x 19.5..26.5) - interior not photographed
  ================================================================= */
  wall(19.5, CORR, 26.5, CORR, H_CORE, [{ a: 20.2, b: 21.1 }]);
  segM(26.5, CORR, 26.5, B.z1, 0, 2.7, mat.frosted, 0.04);
  segM(26.5, CORR, 26.5, B.z1, 2.7, 2.8, mat.white, 0.1);
  rbox(0.1, 2.8, 0.1, ax(26.5), 0, az(CORR), mat.white);
  {
    // year planner on corridor side
    const tex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#bbb';
      for (let x = 8; x < w; x += 8) {
        g.beginPath();
        g.moveTo(x, 6);
        g.lineTo(x, h - 6);
        g.stroke();
      }
      for (let y = 6; y < h; y += 10) {
        g.beginPath();
        g.moveTo(8, y);
        g.lineTo(w - 8, y);
        g.stroke();
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
    m.position.set(ax(23.6), 1.65, az(CORR) - 0.07);
    m.rotation.y = Math.PI;
    m.userData.nonav = true;
    world.add(m);
  }
  within(23, 6.0, () => {
    // conference table, long axis along z (towards the TV)
    box(1.3, 0.05, 4.4, 23, 0.72, 6.0, mat.white);
    box(0.8, 0.72, 0.1, 23, 0, 4.0, mat.lightgrey);
    box(0.8, 0.72, 0.1, 23, 0, 8.0, mat.lightgrey);
    // wall-mounted TV on the door wall (corridor side), facing into the room
    box(1.4, 0.8, 0.05, 23, 1.0, 2.3, mat.black);
    box(1.32, 0.72, 0.01, 23, 1.04, 2.33, L(0x20262c));
    // red shell chairs (one moulded seat+back shell on a slim 4-leg steel frame), 3 per long side, backs away from the table
    const shellMat = L(0xe5402a, { side: THREE.DoubleSide });
    const frameMat = L(0x8d867f);
    const shellGeo = shellChairGeometry();
    for (const [cx, dir] of [[22.0, -1], [24.0, 1]] as const) {
      for (const cz of [4.8, 6.0, 7.2]) {
        const chair = new THREE.Group();
        chair.position.set(gx(cx), 0, gz(cz));
        chair.rotation.y = dir < 0 ? 0 : Math.PI; // local +x = seat front, faces the table
        chair.add(new THREE.Mesh(shellGeo, shellMat));
        for (const [fx, tx] of [[0.14, 0.27], [-0.1, -0.26]]) {
          for (const sz of [-1, 1]) {
            chairRod(chair, [fx, 0.42, sz * 0.17], [tx, 0.02, sz * 0.27], 0.011, frameMat);
            cyl(0.016, 0.016, 0.02, tx, 0, sz * 0.27, mat.black, chair, 8);
          }
          chairRod(chair, [fx, 0.415, -0.17], [fx, 0.415, 0.17], 0.01, frameMat); // cross bar under the shell
        }
        world.add(chair);
      }
    }
  });

  /* =================================================================
     EAST END STRIP (x 26.5..31.5), full building depth
  ================================================================= */
  // After the photos (IMG_8872-8876): sit-stand desks, long rows running from the glass wall towards the east windows,
  // one head desk facing the windows, a walkway (and a low cabinet / plants) along the window wall, white open shelves as end caps.
  const SS = { stand: true };
  const ROW_W = 1.5;
  const EAST_XS = [29.1, 30.6]; // two desks per row, x 28.35..31.35
  for (const zc of [4.2, 7.6]) {
    within(29.9, zc, () => {
      deskRowX(zc - 0.41, EAST_XS, -1, { ...SS, w: ROW_W });
      deskRowX(zc + 0.41, EAST_XS, 1, { ...SS, w: ROW_W });
      desk(27.95, zc, -Math.PI / 2, SS); // head desk: chair on the west side, faces the east windows
      shelf(31.65, zc, 1.6, 1.1, 0.35, Math.PI / 2); // open shelf closing the group towards the walkway
      pendant(30.2, zc, 'black', 1.95, 2.8);
      pendant(28.4, zc, 'black', 1.95, 2.8);
    });
  }
  plant(32.1, 5.9, 0.8, 0.85); // sill plant between the two groups
  box(0.45, 0.7, 1.2, 32.05, 0, 2.9, mat.white); // low white cabinet under the east windows
  // tables 10 + 11: centred in the room (x 27.1..32.35) and pushed against the north wall (inner face z = -5.35)
  within(29.7, -3.7, () => {
    deskRowZ(29.3, [-4.5, -2.9], -1, SS);
    deskRowZ(30.1, [-4.5, -2.9], 1, SS);
    shelf(29.7, -1.7, 1.0, 1.1, 0.35, 0);
    pendant(29.7, -3.7, 'black', 1.95, 2.8);
  });
  coatRack(31.9, -1.4, false); // white coat stand near the window
  box(0.8, 0.6, 0.45, 31.9, 0, 1.1, mat.lightgrey); // drawer cabinet at window
  coatRack(32.1, 0.1, true);
  plant(32.1, -0.9, 1.3);
  plant(27.1, 9.0, 1.1);

  /* =================================================================
     ROOF / CEILINGS (toggle) - simplified sawtooth with clerestory glazing
  ================================================================= */
  {
    const rm = L(0xf4f2ee, { side: THREE.DoubleSide });
    const flat = (x1: number, z1: number, x2: number, z2: number, y: number) =>
      rbox(ax(x2) - ax(x1), 0.08, az(z2) - az(z1), (ax(x1) + ax(x2)) / 2, y, (az(z1) + az(z2)) / 2, rm, 0, roof);
    const rq = (pts: P3[], m: Mat) => quad(pts.map(([x, y, z]) => [ax(x), y, az(z)] as P3), m, roof);
    flat(B.x0, B.z0, -5, B.z1, H_LOW); // Wassermelonen flat ceiling
    flat(-5, BAND, B.x1, B.z1, H_LOW); // low band along long window wall
    flat(27.7, B.z0, B.x1, BAND, H_LOW); // low band along east end
    flat(-5, B.z0, 26, CZ, H_CORE); // lid of core box
    const lo = 3.8;
    const hi = 5.5;
    for (let i = 0; i < TEETH.length - 1; i++) {
      const a = TEETH[i];
      const b = TEETH[i + 1];
      rq([[a, lo, B.z0], [b, hi, B.z0], [b, hi, BAND], [a, lo, BAND]], rm); // rising slope
      rbox(0.25, 0.6, az(BAND) - az(B.z0), ax(b), 3.3, (az(B.z0) + az(BAND)) / 2, rm, 0, roof); // beam
      rq([[b, 3.9, B.z0], [b, 5.2, B.z0], [b, 5.2, BAND], [b, 3.9, BAND]], mat.glass); // clerestory
      rq([[b, 5.2, B.z0], [b, hi, B.z0], [b, hi, BAND], [b, 5.2, BAND]], rm);
      for (let z = az(B.z0); z <= az(BAND); z += 1.74) rbox(0.08, 1.3, 0.08, ax(b), 3.9, z, mat.white, 0, roof);
      rq([[a, H_LOW, BAND], [b, H_LOW, BAND], [b, hi, BAND], [a, lo, BAND]], rm); // fascia above low band
      rq([[a, H_CORE, B.z0], [b, H_CORE, B.z0], [b, hi, B.z0], [a, lo, B.z0]], rm); // core-side gable
    }
    rq([[-5, H_LOW, B.z0], [-5, lo, B.z0], [-5, lo, BAND], [-5, H_LOW, BAND]], rm);
    const xEnd = TEETH[TEETH.length - 1] + 5;
    rbox(ax(xEnd) - ax(-5), 0.05, 0.08, (ax(-5) + ax(xEnd)) / 2, 3.45, az(1.0), L(0x9a9da0), 0, roof); // linear light
    rbox(9 * SCALE, 0.08, 0.4, ax(-0.5), 3.55, az(8.9), mat.grey, 0, roof); // cable tray over lounge
  }

  /* =================================================================
     Collect walking blockers, desks, then merge the static geometry
  ================================================================= */
  scene.add(world, roof);
  world.updateMatrixWorld(true);
  roof.updateMatrixWorld(true);

  const blockers: THREE.Box3[] = [];
  world.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.nonav) return;
    const bb = new THREE.Box3().setFromObject(o);
    if (bb.min.y < 1.2 && bb.max.y > 0.25) blockers.push(bb);
  });

  const desks: DeskPlacement[] = [];
  const POTS = [mat.terracotta, mat.potWhite, mat.pot];
  for (const [i, s] of deskSpecs.entries()) {
    const tpl = tplFor(s.white, s.w, s.stand);
    const root = tpl.group.clone();
    root.position.set(s.x, 0, s.z);
    root.rotation.y = s.rot;
    const screen = new THREE.Mesh(screenGeo, screenOffMaterial());
    screen.position.set(0, 1.03, -0.22 + 0.0165);
    root.add(screen);
    // a little plant in the back corner next to the monitor (alternating side), varied kind and pot
    const pg = new THREE.Group();
    pg.position.set(s.x, 0, s.z);
    pg.rotation.y = s.rot;
    world.add(pg);
    deskPlant(pg, i, (i % 2 ? 1 : -1) * (s.w / 2 - 0.18), -0.27, 0.75, POTS[(i >> 2) % 3]);
    scene.add(root);
    root.updateMatrixWorld(true);
    blockers.push(tpl.box.clone().applyMatrix4(root.matrixWorld));
    const sin = Math.sin(s.rot);
    const cos = Math.cos(s.rot);
    desks.push({
      rig: { root, screen },
      seat: { x: s.x + sin * 0.75, z: s.z + cos * 0.75 },
      yaw: s.rot + Math.PI,
      back: { x: sin, z: cos },
    });
  }

  const staticWorld = mergeStatic(world, true);
  const staticRoof = mergeStatic(roof, true);
  scene.remove(world, roof);
  scene.add(staticWorld);
  staticRoof.visible = false;
  scene.add(staticRoof);

  // entrance door leaf (not merged, so it can swing open when somebody walks through)
  const door = new THREE.Group();
  const doorW = 0.94;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW, 2.07, 0.05), mat.lightgrey);
  leaf.position.set(doorW / 2, 2.07 / 2, 0);
  leaf.castShadow = true;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.09), mat.steel);
  handle.position.set(doorW - 0.1, 1.0, 0);
  door.add(leaf, handle);
  door.position.set(ax(-3.9) - 0.5 + 0.03, 0, az(B.z1));
  scene.add(door);

  // printer paper (not merged, shown while somebody prints)
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.3), L(0xffffff));
  paper.position.set(ax(12.4), 0.84, az(CZ - 0.45 - 0.33));
  paper.visible = false;
  scene.add(paper);
  const printer = { stand: { x: ax(12.4), z: az(CZ - 1.25) }, yaw: 0, paper };

  return { desks, blockers, roof: staticRoof, entrance: door, printer };
}

/**
 * Merges all meshes below `root` into one mesh per material (world space if `worldSpace`, else relative to root).
 * Lines are carried over as they are.
 */
function mergeStatic(root: THREE.Object3D, worldSpace: boolean): THREE.Group {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { material: Mat; geos: THREE.BufferGeometry[] }>();
  const loose: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Line) {
      if (worldSpace && o.parent) o.applyMatrix4(o.parent.matrixWorld);
      loose.push(o);
      return;
    }
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const m = o.material as Mat & { color?: THREE.Color; map?: THREE.Texture | null };
    const key = [m.type, m.color?.getHex(), m.map?.uuid, m.transparent, m.opacity, m.side].join('|');
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(worldSpace ? o.matrixWorld : new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const b = buckets.get(key) ?? { material: m, geos: [] };
    b.geos.push(g);
    buckets.set(key, b);
  });
  const out = new THREE.Group();
  for (const { material, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = !material.transparent;
    mesh.receiveShadow = true;
    if (material.transparent) mesh.renderOrder = 2;
    out.add(mesh);
  }
  for (const l of loose) {
    l.removeFromParent();
    out.add(l);
  }
  return out;
}
