import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Vec2 } from '../game/NavGrid';
import { screenOffMaterial, type DeskRig } from './officeBuilder';
import { RoomItem, type ItemAnchor } from './roomItem';

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
/** Small meeting room: an annex outside the base rectangle, hanging off the south wall at the west end (model metres). */
export const ANNEX = { x1: -5, d: 3.5 };
export const ANNEX_W = ax(ANNEX.x1);
export const ANNEX_D = ANNEX.d * SCALE;
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
const FRAME_LAP = 0.006; // door frame overlaps the glass around it by this much (m), so no faces are coplanar
const POST_LAP = 0.004; // door handle posts reach this far (m) into the leaf
const GLASS_SINK = 0.02; // glass panes standing on the floor reach this far (m) below it
const LEAF_GAP = 0.006; // air gap (m) around a glass door leaf

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
  /** every piece of furniture the room editor can move (desks included) */
  items: RoomItem[];
  /** coat stands with their hooks */
  coatRacks: CoatRackRig[];
  /** footprints (game space) that block walking, for the nav grid: architecture + the items where they stand right now */
  blockers(): THREE.Box3[];
  /** ceiling, beams, clerestory, bunting, string lights (hidden by default) */
  roof: THREE.Group;
  /** the two wings of the front door, each hinged at its outer jamb and swinging on its own: rotation.y = 0 is closed, negative (left) / positive (right) swings it outwards */
  entrance: { left: THREE.Group; right: THREE.Group };
  /** swinging interior doors */
  doors: DoorRig[];
  /** the two spots where people stand to play foosball (game coordinates, yaw = facing the table) */
  foosball: Array<{ x: number; z: number; yaw: number }>;
  /** printer in the archive: where people stand (game coordinates), facing yaw, and the paper that shows while printing */
  printer: { stand: { x: number; z: number; yaw: number }; paper: THREE.Mesh };
  /** numbered sprites above every desk row (the tables) */
  rowLabels: THREE.Group;
  /** numbered sprites above every room (blue), toggled in the settings */
  roomLabels: THREE.Group;
  /** glass meeting room: doorway centre, table centre and the 8 chairs (game coordinates, yaw = facing the table) */
  meeting: { doorPos: Vec2; center: Vec2; seats: Array<{ x: number; z: number; yaw: number }> };
  /** the two bench seats in the wooden pod (game coordinates, yaw = facing out of the pod) */
  pod: { center: Vec2; seats: Array<{ x: number; z: number; yaw: number }> };
  /** kitchen: where the coffee group gathers (game coordinates, in front of the espresso machine), the machine itself and the two spots to stand at it */
  kitchen: { center: Vec2; machine: Vec2; stands: Vec2[]; table: Array<{ x: number; z: number; yaw: number }> };
  /** the stool in the phone box (game coordinates, yaw = facing the door) */
  phoneBooth: { seat: { x: number; z: number; yaw: number }; doorPos: Vec2 };
}

type Mat = THREE.Material;

/** One hook of a coat stand: where a coat hangs and which way it faces (away from the pole; yaw, 0 = +z). */
export interface CoatHook {
  at: THREE.Vector3;
  yaw: number;
}
/** A coat stand in the scene: `root` moves with the room item, the hooks are in its space. */
export interface CoatRackRig {
  root: THREE.Object3D;
  pegs: CoatHook[];
}
/** Height of a coat stand and the number of hook arms around its pole. */
const STAND_H = 1.8;
const HOOKS = 6;

/** A swinging door leaf: `pivot.rotation.y = base + swing * open * DOOR_SWING` (open = 0 closed .. 1 wide open). */
export interface DoorRig {
  pivot: THREE.Group;
  base: number;
  /** +1 / -1: which side of the wall the leaf swings to */
  swing: 1 | -1;
  /** centre of the doorway, game coordinates */
  center: Vec2;
  /** leaf size */
  width: number;
  height: number;
}
export const DOOR_SWING = 1.6;

interface Opening {
  a: number;
  b: number;
  bottom?: number;
  top?: number;
  fill?: 'glass' | 'frosted' | 'door';
  /** people can walk through (door / glass door) */
  pass?: boolean;
  /** dynamic swinging leaf (hinged at `a`), value = swing side; `fill: 'glass'` makes it a glass door */
  door?: 1 | -1;
  /** glass as thick as the wall, so it sits flush with the wall above it */
  flush?: boolean;
  /** a / b are already game coordinates (no plan scaling) */
  abs?: boolean;
  /** glass only: oversize the pane by this much (m) on every side (thickness unchanged) so it overlaps the wall around the opening */
  grow?: number;
  /** wall above the opening is fully solid (not the see-through ghost above CUT) */
  solidAbove?: boolean;
  /** door only: dark frame around the door, fixed glass above it up to the wall top (no plaster) */
  frame?: boolean;
}

export function buildOffice(scene: THREE.Scene): OfficeModel {
  rowCount = 0;
  const rowLabels = new THREE.Group();
  scene.add(rowLabels);
  const world = new THREE.Group();
  const roof = new THREE.Group();
  const doors: DoorRig[] = [];
  const meetSeats: Array<{ x: number; z: number; yaw: number }> = [];
  const podSeats: Array<{ x: number; z: number; yaw: number }> = [];
  const podCenter: Vec2 = { x: 0, z: 0 };
  const boothSeat = { x: 0, z: 0, yaw: -Math.PI / 2 }; // faces west (the table on the west wall)
  const meetCenter: Vec2 = { x: 0, z: 0 };
  const kitchenCenter: Vec2 = { x: 0, z: 0 };
  const kitchenMachine: Vec2 = { x: 0, z: 0 };
  const tableSeats: Array<{ x: number; z: number; yaw: number }> = [];
  const kitchenStands: Vec2[] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  const deskSpecs: Array<{ id: string; x: number; z: number; rot: number; white: boolean; w: number; stand: boolean }> = [];

  /* ---------- movable items (room editor) ---------- */
  interface ItemDraft {
    id: string;
    kind: string;
    label: string;
    objs: THREE.Object3D[];
    anchors: ItemAnchor[];
  }
  const drafts: ItemDraft[] = [];
  /** coat stands: the item they belong to, their group (model pose) and the hooks in the group's space */
  interface CoatRackSpec {
    draft: ItemDraft;
    group: THREE.Group;
    pegs: CoatHook[];
  }
  const rackSpecs: CoatRackSpec[] = [];
  const draftStack: ItemDraft[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (id: string): string => {
    let out = id;
    for (let n = 2; usedIds.has(out); n++) out = `${id}#${n}`;
    usedIds.add(out);
    return out;
  };
  /** Stable id from the model coordinates in the source, e.g. `shelf@26.28,-1.1`. */
  const at = (kind: string, x: number, z: number) => `${kind}@${+x.toFixed(3)},${+z.toFixed(3)}`;
  /**
   * Everything `fn` adds to the world becomes one movable item (the room editor moves / turns / hides it as a whole).
   * Items nest: an inner item takes its own parts, the outer one keeps the rest.
   */
  function item<T>(kind: string, id: string, label: string, fn: () => T): T {
    const start = world.children.length;
    const d: ItemDraft = { id: uniqueId(id), kind, label, objs: [], anchors: [] };
    draftStack.push(d);
    const out = fn();
    draftStack.pop();
    d.objs = world.children.slice(start);
    for (const o of d.objs) world.remove(o);
    if (d.objs.length) drafts.push(d);
    return out;
  }
  /** Ties a point (seat, standing spot; game coordinates) to the item being built, so it moves with it. */
  const track = <T extends ItemAnchor>(p: T): T => {
    draftStack[draftStack.length - 1]?.anchors.push(p);
    return p;
  };

  /* ---------- placement: anchors scale, groups stay rigid ---------- */
  let cluster: { x: number; z: number } | null = null;
  /** Furniture x/z (model coords) -> game coords. Inside `within` everything keeps its offset from the cluster anchor. */
  const gx = (x: number) => (cluster ? ax(cluster.x) + (x - cluster.x) : ax(x));
  const gz = (z: number) => (cluster ? az(cluster.z) + (z - cluster.z) : az(z));
  /** Place a group of furniture rigidly: the anchor (cx, cz) is scaled with the plan, the rest keeps its offsets. */
  const within = (cx: number, cz: number, fn: () => void, label = 'Möbelgruppe'): void => {
    const prev = cluster;
    cluster = { x: cx, z: cz };
    item('group', at('group', cx, cz), label, fn);
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
      if (op.abs) return op;
      const w = op.b - op.a;
      const W = w <= DOOR_MAX ? w : w * SCALE;
      const C = alongX ? ax((op.a + op.b) / 2) : az((op.a + op.b) / 2);
      return { ...op, a: C - W / 2, b: C + W / 2 };
    };
    let s0 = alongX ? Math.min(ax(x1), ax(x2)) : Math.min(az(z1), az(z2));
    const s1 = alongX ? Math.max(ax(x1), ax(x2)) : Math.max(az(z1), az(z2));
    const put = (a: number, b: number, y0: number, y1: number, mm: Mat = mat.wall, tt = t) => {
      const [pa, pb] = [P(a), P(b)];
      // see-through panes standing on the floor start just below it: their (double-sided) bottom face would z-fight with the floor
      if ((mm === mat.glass || mm === mat.frosted) && y0 === 0) y0 = -GLASS_SINK;
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
        if (op.frame) {
          // frame: two jambs + head, fixed glass transom above up to the wall top.
          // No coplanar faces (they z-fight and flicker): the jambs reach a little into the neighbouring panes,
          // the head sits between the jambs and the transom glass starts inside the head.
          put(op.a - FRAME_LAP, op.a + 0.05, 0, top + 0.05, mat.black, t + 0.02);
          put(op.b - 0.05, op.b + FRAME_LAP, 0, top + 0.05, mat.black, t + 0.02);
          put(op.a + 0.05, op.b - 0.05, top, top + 0.05, mat.black, t + 0.02);
          put(op.a, op.b, top + 0.05 - FRAME_LAP, hFull, mat.glass, op.flush ? t : 0.03);
        } else if (op.solidAbove) seg(...P(op.a), ...P(op.b), top, hFull, mat.wall, t);
        else put(op.a, op.b, top, hFull);
        if (bottom > 0) put(op.a, op.b, 0, bottom);
        let fill: THREE.Mesh | undefined;
        if (op.door) {
          const glassDoor = op.fill === 'glass';
          // leaf fills the opening exactly (inside the dark frame jambs when there is one), no gaps
          const inset = op.frame ? 0.05 : 0;
          const W = op.b - op.a - 2 * inset;
          const H = top;
          const pivot = new THREE.Group();
          // glass leaf: small air gap all round, so its edges are never coplanar with the frame, the wall or the floor (z-fighting)
          const gap = glassDoor ? LEAF_GAP : 0;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(W - 2 * gap, H - 2 * gap, glassDoor ? 0.03 : t), glassDoor ? mat.glass : mat.lightgrey);
          leaf.position.set(W / 2, H / 2, 0);
          leaf.castShadow = !glassDoor;
          pivot.add(leaf);
          // lever handle on both faces: bar on two short posts
          const th = glassDoor ? 0.015 : t / 2; // half leaf thickness
          for (const side of [-1, 1]) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.025), mat.steel);
            bar.position.set(W - 0.12, 1.0, side * (th + 0.04));
            pivot.add(bar);
            for (const px of [W - 0.19, W - 0.05]) {
              // posts reach a little into the leaf: their end faces are not coplanar with the (see-through) leaf face
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.04 + POST_LAP), mat.steel);
              post.position.set(px, 1.0, side * (th + 0.02 - POST_LAP / 2));
              pivot.add(post);
            }
          }
          const base = alongX ? 0 : -Math.PI / 2;
          const [hx, hz] = P(op.a + inset);
          pivot.position.set(hx, 0, hz);
          pivot.rotation.y = base;
          scene.add(pivot);
          const [cx, cz] = P((op.a + op.b) / 2);
          doors.push({ pivot, base, swing: op.door, center: { x: cx, z: cz }, width: W, height: H });
          s0 = op.b;
          return;
        }
        if (op.fill === 'glass') {
          const g = op.grow ?? 0;
          fill = put(op.a - g, op.b + g, Math.max(0, bottom - g), Math.min(hFull, top + g), mat.glass, op.flush ? t : 0.03);
        }
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
  /** Black task chair (flat nylon 5-star base, double grey casters, fabric seat, tall mesh back on side uprights, flat armrests) at (cx, cz) in the local space of `g`. Faces -Z. */
  function officeChair(g: THREE.Object3D, cx: number, cz: number): void {
    const R = 0.3;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      const ex = cx + Math.cos(a) * R, ez = cz + Math.sin(a) * R;
      // flat wide leg, hub -> rim, resting just above the casters
      rbox(R, 0.035, 0.065, cx + Math.cos(a) * R * 0.5, 0.075, cz + Math.sin(a) * R * 0.5, mat.black, -a, g);
      // caster fork + double wheel
      cyl(0.016, 0.016, 0.06, ex, 0.04, ez, mat.black, g, 8);
      const cg = new THREE.Group();
      cg.position.set(ex, 0, ez);
      cg.rotation.y = -a + 0.5;
      g.add(cg);
      for (const sz of [-0.014, 0.014]) {
        const w = cyl(0.032, 0.032, 0.012, 0, 0, sz, mat.lightgrey, cg, 10);
        w.rotation.x = Math.PI / 2;
        w.position.y = 0.032;
      }
    }
    cyl(0.055, 0.045, 0.09, cx, 0.09, cz, mat.black, g, 10); // hub
    cyl(0.042, 0.042, 0.22, cx, 0.17, cz, mat.black, g, 10); // gas lift cover
    const lever = cyl(0.018, 0.018, 0.05, cx + 0.04, 0, cz - 0.01, mat.dark, g, 8); // height lever
    lever.rotation.x = Math.PI / 2;
    lever.position.y = 0.3;
    rbox(0.34, 0.05, 0.3, cx, 0.4, cz, mat.black, 0, g); // mechanism
    // seat: thick fabric cushion, rounded front
    rbox(0.5, 0.08, 0.46, cx, 0.45, cz, mat.black, 0, g);
    const roll = cyl(0.04, 0.04, 0.5, cx, 0, cz - 0.23, mat.black, g, 8);
    roll.rotation.z = Math.PI / 2;
    roll.position.y = 0.49;
    // two uprights from the seat sides carry the backrest
    for (const sx of [-1, 1]) {
      const ux = cx + sx * 0.21;
      chairRod(g, [ux, 0.42, cz + 0.2], [ux, 0.66, cz + 0.29], 0.02, mat.black);
    }
    // tall mesh backrest leaning back
    const back = new THREE.Group();
    back.position.set(cx, 0.58, cz + 0.28);
    back.rotation.x = 0.14;
    g.add(back);
    rbox(0.48, 0.6, 0.025, 0, 0, 0, mat.black, 0, back); // frame
    rbox(0.4, 0.5, 0.03, 0, 0.05, -0.003, mat.dark, 0, back); // mesh
    // flat armrests: post behind the seat's mid-point + wide flat pad reaching forward
    for (const sx of [-1, 1]) {
      const ax = cx + sx * 0.285;
      rbox(0.04, 0.22, 0.07, ax, 0.44, cz + 0.12, mat.black, 0, g);
      rbox(0.075, 0.03, 0.32, ax, 0.66, cz + 0.02, mat.black, 0, g);
    }
  }
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
    // Apple Magic Keyboard (silver aluminium, white keys in rows) + Magic Mouse (white, low, glossy top)
    const top = 0.752; // just above the desk surface (0.75) so the coplanar faces don't z-fight
    const kz = 0.12;
    rbox(0.28, 0.01, 0.115, 0, top, kz, mat.steel, 0, g);
    rbox(0.262, 0.005, 0.098, 0, top + 0.01, kz, mat.white, 0, g);
    for (let r = 1; r < 6; r++) rbox(0.262, 0.0015, 0.003, 0, top + 0.0145, kz - 0.049 + (r * 0.098) / 6, mat.lightgrey, 0, g);
    rbox(0.057, 0.014, 0.113, 0.27, top, 0.12, mat.white, 0, g);
    officeChair(g, 0, 0.75);
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
    deskSpecs.push({ id: uniqueId(at('desk', x, z)), x: gx(x), z: gz(z), rot, white: !!o.white, w: o.w ?? 1.6, stand: !!o.stand });
  }
  /** Open shelf unit (white boards): w along local X. */
  function shelf(x: number, z: number, w: number, h: number, d = 0.4, rot = 0, fill = true): void {
    item('shelf', at('shelf', x, z), 'Regal', () => shelfParts(x, z, w, h, d, rot, fill));
  }
  function shelfParts(x: number, z: number, w: number, h: number, d = 0.4, rot = 0, fill = true): void {
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
  function plant(x: number, z: number, h = 1.6, base = 0, spiky = false, lim: { x0?: number; x1?: number; z0?: number; z1?: number } = {}): void {
    item('plant', at('plant', x, z), 'Pflanze', () => plantParts(x, z, h, base, spiky, lim));
  }
  function plantParts(x: number, z: number, h = 1.6, base = 0, spiky = false, lim: { x0?: number; x1?: number; z0?: number; z1?: number } = {}): void {
    // keep the foliage inside the walls: default = inner faces of the exterior walls, `lim` adds nearer partitions
    const pad = spiky ? 0.15 : 0.33;
    const cl = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo + pad), hi - pad);
    const bx0 = lim.x0 ?? B.x0 + 0.15;
    const bx1 = lim.x1 ?? B.x1 - 0.15;
    const bz0 = lim.z0 ?? B.z0 + 0.15;
    const bz1 = lim.z1 ?? B.z1 - 0.15;
    cyl(0.2, 0.15, 0.32, x, base, z, spiky ? mat.terracotta : mat.pot);
    cyl(0.03, 0.03, h * 0.5, x, base + 0.3, z, mat.woodDark, world, 6);
    const n = spiky ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const a = i * 2.4;
      const r = spiky ? 0.25 : 0.22 + (i % 3) * 0.08;
      const s = new THREE.Mesh(spiky ? new THREE.ConeGeometry(0.09, h * 0.6, 5) : new THREE.SphereGeometry(0.24 + (i % 2) * 0.08, 8, 6), i % 2 ? mat.green : mat.greenL);
      s.position.set(gx(cl(x + Math.cos(a) * r, bx0, bx1)), base + h * (spiky ? 0.75 : 0.5 + i * 0.09), gz(cl(z + Math.sin(a) * r, bz0, bz1)));
      if (spiky) {
        s.rotation.z = Math.cos(a) * -0.5;
        s.rotation.x = Math.sin(a) * 0.5;
      }
      world.add(s);
    }
  }
  function pendant(x: number, z: number, type: 'steel' | 'black' | 'cage' = 'steel', bottom = 2.0, ceil = 3.6): void {
    item('pendant', at('pendant', x, z), 'Hängelampe', () => pendantParts(x, z, type, bottom, ceil));
  }
  function pendantParts(x: number, z: number, type: 'steel' | 'black' | 'cage' = 'steel', bottom = 2.0, ceil = 3.6): void {
    cyl(0.008, 0.008, EXACT ? ceil - bottom - 0.3 : Math.min(ceil - bottom - 0.3, 0.8), x, bottom + 0.3, z, mat.black, world, 4);
    if (type === 'steel') cyl(0.06, 0.2, 0.3, x, bottom, z, mat.steel);
    if (type === 'black') cyl(0.05, 0.28, 0.3, x, bottom, z, mat.black);
    if (type === 'cage') cyl(0.06, 0.17, 0.3, x, bottom, z, mat.cage);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat.lampWarm);
    bulb.position.set(gx(x), bottom + 0.05, gz(z));
    world.add(bulb);
  }
  /**
   * Freestanding coat stand, as in the office: heavy round base, slim pole, a ring of short hook arms near the top
   * (alternating in height). The coats on the hooks come and go with the people (see `CoatRacks`), so only the
   * hooks are recorded here.
   */
  function coatRack(x: number, z: number): void {
    item('coat-rack', at('coat-rack', x, z), 'Garderobe', () => coatRackParts(x, z));
  }
  function coatRackParts(x: number, z: number): void {
    const g = new THREE.Group();
    g.position.set(gx(x), 0, gz(z));
    world.add(g);
    cyl(0.25, 0.26, 0.035, 0, 0, 0, mat.black, g, 24);
    cyl(0.05, 0.2, 0.03, 0, 0.035, 0, mat.black, g, 24);
    cyl(0.02, 0.02, STAND_H, 0, 0, 0, mat.black, g, 8);
    cyl(0.03, 0.03, 0.03, 0, STAND_H, 0, mat.black, g, 8); // cap
    const spec: CoatRackSpec = { draft: draftStack[draftStack.length - 1], group: g, pegs: [] };
    for (let i = 0; i < HOOKS; i++) {
      const a = (i / HOOKS) * Math.PI * 2 + 0.4;
      const y = STAND_H - (i % 2 ? 0.22 : 0.08);
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      // arm: out of the pole, then curving up into a knob
      chairRod(g, [0, y - 0.05, 0], [dx * 0.09, y - 0.03, dz * 0.09], 0.011, mat.black);
      chairRod(g, [dx * 0.09, y - 0.03, dz * 0.09], [dx * 0.13, y + 0.03, dz * 0.13], 0.011, mat.black);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), mat.black);
      knob.position.set(dx * 0.13, y + 0.035, dz * 0.13);
      g.add(knob);
      spec.pegs.push({ at: new THREE.Vector3(dx * 0.11, y, dz * 0.11), yaw: a });
    }
    rackSpecs.push(spec);
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
      rowLabels.add(sp);
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
      rowLabels.add(sp);
    }
    xs.forEach((x) => desk(x, z, chairSide > 0 ? 0 : Math.PI, o));
  }

  /* =================================================================
     EXTERIOR WALLS (only the two cutaway back edges + the west window end)
  ================================================================= */
  wall(B.x0, B.z0, B.x1, B.z0, H_CORE, [], { t: 0.3, outer: true }); // core-side long wall
  windowWall(B.x0, B.z0, B.x0, B.z1); // west end: Wassermelonen windows
  // corner posts: the 0.3 m walls meet on their centre lines, which leaves a 0.15 m notch on the outside of every corner
  const corner = (x: number, z: number, h: number): void => void rbox(0.3, h, 0.3, ax(x), 0, az(z), mat.wall);
  corner(B.x0, B.z0, H_CORE);
  if (EXACT) {
    corner(B.x1, B.z0, H_CORE);
    corner(B.x1, B.z1, H_LOW);
    windowWall(B.x1, B.z0, B.x1, B.z1); // east end windows
    wall(B.x0, B.z1, 7.5, B.z1, H_LOW, [{ a: -6.7, b: -5.6, door: -1 }, { a: -4.3, b: -2.3 }], { t: 0.3, outer: true }); // solid part, 2 m double doorway (the two wings are dynamic, see `entrance`)
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
  wall(-5, CZ, 26.06, CZ, H_CORE, [
    { a: -3.0, b: -2.0, door: 1 }, // storage door
    { a: 2.5, b: 3.4, door: 1 }, // door under "RISCHE"
    { a: 4.9, b: 5.8, door: 1 }, // kitchen/dining door
    { a: 6.2, b: 9.5, top: 1.64, fill: 'glass', flush: true, solidAbove: true, grow: 0.04 }, // glazed panel into dining: glass up to the bottom of the lettering (Y0), solid wall behind the text above
    { a: 14.4, b: 15.3, door: 1 }, // "Archiv"
    { a: 18.56, b: 23, top: 2.5 }, // dark room, black curtain (jamb flush with the east face of the x=18.5 wall)
    { a: 23.25, b: 24.25, top: 2.2, fill: 'glass', door: -1 }, // booth glass door, opens outwards (into the hallway)
    { a: 24.56, b: 26.06, top: 2.5 }, // east of the booth: second curtain opening (west jamb flush with the booth's east wall, runs on to the east curtain)
  ]);
  for (const x of [0, 4, 10.5]) wall(x, B.z0, x, CZ, H_CORE);
  wall(18.5, B.z0, 18.5, CZ + 0.06, H_CORE); // west wall of the photo studio: runs to the south face of the hallway wall (flush)
  wall(23, -2.2 - 0.06, 23, CZ + 0.06, H_CORE); // east of the dark room: only the booth vestibule part remains; runs to the south face of the hallway wall (flush, the half beside the curtain opening would otherwise end on the wall centre line)
  // no wall at x=26 any more: the studio's east side is the black curtain only (see 'Vorhang Ost')
  wall(23 - 0.06, -2.2, 24.5 + 0.06, -2.2, H_CORE); // photo booth (x 23..24.5): back wall, runs to the outer faces of the side walls (flush corners)
  wall(24.5, -2.2 - 0.06, 24.5, CZ + 0.06, H_CORE); // photo booth: east wall, runs to the outer face of the back wall and the south face of the hallway wall
  // big wall lettering in the corporate font (Apercu): it starts low enough to run over the closed door and the
  // glazed panel; over open doorways the part below the door head (OPEN_TOP) is masked out
  {
    const text = 'FRISCHE IDEEN, DIE WIRKEN';
    const X0 = 0.3;
    const X1 = 15.5;
    const W = ax(X1) - ax(X0); // plan-scaled span of the lettering
    const Hh = 0.95;
    const FLOAT = 0.065; // lettering sits directly on the wall face (half-thickness 0.06 + 5 mm), no visible gap
    const Y0 = 1.64; // bottom of the plane: the baseline sits at ~1.78 m, the middle of the capitals at 2.1 m = top of the glazed panel
    const OPEN_TOP = 2.1; // head of an open doorway
    // doors under the lettering: it is masked out of the wall there and drawn onto the door leaf instead.
    // Use the real door rigs (doors keep their size when the plan is scaled, so the mask must too).
    const lettered = doors.filter((rig) => Math.abs(rig.center.z - az(CZ)) < 0.01 && rig.center.x > ax(X0) && rig.center.x < ax(X1) && rig.height > Y0 + 0.02);
    const pxPerM = 4096 / 15.2;
    const FONT = '700 250px Apercu, "Helvetica Neue", Helvetica, Arial, sans-serif';
    const draw = (g: CanvasRenderingContext2D, w: number, h: number) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = '#0d0d0f';
      g.textBaseline = 'alphabetic';
      g.font = FONT;
      const w0 = [...text].map((ch) => g.measureText(ch).width).reduce((a, b) => a + b, 0);
      // grow the font until the letter spacing is tight (~0.02em), but keep the capitals inside the canvas
      const size = Math.min(320, (250 * (w - 20)) / (w0 + 0.02 * 250 * (text.length - 1)));
      g.font = FONT.replace('250px', `${size}px`);
      const widths = [...text].map((ch) => g.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      const track = (w - 20 - total) / (text.length - 1);
      let x = 10;
      [...text].forEach((ch, i) => {
        g.fillText(ch, x, 232);
        x += widths[i] + track;
      });
      const maskH = ((Y0 + Hh - OPEN_TOP) / Hh) * h; // canvas y of OPEN_TOP
      for (const rig of lettered) g.clearRect(((rig.center.x - rig.width / 2 - ax(X0)) / W) * w, maskH, (rig.width / W) * w, h - maskH);
    };
    const tex = canvasTex(Math.round(W * pxPerM), 256, draw);
    const leafTex: THREE.Texture[] = [];
    for (const rig of lettered) {
      const lt = tex.clone();
      lt.repeat.set(rig.width / W, (rig.height - Y0) / Hh);
      lt.offset.set((rig.center.x - rig.width / 2 - ax(X0)) / W, 0);
      leafTex.push(lt);
      const lh = rig.height - Y0;
      const part = new THREE.Mesh(new THREE.PlaneGeometry(rig.width, lh), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      part.position.set(rig.width / 2, Y0 + lh / 2, FLOAT); // door leaf is as thick as the wall (0.12), so its face is flush with the wall face
      rig.pivot.add(part);
    }
    document.fonts?.load(FONT).then(() => {
      const c = tex.image as HTMLCanvasElement;
      draw(c.getContext('2d')!, c.width, c.height);
      tex.needsUpdate = true;
      for (const t of leafTex) t.needsUpdate = true;
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); // polygon offset pulls it towards the camera: no z-fighting flicker with the wall
    m.position.set(ax(X0) + W / 2, Y0 + Hh / 2, az(CZ) + FLOAT); // flush on the wall face, same plane as the lettering on the door leaves
    m.userData.nonav = true;
    m.renderOrder = 2; // after the transparent glass so the lettering is never cut by it
    world.add(m);
  }
  // storage / craft room (room 3, from the photos): black rubber floor, long black work desk along the west wall,
  // pegboards + paper rolls on the north wall, vacuum + cartons, small glass-top table on the east wall, tidy bags by the door
  {
    const XW = -4.93; // inner face west
    const XE = -0.07; // inner face east
    const ZN = -5.44; // inner face north
    const ZS = CZ - 0.07; // inner face south
    const rubber = L(0x1a1a1c);
    const tabletop = L(0x24242a);
    const matGrey = L(0x8f9496);
    const matGreen = L(0x3d5a4a);
    const blue = L(0x3f6fa8);
    const bagWhite = L(0xeceae2);
    const paper = [L(0xd88a9c), L(0x7fb8a0), L(0xe3c76a), L(0xa99ad0), L(0xf0ede4)];
    slab(XW, XE, ZN, ZS, 0.005, 0.025, rubber);
    item('craft-light', 'craft-light', 'Neonleuchte Lager', () => box(0.1, 0.06, 2.4, -3.9, 3.2, -3.3, new THREE.MeshBasicMaterial({ color: 0xf2f8ff })));

    // work desk, west wall: 0.65 deep, black top on black panels
    const DX = XW + 0.33;
    const DZ0 = ZN + 0.02;
    const DZ1 = -1.95;
    const DL = DZ1 - DZ0;
    const DZ = (DZ0 + DZ1) / 2;
    item('craft-desk', 'craft-desk', 'Werktisch', () => {
      box(0.66, 0.04, DL, DX, 0.74, DZ, tabletop);
      box(0.04, 0.74, DL - 0.1, XW + 0.05, 0, DZ, mat.black); // back panel
      box(0.04, 0.74, 0.5, XW + 0.6, 0, DZ1 - 0.05, mat.black); // front legs
      box(0.04, 0.74, 0.5, XW + 0.6, 0, DZ0 + 0.1, mat.black);
      box(0.6, 0.03, DL - 0.1, DX, 0.2, DZ, mat.black); // low shelf
    });
    item('craft-tools', 'craft-tools', 'Schneidematten + Werkzeug', () => {
      box(0.55, 0.012, 0.8, DX, 0.78, -3.7, matGrey); // cutting mat
      box(0.5, 0.012, 0.5, DX, 0.78, -4.5, matGreen);
      box(0.62, 0.07, 0.62, DX, 0.78, -2.18, mat.grey); // paper guillotine
      box(0.5, 0.012, 0.5, DX, 0.85, -2.18, blue);
      cyl(0.02, 0.02, 0.62, DX - 0.28, 0.9, -2.18, mat.steel); // guillotine arm (stand-in for the bar)
      box(0.28, 0.03, 0.06, DX, 0.78, -3.1, mat.dark); // stapler
      cyl(0.05, 0.05, 0.12, DX - 0.15, 0.78, -5.2, mat.steel); // pen cup
      box(0.3, 0.1, 0.25, DX - 0.05, 0.78, -5.05, mat.cardboard); // small parcel
      box(0.3, 0.12, 0.2, DX, 0.78, -4.9, L(0xf2c43a)); // yellow crate
    });
    item('craft-bags', 'craft-bags', 'Papiertüten-Stapel', () => {
      for (let i = 0; i < 6; i++) box(0.34, 0.035, 0.46, DX - 0.02 + (i % 2) * 0.01, 0.78 + i * 0.035, -2.75, mat.ply, 0.05 * i);
    });
    item('craft-baskets', 'craft-baskets', 'Drahtkörbe + Kartons', () => {
      box(0.42, 0.34, 0.5, DX + 0.02, 0.22, -2.8, mat.lightgrey);
      box(0.4, 0.3, 0.5, DX + 0.02, 0.22, -3.5, mat.lightgrey);
      box(0.5, 0.25, 0.55, DX + 0.02, 0.22, -4.2, mat.cardboard);
      box(0.45, 0.3, 0.45, DX, 0, -4.9, mat.terracotta); // plant pot under the desk
    });

    // north wall: two pegboards + paper roll bucket at the west corner
    item('craft-pegboards', 'craft-pegboards', 'Lochwände', () => {
      for (const px of [-3.55, -2.3]) {
        box(0.9, 0.7, 0.02, px, 1.3, ZN + 0.02, mat.white);
        box(0.18, 0.03, 0.1, px - 0.2, 1.7, ZN + 0.08, mat.white);
        box(0.2, 0.03, 0.1, px + 0.15, 1.5, ZN + 0.08, mat.white);
        box(0.12, 0.1, 0.08, px - 0.15, 1.4, ZN + 0.07, mat.cardboard);
      }
      box(0.9, 0.7, 0.02, XW + 0.03, 1.3, -4.2, mat.white, Math.PI / 2); // third board over the desk (west wall)
    });
    item('craft-rolls', 'craft-rolls', 'Papierrollen', () => {
      cyl(0.14, 0.14, 0.5, -4.55, 0.04, ZN + 0.25, mat.steel);
      paper.forEach((m, i) => cyl(0.03, 0.03, 0.9 + (i % 3) * 0.1, -4.62 + i * 0.05, 0.5, ZN + 0.22 + (i % 2) * 0.05, m, world, 10));
    });

    // north-east: vacuum cleaner, tall carton, flat cartons on the glass-top table
    item('craft-vacuum', 'craft-vacuum', 'Staubsauger + Karton', () => {
      box(0.6, 0.8, 0.45, -3.1, 0, ZN + 0.3, mat.cardboard);
      box(0.52, 0.25, 0.4, -2.35, 0, ZN + 0.4, mat.white);
      cyl(0.12, 0.12, 0.05, -2.35, 0.25, ZN + 0.4, mat.terracotta);
      cyl(0.015, 0.015, 0.9, -2.5, 0.3, ZN + 0.25, mat.dark);
    });
    item('craft-sidetable', 'craft-sidetable', 'Glastisch', () => {
      const tx = XE - 0.4;
      box(0.7, 0.03, 1.5, tx, 0.74, -4.2, L(0xcfe3dc));
      for (const dz of [-0.7, 0.7]) for (const dx of [-0.3, 0.3]) box(0.04, 0.74, 0.04, tx + dx, 0, -4.2 + dz, mat.black);
      box(0.5, 0.12, 0.4, tx, 0.77, -4.6, mat.cardboard);
      box(0.5, 0.12, 0.4, tx, 0.89, -4.6, mat.cardboard, 0.15);
      box(0.4, 0.1, 0.3, tx, 0.77, -3.8, mat.cardboard);
    });

    // by the door: a few tidy bags and flat cartons
    item('craft-bags-floor', 'craft-bags-floor', 'Säcke', () => {
      for (const [x, z, h] of [[XE - 0.4, -2.0, 0.85], [XE - 0.4, -2.6, 0.7], [XE - 1.0, -2.2, 0.55]] as const) {
        cyl(0.26, 0.3, h, x, 0.005, z, bagWhite);
        cyl(0.1, 0.18, 0.15, x, h, z, bagWhite);
      }
      box(0.7, 0.04, 0.5, XE - 1.6, 0, -1.9, mat.cardboard);
    });
  }
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
    kitchenCenter.x = gx(5.5);
    kitchenCenter.z = gz(-2.8);
    track(kitchenCenter);
    // the espresso machine and the two spots in front of it where one fetches a coffee
    kitchenMachine.x = gx(4.42);
    kitchenMachine.z = gz(-2.4);
    track(kitchenMachine);
    [-2.0, -2.8].forEach((z, i) => {
      kitchenStands[i].x = gx(5.1);
      kitchenStands[i].z = gz(z);
      track(kitchenStands[i]);
    });
  }, 'Küchenzeile');
  within(8.57, -3.6, () => {
    // table runs from x 6.7 all the way to the east wall (inner face ~10.45)
    const TX = 8.57;
    const TL = 3.74;
    const LX = TL / 2 - 0.1; // leg offset from centre
    box(TL, 0.05, 0.9, TX, 0.72, -3.6, mat.black);
    for (const sx of [-LX, LX]) for (const sz of [-0.38, 0.38]) box(0.07, 0.72, 0.07, TX + sx, 0, -3.6 + sz, mat.lightgrey);
    for (const sz of [-0.85, 0.85]) {
      box(TL, 0.05, 0.35, TX, 0.42, -3.6 + sz, mat.black);
      for (const sx of [-LX, LX]) box(0.07, 0.42, 0.3, TX + sx, 0, -3.6 + sz, mat.lightgrey);
    }
    for (const x of [7.3, 8.57, 9.85]) pendant(x, -3.6, 'black', 1.55, 2.9);
    // sitting spots on both benches, facing the table (game coordinates)
    const mid = { x: gx(TX), z: gz(-3.6) };
    for (const sz of [-0.85, 0.85]) {
      for (const x of [7.5, 8.57, 9.65]) {
        const seat = track({ x: gx(x), z: gz(-3.6 + sz), yaw: 0 });
        seat.yaw = Math.atan2(mid.x - seat.x, mid.z - seat.z);
        tableSeats.push(seat);
      }
    }
  }, 'Esstisch');
  within(7.6, 0, () => {
    for (const x of [7.2, 8.0]) {
      cyl(0.17, 0.17, 0.05, x, 0.7, -1.55, mat.white);
      cyl(0.025, 0.025, 0.7, x, 0, -1.55, mat.steel, world, 8);
    }
    box(2.6, 0.05, 0.35, 7.8, 1.0, -1.25, mat.white);
  }, 'Stehbar');
  // washroom (x 0..4, left of the kitchen): purple walls, black floor, trough sink with mirror on the south wall next to the door, shower + 3 colored WC cabins on the north wall
  {
    const purple = L(0x3b1f5e);
    const floor = L(0x141416);
    const tile = L(0x4a4d52);
    const mirror = L(0xcfe3ea);
    const lightStrip = new THREE.MeshBasicMaterial({ color: 0xeaf6ff });
    const frame = L(0xf3f1ec);
    const cabinColors = [0xeceae6, 0xe8631a, 0xf2b61e, 0xe8506a]; // shower (white tiles), orange WC, yellow WC, pink pissoir
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
    for (const x of [SX - 0.8, SX - 0.45, SX + 0.8]) plant(x, CZ - 0.14, 0.45, 1.18, true, { z1: Z_S, x0: X_W, x1: X_E });
    for (const z of [-2.0, -2.3]) box(0.04, 0.42, 0.22, X_W + 0.03, 1.1, z, mat.fabric);
    box(0.3, 0.3, 0.3, 0.4, 0, -2.7, mat.dark); // bin

    // cabins along the north wall, doors facing south (from the photos): shower, orange WC, yellow WC, pink pissoir
    const mosaicTex = canvasTex(32, 32, (g, w, h) => {
      g.fillStyle = '#30343a';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#17181b';
      g.fillRect(w - 2, 0, 2, h);
      g.fillRect(0, h - 2, w, 2);
    });
    const mosaic = (rx: number, ry: number): THREE.MeshLambertMaterial => {
      const t = mosaicTex.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return new THREE.MeshLambertMaterial({ map: t });
    };
    const darkTile = mosaic(16, 21); // wall block behind the fixtures
    const showerFloor = mosaic(17, 24);
    const lightTile = L(0xd2d4d2);
    const whiteTile = L(0xeceae6);
    const spot = new THREE.MeshBasicMaterial({ color: 0xfff6dc });
    const spray = L(0xd8344a);
    for (let i = 0; i < 4; i++) {
      const x0 = edges[i];
      const x1 = edges[i + 1];
      const xm = (x0 + x1) / 2;
      const xL = x0 + 0.075; // inner faces of the side walls
      const xR = x1 - 0.075;
      const iw = xR - xL;
      const shower = i === 0;
      const col = shower ? whiteTile : L(cabinColors[i]);
      const lower = shower ? whiteTile : lightTile;
      const dep = ZF - Z_N;
      const cz = (ZF + Z_N) / 2;
      // colored upper part + tiled lower part (inside)
      box(0.03, H_CORE - 1.05, dep, x0 + 0.06, 1.05, cz, col);
      box(0.03, H_CORE - 1.05, dep, x1 - 0.06, 1.05, cz, col);
      box(x1 - x0 - 0.12, H_CORE - 1.05, 0.03, xm, 1.05, Z_N + 0.03, col);
      box(0.03, 1.05, dep, x0 + 0.06, 0, cz, lower);
      box(0.03, 1.05, dep, x1 - 0.06, 0, cz, lower);
      box(x1 - x0 - 0.12, 1.05, 0.03, xm, 0, Z_N + 0.03, lower);
      if (shower) {
        // low ceiling only on the shower (dark purple); WC cabins are open at the top
        box(x1 - x0 - 0.1, 0.05, dep, xm, 2.5, cz, purple);
        box(0.22, 0.02, 0.22, xm, 2.485, Z_N + 0.35, mat.white); // vent
        box(0.1, 0.02, 0.1, xm, 2.485, cz + 0.2, spot); // ceiling spot
      }
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

      if (shower) {
        // white tiles, dark mosaic floor, raised tray at the back, curtain on the right, rain head, niche, towel rail
        box(iw, 0.01, dep - 0.06, xm, 0.03, cz + 0.03, showerFloor);
        const trayD = 0.55;
        box(iw - 0.04, 0.16, trayD, xm, 0.03, Z_N + 0.03 + trayD / 2, mat.white);
        box(iw - 0.04, 0.16, 0.04, xm, 0.03, Z_N + 0.03 + trayD + 0.02, darkTile);
        cyl(0.045, 0.045, 0.01, xm, 0.19, Z_N + 0.3, mat.steel);
        cyl(0.01, 0.01, 0.6, xm + 0.2, 1.35, Z_N + 0.06, mat.steel); // slide bar
        cyl(0.07, 0.07, 0.03, xm + 0.2, 1.9, Z_N + 0.12, mat.steel); // hand shower head
        box(0.1, 0.1, 0.03, xm, 1.05, Z_N + 0.05, mat.dark); // mixer
        box(0.2, 0.2, 0.02, xm - 0.2, 1.25, Z_N + 0.045, mat.black); // niche
        for (const [dx, h, c] of [[-0.27, 0.12, 0xd8c23a], [-0.2, 0.15, 0xeeeeee], [-0.13, 0.1, 0x6aa84f]] as const) box(0.045, h, 0.045, xm + dx, 1.17, Z_N + 0.06, L(c));
        box(0.02, 0.02, 0.8, xR - 0.04, 2.0, Z_N + 0.43, mat.steel); // curtain rod
        box(0.02, 1.75, 0.65, xR - 0.05, 0.2, Z_N + 0.43, mat.white); // curtain
        box(0.02, 0.02, 0.4, xR - 0.03, 1.2, Z_N + 0.95, mat.steel); // towel rail
        box(0.02, 0.5, 0.16, xR - 0.04, 0.7, Z_N + 0.95, mat.fabric); // towel
        continue;
      }

      // WC + pissoir: dark mosaic block along the back wall with the fixture in front of it
      box(iw - 0.02, 1.05, 0.2, xm, 0, Z_N + 0.13, darkTile);
      if (i === 3) {
        cyl(0.12, 0.12, 0.4, xm, 0, Z_N + 0.33, mat.black, world, 10); // pedestal
        box(0.28, 0.5, 0.2, xm, 0.4, Z_N + 0.33, mat.white); // urinal
        box(0.16, 0.3, 0.02, xm, 0.5, Z_N + 0.44, mat.lightgrey); // bowl recess
        box(0.12, 0.06, 0.04, xL + 0.1, 0.9, Z_N + 0.3, mat.steel); // flush button
      } else {
        box(0.22, 0.14, 0.02, xm, 0.75, Z_N + 0.24, mat.white); // flush plate
        for (const dx of [-0.05, 0.05]) box(0.07, 0.04, 0.005, xm + dx, 0.8, Z_N + 0.255, mat.lightgrey);
        box(0.34, 0.3, 0.45, xm, 0.38, Z_N + 0.46, mat.white); // wall-hung bowl
        box(0.2, 0.01, 0.28, xm, 0.685, Z_N + 0.47, mat.grey); // opening
        box(0.32, 0.4, 0.03, xm, 0.68, Z_N + 0.28, mat.white); // lid, up
        for (const dx of [-0.22, -0.14]) cyl(0.05, 0.05, 0.1, xm + dx, 1.05, Z_N + 0.12, mat.white); // paper rolls
        cyl(0.03, 0.03, 0.2, xm + 0.15, 1.05, Z_N + 0.1, spray);
        cyl(0.1, 0.09, 0.3, xL + 0.12, 0, Z_N + 0.7, mat.steel); // pedal bin
        cyl(0.025, 0.025, 0.4, xR - 0.08, 0, Z_N + 0.55, mat.black, world, 8); // brush
        if (i === 2) for (const dx of [0.05, 0.1]) cyl(0.018, 0.018, 1.45, xR - dx, 1.05, Z_N + 0.06, col, world, 8); // yellow pipes
      }
    }
  }
  /* ---------- archive / printer + server room (from the photos) ----------
     inner faces: x 10.56 .. 18.44, z -5.44 (north, glass blocks) .. -1.06 (south, door at x 14.4-15.3).
     north wall: bottle rack, tall fridge, three steel shelf units, server rack; east wall: copier, black board, AC;
     west wall: supply shelves; south wall: cupboard with crates, stepladder, bar stools, paper shelf. */
  const rnd = (n: number): number => {
    const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const aMat = {
    carton: L(0xb89468),
    cartonDark: L(0x9c7a4e),
    bin: L(0x9aa3ab),
    binDark: L(0x2b2d30),
    orange: L(0xe8742a),
    blue: L(0x1f4fa8),
    red: L(0xc23a2e),
    yellow: L(0xe8cf2a),
    purple: L(0x5a2a86),
    green: L(0x3f8a3a),
    boardBlack: L(0x0e0e10),
    box: [L(0xd9d2c3), L(0xb89468), L(0xe9e6df), L(0x8a6a44)],
    goods: [L(0x6aa84f), L(0xd9a441), L(0xc23a2e), L(0x3f6fb5), L(0xeee6c8), L(0x5b8f6b)],
  };
  type ShelfKind = 'bins' | 'archive' | 'drawers' | 'supplies';
  /** Steel shelf unit. axis 'x': runs along x against the north wall; 'z': runs along z against the west wall. */
  const shelfUnit = (cx: number, cz: number, len: number, h: number, dep: number, axis: 'x' | 'z', kind: ShelfKind, seed: number, frame: Mat = mat.grey): void => {
    const B3 = (u: number, y: number, v: number, lu: number, hh: number, dv: number, m: Mat) =>
      axis === 'x' ? box(lu, hh, dv, cx + u, y, cz + v, m) : box(dv, hh, lu, cx + v, y, cz + u, m);
    for (const u of [-len / 2 + 0.02, len / 2 - 0.02]) for (const v of [-dep / 2 + 0.02, dep / 2 - 0.02]) B3(u, 0, v, 0.04, h, 0.04, frame);
    const levels = 4;
    for (let l = 0; l < levels; l++) B3(0, 0.05 + l * 0.5, 0, len - 0.04, 0.03, dep, frame);
    B3(0, h - 0.03, 0, len - 0.04, 0.03, dep, frame);
    for (let l = 0; l <= levels; l++) {
      const y = l < levels ? 0.08 + l * 0.5 : h;
      const n = 2 + Math.floor(rnd(seed + l) * 2);
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + ((i + 0.5) * (len - 0.1)) / n + 0.05;
        const r = rnd(seed * 3 + l * 7 + i);
        const cw = (len - 0.14) / n - 0.04;
        if (kind === 'bins') {
          B3(u, y, 0, cw, 0.22 + (l === levels ? 0.08 : 0), dep - 0.12, aMat.bin);
          if (r > 0.5 && l < levels) B3(u, y + 0.22, 0, cw * 0.95, 0.2, dep - 0.14, aMat.bin);
        } else if (kind === 'archive') {
          B3(u, y, 0, cw, 0.18 + r * 0.2, dep - 0.1, aMat.box[Math.floor(r * 4) % 4]);
        } else if (kind === 'supplies') {
          const m = aMat.goods[Math.floor(r * 6) % 6];
          B3(u, y, 0.02, cw * 0.9, 0.2 + r * 0.2, dep - 0.16, m);
          B3(u - cw * 0.3, y, -0.08, 0.08, 0.3, 0.08, aMat.goods[(Math.floor(r * 6) + 2) % 6]);
        } else {
          B3(u, y, 0, cw, 0.2 + r * 0.15, dep - 0.12, l % 2 ? aMat.carton : mat.plyLight);
        }
      }
    }
    if (kind === 'drawers') B3(0, 1.05 + 0.03, 0, len - 0.3, 0.7, dep - 0.1, mat.plyLight); // wooden mini drawer unit
  };

  // north wall, west to east:
  item('bottle-rack', 'bottle-rack', 'Flaschenregal', () => {
    for (let r = 0; r < 9; r++)
      for (const dx of [-0.17, 0.17]) {
        box(0.33, 0.19, 0.55, 11.0 + dx, 0.02 + r * 0.2, -5.14, mat.white);
        box(0.2, 0.1, 0.03, 11.0 + dx, 0.06 + r * 0.2, -4.85, mat.dark);
      }
  });
  item('fridge-tall', 'fridge-tall', 'Kühlschrank gross', () => {
    box(0.6, 1.6, 0.62, 11.78, 0, -5.12, mat.white);
    box(0.62, 0.012, 0.64, 11.78, 1.07, -5.12, mat.lightgrey); // freezer line
    box(0.02, 0.35, 0.03, 11.5, 1.15, -4.79, mat.steel);
    box(0.02, 0.5, 0.03, 11.5, 0.5, -4.79, mat.steel);
  });
  shelfUnit(12.8, -5.2, 1.3, 2.0, 0.45, 'x', 'archive', 11);
  shelfUnit(14.1, -5.2, 1.3, 2.0, 0.45, 'x', 'drawers', 23);
  shelfUnit(15.4, -5.2, 1.3, 2.0, 0.45, 'x', 'bins', 37);
  item('server-rack', 'server-rack', 'Serverschrank', () => {
    const RX = 16.8;
    const RZ = -5.04;
    const ledG = new THREE.MeshBasicMaterial({ color: 0x3cff7a });
    const ledA = new THREE.MeshBasicMaterial({ color: 0xffb02e });
    for (const dx of [-0.38, 0.38]) for (const dz of [-0.38, 0.38]) box(0.05, 2.0, 0.05, RX + dx, 0, RZ + dz, mat.lightgrey);
    box(0.8, 0.04, 0.8, RX, 0, RZ, mat.lightgrey);
    box(0.8, 0.04, 0.8, RX, 1.96, RZ, mat.lightgrey);
    box(0.72, 1.9, 0.72, RX, 0.04, RZ, mat.dark); // dark interior
    box(0.3, 0.9, 0.12, RX - 0.12, 0.9, RZ + 0.05, aMat.orange); // bundle of orange cables
    for (let i = 0; i < 6; i++) {
      const y = 1.2 + i * 0.12;
      box(0.62, 0.07, 0.4, RX, y, RZ - 0.1, i % 2 ? mat.lightgrey : mat.steel); // patch panels / switches
      box(0.02, 0.02, 0.02, RX + 0.25, y + 0.02, RZ + 0.1, i % 3 === 2 ? ledA : ledG);
    }
    box(0.3, 0.2, 0.3, RX, 0.1, RZ, mat.black); // UPS
    box(0.3, 0.25, 0.3, RX, 0.5, RZ, mat.black); // NAS
    box(0.74, 1.9, 0.02, RX, 0.04, RZ + 0.39, mat.glass); // glass door on the front
    box(0.03, 0.3, 0.03, RX + 0.3, 0.9, RZ + 0.41, mat.black); // lock
  });

  // east wall: copier (the printer), black board, AC
  const PR = { x: 18.0, z: -3.8 };
  const printerStand = { x: ax(17.0), z: az(PR.z), yaw: Math.PI / 2 }; // where people stand, facing the copier
  item('printer', 'printer', 'Drucker', () => {
    const ledG = new THREE.MeshBasicMaterial({ color: 0x3cff7a });
    box(0.75, 0.72, 0.66, PR.x, 0.06, PR.z, mat.white); // body with paper drawers
    box(0.7, 0.06, 0.6, PR.x, 0, PR.z, mat.dark); // plinth
    for (let i = 0; i < 4; i++) box(0.02, 0.025, 0.52, PR.x - 0.38, 0.14 + i * 0.16, PR.z, mat.lightgrey); // drawer fronts
    box(0.7, 0.28, 0.62, PR.x + 0.02, 0.78, PR.z, mat.lightgrey); // finisher / output
    box(0.72, 0.1, 0.62, PR.x, 1.06, PR.z, mat.white); // scanner
    box(0.64, 0.04, 0.5, PR.x, 1.16, PR.z, mat.dark); // document feeder
    box(0.18, 0.04, 0.3, PR.x - 0.28, 1.0, PR.z + 0.1, mat.dark).rotation.z = 0.5; // touch panel
    box(0.3, 0.02, 0.45, PR.x - 0.5, 0.82, PR.z, mat.lightgrey); // bypass tray (open)
    box(0.02, 0.02, 0.02, PR.x - 0.38, 1.0, PR.z - 0.25, ledG);
    track(printerStand);
  });
  item('black-board', 'black-board', 'Schwarze Tafel', () => box(0.03, 1.4, 1.0, 18.41, 0.35, -2.6, aMat.boardBlack));
  item('ac', 'ac', 'Klimagerät', () => {
    box(0.25, 0.28, 1.0, 18.31, 2.2, -3.4, mat.white);
    box(0.12, 0.45, 0.4, 18.38, 1.65, -2.6, mat.white);
  });
  item('boxes-east', 'boxes-east', 'Kartons Ost', () => {
    box(0.55, 0.65, 0.45, 17.15, 0, -2.25, aMat.carton);
    box(0.5, 0.3, 0.4, 17.15, 0.65, -2.25, aMat.cartonDark);
    box(0.5, 0.75, 0.5, 17.1, 0, -1.65, aMat.carton);
    box(0.4, 0.12, 0.3, 17.1, 0.75, -1.65, mat.white); // paper on top
    for (const dz of [0, 0.1, 0.2]) cyl(0.04, 0.04, 0.9, 18.2, 0, -1.8 + dz, mat.white, world, 8); // poster rolls
  });
  item('box-bin', 'box-bin', 'Kiste BOX', () => {
    box(0.6, 0.3, 0.42, 14.85, 0, -4.1, aMat.bin);
    box(0.5, 0.05, 0.34, 14.85, 0.3, -4.1, aMat.binDark);
  });
  item('fridge-small', 'fridge-small', 'Kühlschrank klein', () => {
    box(0.55, 0.85, 0.55, 15.85, 0, -4.2, mat.white);
    box(0.4, 0.01, 0.3, 15.85, 0.85, -4.2, mat.lightgrey);
    box(0.12, 0.1, 0.01, 15.75, 0.5, -3.92, aMat.red);
    box(0.1, 0.1, 0.01, 15.97, 0.3, -3.92, aMat.red);
    box(0.12, 0.17, 0.01, 15.78, 0.7, -3.92, mat.lightgrey);
  });

  // west wall: supply shelves with drinks and food, crates, boxes
  shelfUnit(10.82, -4.1, 1.3, 2.0, 0.5, 'z', 'supplies', 51, mat.steel);
  shelfUnit(10.82, -2.8, 1.3, 2.0, 0.5, 'z', 'supplies', 67, mat.steel);
  item('crates', 'crates', 'Getränkeharassen', () => {
    for (let i = 0; i < 3; i++) box(0.4, 0.28, 0.3, 11.55, i * 0.28, -4.5, i === 2 ? aMat.orange : aMat.red);
    for (let i = 0; i < 2; i++) box(0.4, 0.28, 0.3, 12.0, i * 0.28, -4.45, aMat.orange);
    box(0.4, 0.28, 0.3, 12.0, 0, -4.1, aMat.red);
  });
  item('boxes-west', 'boxes-west', 'Kartons West', () => {
    box(0.55, 0.4, 0.45, 12.3, 0, -3.3, aMat.carton);
    box(0.6, 0.45, 0.5, 12.9, 0, -3.6, aMat.cartonDark);
    box(0.55, 0.3, 0.45, 12.8, 0, -2.9, aMat.carton);
    box(0.5, 0.4, 0.45, 13.6, 0, -4.4, aMat.carton);
  });
  item('household', 'household', 'Vorräte', () => {
    for (let i = 0; i < 3; i++) box(0.3, 0.28, 0.3, 11.3, i * 0.28, -2.0, i % 2 ? aMat.green : mat.white); // toilet paper
    box(0.25, 0.25, 0.2, 11.8, 0, -2.3, aMat.green); // watering can
    box(0.3, 0.45, 0.04, 11.2, 0, -1.5, mat.plyLight); // wooden frame
  });

  // south wall: cupboard + crates, stepladder, bar stools, paper shelf
  item('cupboard', 'cupboard', 'Schrank', () => {
    box(1.0, 0.9, 0.45, 11.2, 0, -1.3, mat.white);
    for (const dx of [-0.05, 0.05]) box(0.02, 0.25, 0.03, 11.2 + dx, 0.5, -1.06, mat.steel);
    box(0.45, 0.2, 0.35, 11.2, 0.9, -1.3, mat.black);
    for (let i = 0; i < 2; i++) box(0.45, 0.2, 0.35, 11.2, 1.1 + i * 0.2, -1.3, aMat.yellow);
    box(0.6, 0.45, 0.45, 11.2, 1.5, -1.3, aMat.red);
    box(0.5, 0.25, 0.4, 11.2, 1.95, -1.3, aMat.orange);
  });
  item('ladder', 'ladder', 'Leiter', () => {
    for (const dz of [-0.16, 0.16]) box(0.03, 1.5, 0.03, 12.2, 0, -1.25 + dz, mat.steel);
    for (let i = 0; i < 5; i++) box(0.03, 0.03, 0.34, 12.2, 0.25 + i * 0.28, -1.25, mat.steel);
  });
  item('stools', 'stools', 'Barhocker', () => {
    for (const [sx, sz] of [[12.55, -1.75], [12.9, -2.05], [13.25, -1.55]]) {
      cyl(0.17, 0.17, 0.02, sx, 0, sz, mat.steel);
      cyl(0.025, 0.025, 0.7, sx, 0, sz, mat.steel, world, 8);
      box(0.36, 0.06, 0.32, sx, 0.7, sz, mat.black);
      box(0.04, 0.06, 0.3, sx - 0.2, 0.7, sz, mat.steel);
    }
  });
  item('paper-shelf', 'paper-shelf', 'Papierregal', () => {
    shelfParts(16.1, -1.3, 1.0, 1.9, 0.4, 0, false);
    for (const [y, m] of [[0.06, mat.white], [0.55, aMat.blue], [1.0, mat.white], [1.45, aMat.blue]] as Array<[number, Mat]>)
      for (let i = 0; i < 3; i++) box(0.28, 0.05 + (i === 1 ? 0.05 : 0), 0.2, 15.8 + i * 0.3, y + 0.03, -1.3, m);
    for (let i = 0; i < 4; i++) box(0.2, 0.12, 0.3, 15.8 + (i % 2) * 0.3, 1.9, -1.3, i < 2 ? mat.white : aMat.purple);
  });
  /** Room 7, the photo studio (x 18.6..25.9, z -5.5..-1): shooting table with sweep + backdrop, softboxes, editing desk, pallet bar, fan, grey screen. */
  function buildPhotoStudio(): void {
    const grp = (x: number, z: number, ry = 0): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(gx(x), 0, gz(z));
      g.rotation.y = ry;
      world.add(g);
      return g;
    };
    const R = (w: number, h: number, d: number, x: number, y: number, z: number, m: Mat, p: THREE.Object3D, ry = 0) => rbox(w, h, d, x, y, z, m, ry, p);
    const paper = L(0xf2f0e9, { side: THREE.DoubleSide });
    const pine = L(0xd8b87a);
    const pineDark = L(0xb98f55);
    const felt = L(0xb4b1aa);
    const NZ = B.z0 + 0.25; // north wall face (the slab stands 0.2 inside)

    // black drape along the north (east part) and east wall: vertical folds
    item('curtain', 'studio-curtain', 'Vorhang Studio', () => {
      for (let i = 0; i < 14; i++) {
        const m = rbox(0.22, 2.7, 0.08, ax(23.05 + i * 0.21), 0, az(B.z0) + 0.28 + (i % 2) * 0.05, i % 2 ? mat.black : mat.dark);
        m.userData.nonav = true;
      }
    });

    // backdrop roll on ceiling hooks, white paper hanging down, green core at the end
    item('backdrop', 'studio-backdrop', 'Hintergrundrolle', () => {
      const g = grp(21.1, -5.2);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 10), L(0x6b5d45));
      rod.rotation.z = Math.PI / 2;
      rod.position.set(0, 2.5, 0);
      g.add(rod);
      const green = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10), L(0x3f9a3a));
      green.rotation.z = Math.PI / 2;
      green.position.set(1.2, 2.5, 0);
      g.add(green);
      for (const x of [-1.1, 1.3]) {
        R(0.04, 0.3, 0.04, x, 2.5, 0, mat.black, g);
        R(0.1, 0.04, 0.1, x, 2.78, 0, mat.black, g);
      }
      R(2.0, 1.0, 0.012, -0.1, 1.55, 0.02, paper, g);
      R(1.1, 0.35, 0.012, 0.0, 1.35, 0.06, paper, g, 0.12).rotation.z = -0.1;
      R(0.7, 0.6, 0.012, 0.5, 1.7, 0.05, paper, g).rotation.x = -0.15;
    });

    // shooting table with curved white sweep
    item('sweep', 'studio-sweep', 'Aufnahmetisch', () => {
      const g = grp(20.9, NZ + 0.05);
      const prof: Array<[number, number]> = [[0, 1.75], [0, 1.2]];
      for (let i = 1; i <= 8; i++) {
        const a = Math.PI + (i / 8) * (Math.PI / 2);
        prof.push([0.45 + 0.45 * Math.cos(a), 1.2 + 0.45 * Math.sin(a)]);
      }
      prof.push([1.0, 0.75], [1.06, 0.7]);
      const pos: number[] = [];
      const idx: number[] = [];
      prof.forEach(([z, y], i) => {
        pos.push(-0.6, y, z, 0.6, y, z);
        if (i) idx.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, paper));
      for (const sx of [-0.57, 0.57]) {
        R(0.03, 0.72, 0.03, sx, 0, 0.98, mat.black, g);
        R(0.03, 0.72, 0.03, sx, 0, 0.12, mat.black, g);
        R(0.03, 0.03, 0.88, sx, 0.7, 0.55, mat.black, g);
      }
      R(1.17, 0.03, 0.03, 0, 0.7, 0.98, mat.black, g);
      R(0.5, 0.005, 0.35, 0.0, 0.76, 0.6, mat.white, g); // sheet on the table
      // light stand with clamp behind the table's front edge
      for (const sx of [-0.7]) {
        R(0.03, 1.0, 0.03, sx, 0, 0.55, mat.black, g);
        R(0.3, 0.03, 0.03, sx + 0.14, 0.95, 0.55, mat.black, g);
      }
    });
    // grey drawer unit with a black bean bag on top
    item('drawer-unit', 'studio-drawers', 'Rollcontainer', () => {
      const g = grp(22.05, NZ + 0.35);
      R(0.46, 0.6, 0.55, 0, 0.04, 0, mat.grey, g);
      for (let i = 0; i < 4; i++) R(0.4, 0.01, 0.01, 0, 0.12 + i * 0.14, 0.28, mat.dark, g);
      R(0.3, 0.12, 0.25, 0, 0.64, 0, mat.black, g);
      for (const [x, z] of [[-0.18, -0.22], [0.18, -0.22], [-0.18, 0.22], [0.18, 0.22]]) R(0.04, 0.04, 0.04, x, 0, z, mat.dark, g);
    });
    // reflector frame leaning on the wall
    item('reflector', 'studio-reflector', 'Reflektor', () => {
      const g = grp(22.8, NZ + 0.12);
      g.rotation.x = -0.1;
      R(0.92, 1.5, 0.02, 0, 0.02, 0, mat.white, g);
      R(0.97, 0.03, 0.04, 0, 0.02, 0, mat.steel, g);
      R(0.97, 0.03, 0.04, 0, 1.49, 0, mat.steel, g);
      for (const sx of [-0.47, 0.47]) R(0.03, 1.5, 0.04, sx, 0.02, 0, mat.steel, g);
    });

    // two softboxes with strobe heads leaning on the west wall + tripod
    const softbox = (id: string, x: number, z: number, ry: number): void => {
      item('softbox', id, 'Softbox', () => {
        const g = grp(x, z, ry);
        g.rotation.x = -0.08;
        R(0.72, 1.5, 0.38, 0, 0.04, 0, mat.black, g);
        R(0.66, 1.42, 0.01, 0, 0.08, 0.195, L(0x0b0b0c), g);
        R(0.16, 0.16, 0.2, 0, 0.75, 0.26, L(0xc9c9c9), g);
        R(0.12, 0.05, 0.1, 0, 0.91, 0.26, aMat.orange, g);
      });
    };
    softbox('studio-softbox-1', 19.15, -5.1, 0.0);
    softbox('studio-softbox-2', 19.4, -4.6, 0.12);
    item('tripod', 'studio-tripod', 'Stativ', () => {
      const g = grp(20.1, -4.5);
      R(0.04, 1.0, 0.04, 0, 0.1, 0, mat.black, g);
      R(0.12, 0.1, 0.1, 0, 1.1, 0, mat.dark, g);
      for (const [x, z] of [[0.3, 0.0], [-0.15, 0.26], [-0.15, -0.26]]) chairRod(g, [0, 0.4, 0], [x, 0.02, z], 0.012, mat.black);
    });

    // editing desk along the west wall: two monitors with hoods, pen tablet, keyboard, headphones, battery charger
    item('photo-desk', 'studio-desk', 'Fotoschreibtisch', () => {
      const g = grp(19.45, -3.0, Math.PI / 2);
      R(2.0, 0.04, 0.8, 0, 0.72, 0, mat.black, g);
      for (const sx of [-0.96, 0.96]) {
        R(0.05, 0.72, 0.05, sx, 0, -0.36, mat.black, g);
        R(0.05, 0.72, 0.05, sx, 0, 0.36, mat.black, g);
      }
      R(1.9, 0.05, 0.03, 0, 0.67, -0.36, mat.black, g);
      for (const mx of [-0.55, 0.2]) {
        R(0.06, 0.22, 0.04, mx, 0.76, -0.27, mat.dark, g);
        R(0.26, 0.015, 0.2, mx, 0.76, -0.27, mat.dark, g);
        R(0.62, 0.38, 0.04, mx, 0.95, -0.25, mat.black, g);
        R(0.56, 0.32, 0.006, mx, 0.98, -0.225, L(0x20262c), g);
        R(0.62, 0.02, 0.2, mx, 1.33, -0.14, mat.dark, g); // hood
        for (const sx of [-0.31, 0.31]) R(0.02, 0.38, 0.2, mx + sx, 0.95, -0.14, mat.dark, g);
      }
      R(0.4, 0.02, 0.27, 0.62, 0.76, 0.0, mat.dark, g).rotation.x = -0.1; // pen tablet
      R(0.28, 0.01, 0.115, -0.1, 0.76, 0.2, mat.steel, g);
      R(0.262, 0.005, 0.098, -0.1, 0.77, 0.2, mat.white, g);
      R(0.06, 0.012, 0.11, 0.1, 0.76, 0.2, mat.white, g); // mouse
      R(0.16, 0.05, 0.1, -0.75, 0.76, 0.18, aMat.yellow, g); // battery charger
      R(0.18, 0.015, 0.12, -0.35, 0.76, 0.3, mat.black, g); // headphones
    });
    const chair = (id: string, x: number, z: number, ry: number): void => {
      item('chair', id, 'Bürostuhl', () => {
        const g = grp(x, z, ry);
        officeChair(g, 0, 0);
      });
    };
    chair('studio-chair-1', 20.5, -3.35, Math.PI / 2 + 0.2);

    // pallet bar along the east wall: standing pallets, wooden beam on top, long cardboard box, flight case
    item('pallet-bar', 'studio-pallet-bar', 'Palettenbar', () => {
      const g = grp(25.35, -4.0, Math.PI / 2);
      for (let r = 0; r < 7; r++) R(2.3, 0.1, 0.03, 0, 0.04 + r * 0.14, -0.27, r % 3 ? pine : pineDark, g);
      for (let i = 0; i < 5; i++) R(0.1, 0.95, 0.5, -1.1 + i * 0.55, 0.04, 0, pineDark, g);
      for (let r = 0; r < 4; r++) R(2.3, 0.1, 0.03, 0, 0.1 + r * 0.24, 0.27, pine, g);
      R(2.4, 0.09, 0.6, 0, 0.99, 0, pine, g);
      R(2.3, 0.1, 0.16, 0, 1.08, 0.15, aMat.carton, g);
    });
    item('flight-case', 'studio-flight-case', 'Alukoffer', () => {
      const g = grp(24.75, -5.0, 0.1);
      R(0.55, 0.22, 0.36, 0, 0.0, 0, mat.steel, g);
      R(0.57, 0.02, 0.38, 0, 0.11, 0, mat.grey, g);
      R(0.1, 0.03, 0.03, 0, 0.14, 0.19, mat.dark, g);
    });

    // grey acoustic screen beside the booth, pedestal fan, power strip
    item('screen', 'studio-screen', 'Akustikwand', () => {
      const g = grp(25.2, -2.0);
      R(1.3, 1.75, 0.08, 0, 0.1, 0, felt, g);
      for (const sx of [-0.5, 0.5]) R(0.05, 0.03, 0.3, sx, 0.0, 0, mat.steel, g);
    });
    item('fan', 'studio-fan', 'Standventilator', () => {
      const g = grp(24.55, -2.85);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 20), mat.black);
      base.position.y = 0.02;
      g.add(base);
      R(0.04, 1.3, 0.04, 0, 0.04, 0, mat.black, g);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 20), L(0x303034));
      head.rotation.x = Math.PI / 2;
      head.position.set(0, 1.4, -0.05);
      g.add(head);
      R(0.12, 0.12, 0.2, 0, 1.34, 0.1, mat.black, g);
    });
  }
  // dark room behind the curtain
  // room 7 = photo studio (from the photos): white walls in the west half, black curtain along the east half
  slab(18.56, 22.9, B.z0, B.z0, 0, 3.2, mat.wall, 0.05).position.z = az(B.z0) + 0.2;
  slab(22.9, 25.99, B.z0, B.z0, 0, 3.2, mat.black, 0.05).position.z = az(B.z0) + 0.2;
  slab(18.585, 18.585, B.z0 + 0.15, CZ - 0.06, 0, EXACT ? 3.2 : CUT, mat.wall, 0.05); // white lining directly on the east face (18.56) of the west wall, from the north wall to the hallway wall
  slab(26, 26, B.z0 + 0.15, CZ + 0.06, 0, EXACT ? 2.5 : CUT, mat.black, 0.03); // opaque backing of the east curtain, replaces the wall
  if (EXACT) slab(26, 26, B.z0 + 0.15, CZ + 0.06, 2.5, H_CORE, mat.wall, 0.12); // normal wall above the curtain, like the south side
  slab(24.5, 26, -2.25, CZ - 0.06, 0.005, 0.025, L(0x1a1a1a)); // floor beside the booth
  slab(18.56, 22.9, B.z0 + 0.15, CZ - 0.06, 0.005, 0.025, L(0x1a1a1a));
  slab(22.9, 26, B.z0 + 0.15, -2.25, 0.005, 0.025, L(0x1a1a1a)); // floor of the extension
  // curtain across the doorway, drawn to the west: a rail over the whole opening and a gathered black drape (vertical folds that alternate in depth)
  within(19.4, 0, () => {
    const CH = EXACT ? 2.45 : CUT;
    box(4.5, 0.03, 0.04, 20.75, CH + 0.03, CZ - 0.15, mat.steel); // rail
    const folds = 20;
    for (let i = 0; i < folds; i++) {
      const x = 18.565 + ((i + 0.5) * 1.6) / folds;
      box(1.6 / folds + 0.02, CH, 0.05, x, 0, CZ - 0.15 + (i % 2 ? 0.04 : -0.04), i % 2 ? mat.black : mat.dark);
    }
    for (let i = 0; i < folds; i += 2) box(0.025, 0.04, 0.04, 18.565 + ((i + 0.5) * 1.6) / folds, CH - 0.01, CZ - 0.15, mat.steel); // rings
  }, 'Vorhang');
  // the same curtain (same height, rail, folds) east of the booth in the hallway wall and along the whole east wall of the studio
  within(25.2, -1.15, () => {
    const CH = EXACT ? 2.45 : CUT;
    const fold = (x: number, z: number, wx: number, wz: number, i: number): void => {
      box(wx, CH, wz, x, 0, z, i % 2 ? mat.black : mat.dark);
    };
    box(1.47, 0.03, 0.04, 25.295, CH + 0.03, CZ - 0.15, mat.steel); // rail, south part
    const nS = 15;
    for (let i = 0; i < nS; i++) fold(24.56 + ((i + 0.5) * 1.47) / nS, CZ - 0.15 + (i % 2 ? 0.04 : -0.04), 1.47 / nS + 0.02, 0.05, i);
    const z0 = B.z0 + 0.15;
    const z1 = CZ - 0.06; // all the way to the north face of the hallway wall: the curtain wraps the south-east corner into the south part
    const nE = 42;
    // the curtain is the partition between the studio and the east room, so it is folded on both sides of its backing panel (x = 26)
    for (const side of [-1, 1]) {
      const ze = side > 0 ? CZ + 0.06 : z1; // the east-room side runs on to the south face of the hallway wall (flush); the studio side wraps into the south part
      const n = side > 0 ? 46 : nE;
      box(0.04, 0.03, ze - z0, 26 + side * 0.075, CH + 0.03, (z0 + ze) / 2, mat.steel); // rail
      for (let i = 0; i < n; i++) fold(26 + side * (0.075 + (i % 2 ? 0.03 : -0.03)), z0 + ((i + 0.5) * (ze - z0)) / n, 0.05, (ze - z0) / n + 0.02, i + (side > 0 ? 1 : 0));
    }
  }, 'Vorhang Ost');
  // two white bar stools in front of the pallet bar
  within(24.4, -4.0, () => {
    for (const z of [-4.4, -3.6]) {
      cyl(0.17, 0.17, 0.02, 24.4, 0, z, mat.steel);
      cyl(0.025, 0.025, 0.68, 24.4, 0, z, mat.steel, world, 8);
      box(0.4, 0.05, 0.32, 24.4, 0.68, z, mat.white);
    }
  }, 'Barhocker Fotostudio');
  buildPhotoStudio();
  // photo booth (phone box) x 23..24.5, z -2.2..CZ: white cabinet, grey felt inside, glass door with handle and "PSST!" hanger
  {
    const f = L(0x4b4e53); // felt
    const bw = ax(24.5) - ax(23);
    const bx = (ax(23) + ax(24.5)) / 2;
    const bz = az(-2.2);
    rbox(0.02, 2.2, az(CZ) - bz - 0.06, ax(23) + 0.07, 0, (bz + az(CZ)) / 2 + 0.03, f); // west felt
    rbox(0.02, 2.2, az(CZ) - bz - 0.06, ax(24.5) - 0.07, 0, (bz + az(CZ)) / 2 + 0.03, f); // east felt
    rbox(bw - 0.14, 2.2, 0.02, bx, 0, bz + 0.07, f); // back felt
    rbox(bw - 0.12, 0.03, az(CZ) - bz - 0.1, bx, 0.0, (bz + az(CZ)) / 2, L(0x3a3c40)); // carpet
    const rig = doors.find((d) => Math.abs(d.center.x - ax(23.75)) < 0.05 && Math.abs(d.center.z - az(CZ)) < 0.05);
    if (rig) {
      rig.pivot.position.z += 0.045; // leaf flush with the south face of the wall
      const W = rig.width;
      rbox(0.07, 0.24, 0.006, W - 0.12, 0.76, 0.05, L(0x6cc24a), 0, rig.pivot); // green "PSST!" hanger
      rbox(0.04, 0.12, 0.04, 0.0, 0.2, 0, mat.steel, 0, rig.pivot); // hinges
      rbox(0.04, 0.12, 0.04, 0.0, 1.85, 0, mat.steel, 0, rig.pivot);
    }
    item('booth-table', 'booth-table', 'Tisch Telefonkabine', () => {
      box(0.36, 0.04, 0.72, 23.28, 0.98, -1.7, mat.white); // desk shelf on the west wall
      box(0.34, 0.18, 0.7, 23.27, 0.8, -1.7, mat.white);
    });
    item('stool', 'booth-stool', 'Hocker Telefonkabine', () => {
      track(boothSeat);
      boothSeat.x = gx(23.95);
      boothSeat.z = gz(-1.65);
      cyl(0.17, 0.17, 0.02, 23.95, 0, -1.65, mat.steel);
      cyl(0.025, 0.025, 0.68, 23.95, 0, -1.65, mat.steel, world, 8);
      box(0.38, 0.05, 0.3, 23.95, 0.68, -1.65, mat.black);
    });
  }
  within(26, -1.9, () => shelf(26.36, CZ + 0.06 - 0.95, 1.9, 2.0, 0.4, Math.PI / 2)); // against the east curtain (folds reach x 26.13), south end flush with the south face of the CZ wall
  within(26, -4.2, () => {
    box(0.9, 0.3, 2.0, 26.6, 0, -4.2, mat.plyLight);
    box(0.9, 0.18, 2.0, 26.6, 0.3, -4.2, mat.fabric);
    box(0.25, 0.4, 0.5, 26.3, 0.48, -4.9, mat.black);
  }, 'Palettensofa');

  /* =================================================================
     WEST END: entry corridor, Wassermelonen room
  ================================================================= */
  const DOOR_Z = az(0.6); // centre of the glass door in the hallway glass wall
  wall(-5, B.z0, -5, B.z1, 3.8, [
    // glass wall across the whole hallway width with a framed regular-size glass door inside, glass up to the top
    { a: az(CZ), b: DOOR_Z - 0.5, top: 3.8, fill: 'glass', flush: true, abs: true },
    { a: DOOR_Z - 0.5, b: DOOR_Z + 0.5, top: 2.1, fill: 'glass', door: 1, frame: true, flush: true, abs: true },
    { a: DOOR_Z + 0.5, b: az(CORR), top: 3.8, fill: 'glass', flush: true, abs: true },
    // northern part (next to the core rooms): wall as high as the core south wall (H_CORE), glass above up to the top
    { a: az(B.z0), b: az(CZ), bottom: H_CORE, top: 3.8, fill: 'glass', flush: true, abs: true },
    { a: 3.6, b: 8.6, bottom: 0.9, top: 2.2, fill: 'glass', pass: true }, // interior window lounge <-> Wassermelonen
  ]);
  wall(-5, CORR, -0.5, CORR, 3.8); // partition entry corridor | lounge (pod stands against it)
  // desk pairs (places 1-6) spaced evenly (~3.97 m) from desk 7 (z -4.9) to the last pair, which sits further from the south wall (room behind place 6); each pair stays rigid
  for (const z0 of [-0.93, 3.03, 7.0]) {
    within(-8.3, z0, () => {
      desk(-8.3, z0 - 0.41, Math.PI);
      desk(-8.3, z0 + 0.41, 0);
      shelf(-7.25, z0, 1.6, 1.15, 0.4, Math.PI / 2);
      pendant(-8.3, z0, 'cage', 1.95, 2.8);
      plant(-9.1, z0 + 1.5, 0.9, 0.85);
    });
  }
  desk(-7.6, -4.9, 0, { white: true }); // desk 7, flipped 180°
  shelf(-5.9, -5.2, 1.0, 1.0, 0.35);
  coatRack(-5.6, 5.0); // Wassermelonen: by the interior window to the lounge
  // small meeting room (annex south of the doorway): after the photos "GL Sizi" - solid navy south wall with TV above a grey futon,
  // white rounded coffee table, two grey armchairs facing each other, industrial pendant, curtain + radiator at the west windows,
  // planning board on the east wall
  const AZ = B.z1 + ANNEX.d; // z of the annex's south wall
  const MZ = B.z1 + ANNEX.d / 2; // room centre line (z)
  const MX = (B.x0 + ANNEX.x1) / 2; // room centre line (x)
  const SZ = AZ - 0.15; // inner face of the south wall
  windowWall(B.x0, B.z1, B.x0, AZ); // west: windows
  wall(B.x0 - 0.15, AZ, ANNEX.x1 + 0.15, AZ, H_LOW, [], { t: 0.3, outer: true }); // south (runs to the outer faces so the corners close flush): solid, the sofa stands against it
  wall(ANNEX.x1, B.z1, ANNEX.x1, AZ + 0.15, 3.8, [], { t: 0.3, outer: true });
  const navy = L(0x1c2030);
  const RW = ANNEX.x1 - B.x0 - 0.3; // clear room width
  box(RW, H_LOW, 0.03, MX, 0, SZ - 0.015, navy); // dark painted back wall
  for (const y of [2.5, 2.58]) box(RW, 0.05, 0.05, MX, y, SZ - 0.06, mat.white); // white conduits under the ceiling
  // planning board on the east wall
  const boardTex = canvasTex(256, 192, (g, w, h) => {
    g.fillStyle = '#15191c';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#2b3338';
    g.lineWidth = 1;
    for (let x = 12; x < w; x += 10) {
      g.beginPath();
      g.moveTo(x, 12);
      g.lineTo(x, h * 0.62);
      g.stroke();
    }
    for (let y = 12; y < h * 0.62; y += 10) {
      g.beginPath();
      g.moveTo(12, y);
      g.lineTo(w - 12, y);
      g.stroke();
    }
    g.fillStyle = '#e6e8e8';
    for (const [x, y, cw] of [[20, 130, 40], [70, 140, 36], [120, 126, 44], [30, 156, 38], [90, 160, 40], [150, 150, 36], [190, 136, 40], [60, 118, 30]]) g.fillRect(x, y, cw, 8);
    g.fillStyle = '#4f9a93';
    for (const [x, y] of [[70, 30], [110, 52], [150, 40], [190, 70], [100, 20]]) g.fillRect(x, y, 22, 8);
  });
  box(0.02, 1.12, 1.52, ANNEX.x1 - 0.16, 0.95, MZ - 0.2, mat.steel);
  box(0.02, 1.04, 1.44, ANNEX.x1 - 0.175, 0.99, MZ - 0.2, L(0xffffff, { map: boardTex }));
  // radiator under the west windows + curtain (drawn at both ends) hanging from a rail
  box(0.08, 0.5, 2.0, B.x0 + 0.2, 0.2, MZ, mat.white);
  box(0.05, 0.03, 3.2, B.x0 + 0.24, 2.52, MZ, mat.white); // curtain rail
  for (const [cz, cw] of [[B.z1 + 0.55, 0.8], [AZ - 0.65, 1.0]] as const) {
    box(0.07, 2.35, cw, B.x0 + 0.24, 0.17, cz, L(0xf1efe9));
    for (let i = 0; i < 4; i++) box(0.09, 2.33, 0.03, B.x0 + 0.24, 0.18, cz - cw / 2 + (cw * (i + 0.5)) / 4, L(0xdad8d1)); // folds
  }
  item('small-tv', 'small-tv', 'Fernseher klein', () => {
    box(1.08, 0.62, 0.05, MX, 1.15, SZ - 0.04, mat.black);
    box(1.0, 0.56, 0.01, MX, 1.18, SZ - 0.075, L(0x20262c));
  });
  item('sofa', 'sofa', 'Sofa', () => {
    const fab = L(0x66686c);
    box(1.9, 0.28, 0.85, MX, 0.17, SZ - 0.5, fab); // seat (futon)
    box(1.9, 0.52, 0.2, MX, 0.3, SZ - 0.12, fab); // backrest
    for (const dx of [-0.95, 0.95]) box(0.1, 0.18, 0.8, MX + dx, 0.45, SZ - 0.5, fab); // thin arms
    for (const dx of [-0.85, 0.85]) for (const dz of [0.15, 0.85]) box(0.04, 0.17, 0.04, MX + dx, 0, SZ - dz, mat.black); // feet
    for (const k of [-1, 0, 1]) box(0.55, 0.38, 0.14, MX + k * 0.6, 0.42, SZ - 0.27, L(k === 0 ? 0x5a5c60 : 0x707276)); // cushions
  });
  const TZ = SZ - 1.75; // coffee table / chairs line
  item('coffee-table', 'coffee-table', 'Couchtisch', () => {
    const sh = new THREE.Shape();
    const [hw, hd, r] = [0.55, 0.3, 0.17];
    sh.moveTo(-hw + r, -hd);
    sh.lineTo(hw - r, -hd);
    sh.quadraticCurveTo(hw, -hd, hw, -hd + r);
    sh.lineTo(hw, hd - r);
    sh.quadraticCurveTo(hw, hd, hw - r, hd);
    sh.lineTo(-hw + r, hd);
    sh.quadraticCurveTo(-hw, hd, -hw, hd - r);
    sh.lineTo(-hw, -hd + r);
    sh.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
    const top = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: false }), mat.white);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.38;
    const tg = new THREE.Group(); // long side parallel to the sofa
    tg.position.set(gx(MX), 0, gz(TZ));
    tg.add(top);
    world.add(tg);
    for (const dx of [-0.42, 0.42]) for (const dz of [-0.17, 0.17]) cyl(0.03, 0.016, 0.38, MX + dx, 0, TZ + dz, mat.plyLight, world, 8); // tapered wooden legs
  });
  // two armchairs either side of the table, turned a little towards the sofa
  const armchair = (n: number, x: number, z: number, yaw: number) =>
    item('armchair', `armchair-${n}`, 'Sessel', () => {
      const g = new THREE.Group();
      g.position.set(gx(x), 0, gz(z));
      g.rotation.y = yaw; // front = local +z
      const grey = L(0xa9abae);
      rbox(0.72, 0.2, 0.66, 0, 0.27, 0.03, grey, 0, g);
      rbox(0.72, 0.45, 0.14, 0, 0.45, -0.3, grey, 0, g);
      for (const s of [-1, 1]) rbox(0.12, 0.26, 0.66, s * 0.3, 0.45, 0.03, grey, 0, g);
      for (const sx of [-0.27, 0.27]) for (const sz of [-0.25, 0.28]) rbox(0.04, 0.27, 0.04, sx, 0, sz, mat.plyLight, 0, g);
      world.add(g);
    });
  armchair(1, MX - 1.25, TZ, Math.PI / 2 - 0.45);
  armchair(2, MX + 1.25, TZ, -Math.PI / 2 + 0.45);
  pendant(MX, TZ, 'steel', 1.85, H_LOW); // industrial glass pendant above the table
  shelf(B.x0 + 0.9, B.z1 + 0.35, 1.2, 1.0, 0.35, 0); // low white shelf by the door side
  plant(-5.6, -3.5, 1.5, 0, false, { x1: -5.06 }); // west of the lounge partition (x -5)

  /* =================================================================
     LOUNGE: pod, foosball, reception counter
  ================================================================= */
  within(-1.9, CORR, () => {
    // house-shaped pod: black shell, plywood interior, opens to +z
    const g = new THREE.Group();
    // stretches from the west wall to its old right edge, backs onto the corridor partition
    const wallX = ax(-5) + 0.06;
    const POD_SCALE = 0.9;
    const w = 3.4; // sits near the west partition, free floor on its right
    const d = 2.2 * POD_SCALE;
    const eave = 2.0;
    const rise = 1.4;
    // turned 10 deg anticlockwise (seen from above); nudged south so the rotated back corner stays clear of the corridor partition
    const POD_ROT = (10 * Math.PI) / 180;
    g.position.set(wallX + 0.55 + w / 2, 0, az(CORR) + 0.06 + 1.1 + 0.25);
    g.rotation.y = POD_ROT;
    world.add(g);
    box(w, 0.04, d, 0, 0, 0, mat.ply, 0, g); // thin floor, people sit / walk on the office floor
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
    box(w - 0.3, 0.41, 0.45, 0, 0.04, -d / 2 + 0.35, mat.black, 0, g); // bench along the back, seat height 0.45
    box(w - 0.3, 0.45, 0.1, 0, 0.45, -d / 2 + 0.17, mat.black, 0, g);
    for (const s of [-1, 1]) box(0.45, 0.41, 1.3, s * (w / 2 - 0.4), 0.04, 0.23, mat.black, 0, g); // side benches: U-shape open to +z
    box(0.6, 0.04, 0.6, 0, 0.72, 0.2, mat.ply, 0, g); // small table centred between the benches
    box(0.06, 0.68, 0.06, 0, 0.04, 0.2, mat.black, 0, g);
    // two seats on the back bench, either side of the table, facing the room (game coordinates)
    for (const lx of [-0.7, 0.7]) {
      const lz = -d / 2 + 0.38;
      podSeats.push(
        track({
          x: g.position.x + lx * Math.cos(POD_ROT) + lz * Math.sin(POD_ROT),
          z: g.position.z - lx * Math.sin(POD_ROT) + lz * Math.cos(POD_ROT),
          yaw: POD_ROT,
        }),
      );
    }
    podCenter.x = (podSeats[0].x + podSeats[1].x) / 2;
    podCenter.z = (podSeats[0].z + podSeats[1].z) / 2 + 0.6;
    track(podCenter);
    for (const x of [-0.5, -0.3, -0.1]) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), mat.lampWarm);
      b.position.set(x, 1.55 + x * 0.3, -0.3);
      g.add(b);
    }
  }, 'Holzhaus');
  plant(-4.0, 5.3, 2.0, 0, false, { x0: -4.94 }); // in front of the pod, left side
  const FOOS = { x: -0.15, z: 7.7, rot: (70 * Math.PI) / 180 }; // rot.y > 0 = anticlockwise seen from above
  // the two players stand at the ends of the rods (local z), facing the table
  const foosStands = ([1, -1] as const).map((side) => ({
    x: gx(FOOS.x) + side * 1.25 * Math.sin(FOOS.rot),
    z: gz(FOOS.z) + side * 1.25 * Math.cos(FOOS.rot),
    yaw: Math.atan2(-side * Math.sin(FOOS.rot), -side * Math.cos(FOOS.rot)),
  }));
  item('foosball', 'foosball', 'Tischkicker', () => {
    foosStands.forEach(track);
    // foosball table: wooden body, green field, handled rods with little players
    const g = new THREE.Group();
    g.position.set(gx(FOOS.x), 0, gz(FOOS.z)); // lounge side of the reception counter, south end, a bit off the walls
    g.rotation.y = FOOS.rot;
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
  });
  // reception counter (white, slatted front) dividing lounge from first desk row
  item('reception-counter', 'reception-counter', 'Empfangstheke', () => {
    const m = new THREE.MeshLambertMaterial({ map: slats });
    const zc = az(6.025);
    const len = 6.65 * SCALE; // runs to the window wall
    rbox(0.6, 1.12, len, ax(2.0), 0, zc, m);
    rbox(0.7, 0.05, len + 0.1, ax(2.0), 1.12, zc, mat.white);
  });
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
  // keep all garlands under the high sawtooth (z < BAND); the low band beyond has a 2.8 ceiling and they would poke through it
  bunting(V(-4.8, 3.5, 3.0), V(4.4, 3.3, 6.4), blues);
  bunting(V(-0.6, 3.6, 2.4), V(4.4, 3.2, 6.0), blues);
  bunting(V(-4.8, 3.6, 6.4), V(4.4, 3.4, 3.0), warm);
  bunting(V(-4.8, 3.3, 4.6), V(4.4, 3.5, 4.8), blues);
  stringLights(V(-4.8, 3.7, 6.4), V(4.4, 3.4, 2.6));
  stringLights(V(-4.8, 3.6, 4.0), V(4.4, 3.5, 6.2));
  stringLights(V(-2.0, 3.8, 2.4), V(1.0, 3.6, 6.4));

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
    box(0.84, 1.3, 6.45, 5.486, 0, 6.125, mat.white); // white divider units, double depth, desk-side face unchanged (x 5.906)
    for (const z of [4.5, 7.2]) pendant(3.0, z, 'steel', 2.1, 4.2);
  }, 'Trennmöbel Himbeeren');
  // Kreative Kiwis (x 9.7..12.483)
  within(9.08, 5.9, () => {
    deskRowZ(8.672, ROW3, -1, ROW3_OPT);
    deskRowZ(9.492, ROW3, 1, ROW3_OPT);
    shelf(9.08, 2.65, 2.0, 1.3, 0.4);
    for (const z of [4.6, 7.0]) pendant(9.08, z, 'steel', 2.1, 4.2);
  });
  // Digitale Birnen (x 14.7..19.5)
  within(15.884, 6.1, () => {
    deskRowZ(15.474, ROW3, -1, ROW3_OPT);
    deskRowZ(16.294, ROW3, 1, ROW3_OPT);
    shelf(15.884, 2.65, 2.4, 1.3, 0.4);
    for (const z of [4.8, 7.2]) pendant(15.884, z, 'steel', 2.1, 4.2);
    plant(18.6, 8.9, 1.0, 0.85);
  });
  // planter / divider wall between Kreative Kiwis (graphic) and Digitale Birnen (digital): an item of its own, built in
  // game coordinates so it always spans the whole desk zone (corridor line .. window wall), also when the plan is scaled.
  // Deep enough for a plant on the west half, cupboards in both faces, glass on the east half up to the top rail.
  {
    const DW = 0.9; // depth of the cabinet base
    const BASE_H = 1.25;
    const TOP = 2.7; // underside of the top rail (rail top = 2.8, the low ceiling)
    const COL = 0.25; // structural column at the corridor end
    const FACE = 0.02; // cupboard doors stand this proud of the base
    const X = (ax(9.08) + (9.492 - 9.08) + ax(15.884) + (15.474 - 15.884)) / 2; // centred between the facing desk rows of both teams
    const Z0 = az(CORR) + 0.15; // same start line as the Birnen | glass room cabinet
    const ZC = Z0 + COL; // south face of the column: base, glass and rail butt against it (no overlapping faces)
    const ZP = az(B.z1) - 0.15; // inner face of the window wall (parapet / lintel)
    const ZG = az(B.z1) - 0.02; // just short of the window pane: closes the gap above the parapet without touching the glass
    const GX = X + DW / 4; // glass sits on the east half
    const colW = X - DW / 2 - FACE; // column: west face flush with the cupboard doors, east face flush with the glass
    const colE = GX + 0.015;
    const mx = (g: number) => g / SCALE + B.x0; // game x -> model x (plant / coat rack take model coordinates)
    item('divider', 'divider-kiwis-birnen', 'Trennwand Kiwis | Birnen', () => {
      rbox(colE - colW, 3.8, COL, (colW + colE) / 2, 0, Z0 + COL / 2, mat.white);
      rbox(X + DW / 2 - colE, BASE_H, COL, (colE + X + DW / 2) / 2, 0, Z0 + COL / 2, mat.white); // base next to the column
      rbox(DW, BASE_H, ZG - ZC, X, 0, (ZC + ZG) / 2, mat.white);
      const doors = 7;
      const dw = (ZP - ZC) / doors;
      for (let i = 0; i < doors; i++) {
        const dz = ZC + (i + 0.5) * dw;
        for (const f of [-1, 1]) {
          const fx = X + f * (DW / 2);
          if ((f === -1 && (i === 1 || i === 4)) || (f === 1 && (i === 2 || i === 5))) {
            // open cupboard: dark back panel with 3 shelves; the frame is as thick as the closed doors, so the fronts are flush
            rbox(0.01, 1.0, dw - 0.04, fx + f * 0.005, 0.1, dz, mat.dark);
            for (const sy of [0.1, 0.43, 0.76, 1.09]) rbox(FACE, 0.03, dw - 0.04, fx + f * 0.01, sy, dz, mat.lightgrey);
            for (const sz of [-1, 1]) rbox(FACE, 1.02, 0.03, fx + f * 0.01, 0.1, dz + (sz * (dw - 0.07)) / 2, mat.lightgrey);
            continue;
          }
          rbox(FACE, 1.0, dw - 0.04, fx + f * 0.01, 0.1, dz, mat.lightgrey); // cupboard door
          rbox(0.03, 0.12, 0.02, fx + f * 0.03, 0.9, dz + dw * 0.35, mat.black); // handle
        }
      }
      seg(GX, ZC, GX, ZG, BASE_H, TOP, mat.glass, 0.03);
      rbox(0.08, 0.1, ZP - ZC, GX, TOP, (ZC + ZP) / 2, mat.white); // top rail, column .. lintel
    });
    plant(mx(X - DW / 4), 3.7, 1.9, BASE_H, true);
    plant(mx(X - DW / 4), 6.7, 0.9, BASE_H, true);
  }
  // frosted glass wall on low cabinet (Birnen | glass room)
  slab(19.06, 19.5, CORR, B.z1, 0, 1.1, mat.white); // starts on the corridor wall line, flush with the wall (no gap beside the door)
  segM(19.5, CORR, 19.5, B.z1, 0, 2.7, mat.frosted, 0.04); // glass runs down to the floor on the meeting-room side (the cabinet stands against its west face)
  segM(19.5, CORR, 19.5, B.z1, 2.7, 2.8, mat.white, 0.1);
  item('box', 'red-box', 'Rote Kiste', () => box(0.3, 0.14, 0.5, 19.2, 1.1, 5.0, L(0xd8322a)));

  /* =================================================================
     GLASS ROOM (x 19.5..26.5) - interior not photographed
  ================================================================= */
  wall(19.5 - 0.05, CORR, 26.5 + 0.05, CORR, H_CORE, [{ a: 20.2, b: 21.1, door: 1 }]); // ends flush with the outer faces of the 0.1 m top rails of the glass walls
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
    // conference table, long axis along z (towards the windows): thin white top with black edge, two black slab legs
    box(1.3, 0.04, 4.4, 23, 0.72, 6.0, mat.white);
    box(1.32, 0.012, 4.42, 23, 0.72, 6.0, mat.black);
    box(0.7, 0.72, 0.07, 23, 0, 4.0, mat.black);
    box(0.7, 0.72, 0.07, 23, 0, 8.0, mat.black);
    // linear LED pendant over the table
    item('pendant', 'meeting-linear-light', 'Hängelampe', () => {
      box(0.07, 0.07, 2.6, 23, 2.15, 6.0, mat.white);
      box(0.04, 0.01, 2.55, 23, 2.145, 6.0, mat.lampWarm);
      for (const lz of [5.0, 7.0]) cyl(0.004, 0.004, 1.1, 23, 2.2, lz, mat.black, world, 4);
    });
    meetCenter.x = gx(23);
    meetCenter.z = gz(6.0);
    track(meetCenter);
    // wall-mounted display on the door wall: white frame, black screen, white header box above, facing into the room
    item('tv', 'meeting-tv', 'Fernseher', () => {
      box(2.2, 1.25, 0.06, 23, 0.9, 2.3, mat.white);
      box(2.08, 1.13, 0.01, 23, 0.96, 2.335, L(0x15191c));
      box(2.3, 0.16, 0.14, 23, 2.15, 2.28, mat.white);
    });
    // easter egg: framed dead bug on the wall left of the screen
    item('frame', 'dead-bug-frame', 'Gerahmte Mücke', () => {
      const tex = canvasTex(160, 200, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        const gold = g.createLinearGradient(0, 0, w, h);
        gold.addColorStop(0, '#d9b25c');
        gold.addColorStop(0.5, '#7a5420');
        gold.addColorStop(1, '#c9a14a');
        g.fillStyle = gold;
        g.fillRect(0, 0, w, h);
        g.clearRect(26, 26, w - 52, h - 52);
        g.strokeStyle = '#4a3010';
        g.lineWidth = 3;
        g.strokeRect(4, 4, w - 8, h - 8);
        g.strokeRect(24, 24, w - 48, h - 48);
        g.fillStyle = '#e6c56e';
        for (const [cx, cy] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
          g.beginPath();
          g.arc(cx, cy, 11, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        }
        // dead bug (mosquito): body + legs
        g.strokeStyle = '#1a1a1a';
        g.fillStyle = '#1a1a1a';
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(80, 100, 3, 9, 0.9, 0, Math.PI * 2);
        g.fill();
        for (const sx of [-1, 1]) {
          for (let i = 0; i < 3; i++) {
            g.beginPath();
            g.moveTo(80, 100);
            g.lineTo(80 + sx * (14 + i * 4), 100 + (i - 1) * 12);
            g.stroke();
          }
        }
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.275), new THREE.MeshLambertMaterial({ map: tex, transparent: true }));
      m.position.set(gx(21.5), 1.5, gz(2.34));
      m.userData.nonav = true;
      world.add(m);
    });
    // low white cubby shelf under the south windows, ficus on the west end, black chair, portable AC on the east end
    shelf(22.7, 9.15, 5.6, 0.8, 0.35);
    plant(20.15, 8.85, 1.9);
    item('chair', 'meeting-black-chair', 'Stuhl', () => {
      box(0.4, 0.04, 0.4, 20.85, 0.45, 8.85, mat.black);
      box(0.4, 0.3, 0.04, 20.85, 0.6, 9.05, mat.black);
      for (const [lx, lz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) box(0.025, 0.45, 0.025, 20.85 + lx, 0, 8.85 + lz, mat.grey);
    });
    item('ac', 'meeting-ac', 'Klimagerät', () => {
      box(0.42, 0.78, 0.38, 25.85, 0, 8.95, mat.white);
      box(0.3, 0.08, 0.02, 25.85, 0.55, 8.75, mat.lightgrey);
      cyl(0.08, 0.08, 0.5, 26.25, 0.3, 9.1, mat.white, world, 10);
    });
    for (const bx of [22.2, 22.38]) cyl(0.03, 0.03, 0.22, bx, 0.8, 9.3, mat.glass, world, 8);
    // frosted sliding-panel curtains on the west and east walls
    for (let pz = 2.7; pz < 9.2; pz += 0.9) {
      for (const px of [19.57, 26.43]) box(0.025, 2.65, 0.03, px, 0, pz, mat.white);
    }
    for (const px of [19.57, 26.43]) box(0.05, 0.05, 6.8, px, 2.62, 6.0, mat.grey);
    // red shell chairs (one moulded seat+back shell on a slim 4-leg steel frame), 3 per long side, backs away from the table
    const shellMat = L(0xe5402a, { side: THREE.DoubleSide });
    const frameMat = L(0x8d867f);
    const shellGeo = shellChairGeometry();
    // [x, z, yaw]: local +x = seat front; 3 per long side plus one at each head of the table
    const seats: [number, number, number][] = [
      ...[4.8, 6.0, 7.2].flatMap((cz): [number, number, number][] => [[22.0, cz, 0], [24.0, cz, Math.PI]]),
      [23.0, 3.4, -Math.PI / 2], // north head, faces the table
      [23.0, 8.6, Math.PI / 2], // south head
    ];
    for (const [cx, cz, ry] of seats) item('chair', at('chair', cx, cz), 'Stuhl', () => {
      const chair = new THREE.Group();
      chair.position.set(gx(cx), 0, gz(cz));
      chair.rotation.y = ry;
      meetSeats.push(track({ x: gx(cx), z: gz(cz), yaw: Math.atan2(Math.cos(ry), -Math.sin(ry)) })); // every chair incl. the heads; local +x = seat front
      chair.add(new THREE.Mesh(shellGeo, shellMat));
      for (const [fx, tx] of [[0.14, 0.27], [-0.1, -0.26]]) {
        for (const sz of [-1, 1]) {
          chairRod(chair, [fx, 0.42, sz * 0.17], [tx, 0.02, sz * 0.27], 0.011, frameMat);
          cyl(0.016, 0.016, 0.02, tx, 0, sz * 0.27, mat.black, chair, 8);
        }
        chairRod(chair, [fx, 0.415, -0.17], [fx, 0.415, 0.17], 0.01, frameMat); // cross bar under the shell
      }
      world.add(chair);
    });
  }, 'Besprechungstisch');

  /* =================================================================
     EAST END STRIP (x 26.5..31.5), full building depth
  ================================================================= */
  // After the photos (IMG_8872-8876): sit-stand desks, long rows running from the glass wall towards the east windows,
  // one head desk facing the windows, a walkway (and a low cabinet / plants) along the window wall, white open shelves as end caps.
  const SS = { stand: true };
  const ROW_W = 1.8; // tables 6-9 (was 1.5), east edge stays at x 31.35
  const EAST_XS = [30.45]; // one desk per row (the inner desks, seats 23/25/28/30, were removed), x 29.55..31.35
  for (const zc of [4.2, 7.6]) {
    within(29.9, zc, () => {
      deskRowX(zc - 0.41, EAST_XS, -1, { ...SS, w: ROW_W });
      deskRowX(zc + 0.41, EAST_XS, 1, { ...SS, w: ROW_W });
      desk(29.15, zc, -Math.PI / 2, SS); // head desk, flush against the row desks (x 29.55): chair on the west side, faces the east windows
      shelf(31.65, zc, 1.6, 1.1, 0.35, Math.PI / 2); // open shelf closing the group towards the walkway
      pendant(30.2, zc, 'black', 1.95, 2.8);
      pendant(28.4, zc, 'black', 1.95, 2.8);
    });
  }
  plant(32.1, 5.9, 0.8, 0.85); // sill plant between the two groups
  item('cabinet', at('cabinet', 32.05, 2.9), 'Sideboard', () => box(0.45, 0.7, 1.2, 32.05, 0, 2.9, mat.white)); // low white cabinet under the east windows
  // tables 10 + 11: centred in the room (x 27.1..32.35) and pushed against the north wall (inner face z = -5.35)
  within(29.7, -3.7, () => {
    const NW = 1.85; // tables 10 + 11: desks 1.85 wide (was 1.6), first one against the north wall
    deskRowZ(29.3, [-5.3 + NW / 2, -5.3 + NW * 1.5], -1, { ...SS, w: NW });
    deskRowZ(30.1, [-5.3 + NW / 2, -5.3 + NW * 1.5], 1, { ...SS, w: NW });
    pendant(29.7, -3.7, 'black', 1.95, 2.8);
  });
  coatRack(11.72, 3.0); // next to the white planter divider, south of its column (as in the photo)
  coatRack(26.8, 1.8); // east end of the hallway: at the corner of the glass room
  item('cabinet', at('cabinet', 31.9, 1.1), 'Rollkorpus', () => box(0.8, 0.6, 0.45, 31.9, 0, 1.1, mat.lightgrey)); // drawer cabinet at window
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
    flat(B.x0, B.z0, -5, B.z1 + ANNEX.d, H_LOW); // Wassermelonen + small meeting room annex flat ceiling
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

  /** Footprints of everything below `root` that is in a walker's way. */
  const collectBlockers = (root: THREE.Object3D): THREE.Box3[] => {
    const out: THREE.Box3[] = [];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.nonav) return;
      const bb = new THREE.Box3().setFromObject(o);
      if (bb.min.y < 1.2 && bb.max.y > 0.25) out.push(bb);
    });
    return out;
  };
  // architecture and everything else that never moves
  const blockers = collectBlockers(world);

  // movable furniture: one merged scene object per item, placed at its pivot (centre of the footprint)
  const items: RoomItem[] = [];
  const coatRacks: CoatRackRig[] = [];
  for (const d of drafts) {
    const inner = new THREE.Group();
    inner.add(...d.objs);
    inner.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(inner);
    if (bounds.isEmpty()) continue;
    const pivot = new THREE.Vector3((bounds.min.x + bounds.max.x) / 2, 0, (bounds.min.z + bounds.max.z) / 2);
    const local = collectBlockers(inner).map((b) => b.translate(pivot.clone().negate()));
    const outer = new THREE.Group();
    outer.add(inner);
    inner.position.copy(pivot).negate();
    // coat hooks relative to the holder, so the coats move and turn with the item
    const rack = rackSpecs.find((r) => r.draft === d);
    outer.updateMatrixWorld(true); // `inner` sits at -pivot, so "world" is the holder's space here
    const pegs = rack?.pegs.map((p) => ({ at: rack.group.localToWorld(p.at.clone()), yaw: p.yaw }));
    const holder = mergeStatic(outer, false);
    holder.position.copy(pivot);
    scene.add(holder);
    if (rack && pegs) coatRacks.push({ root: holder, pegs });
    const hasSeat = d.anchors.length > 0;
    items.push(new RoomItem(d.id, d.kind, d.label, holder, { x: pivot.x, z: pivot.z, yaw: 0 }, local, bounds.translate(pivot.clone().negate()), d.anchors, !hasSeat));
  }

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
    // a little plant in a back corner next to the monitor: seeded per desk so it is stable but varied
    // (side, spot, kind, pot, size, turn; some desks get none)
    const rnd = (n: number) => {
      const v = Math.sin((i + 1) * 127.1 + n * 311.7) * 43758.5453;
      return v - Math.floor(v);
    };
    if (rnd(0) > 0.12) {
      const side = rnd(1) < 0.5 ? -1 : 1;
      const px = side * (0.4 + rnd(2) * (s.w / 2 - 0.55));
      const pz = -0.32 + rnd(3) * 0.1;
      // part of the desk (merged per material), so it moves with it
      const pg = new THREE.Group();
      const pl = new THREE.Group();
      pl.position.set(px, 0.75, pz);
      pl.rotation.y = rnd(4) * Math.PI * 2;
      pl.scale.setScalar(0.85 + rnd(5) * 0.4);
      pg.add(pl);
      deskPlant(pl, Math.floor(rnd(6) * 4), 0, 0, 0, POTS[Math.floor(rnd(7) * 3)]);
      root.add(mergeStatic(pg, false));
    }
    // the coffee mug that comes and goes with whoever works here (right of the mouse, where the sitter's hand ends up)
    const mug = new THREE.Group();
    mug.position.set(0.47, 0.75, 0.22);
    mug.visible = false;
    const mugMat = L([0xf4f1ea, 0x3b6ea5, 0xc2453a, 0x2f2f33, 0xe3b23c, 0x4f8a5b][Math.floor(rnd(8) * 6)]);
    const mugBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.09, 0.075), mugMat);
    mugBody.position.y = 0.045;
    mugBody.castShadow = true;
    const mugHandle = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.05, 0.03), mugMat);
    mugHandle.position.set(0.045, 0.05, 0);
    const coffee = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.004, 0.062), L(0x3b2415));
    coffee.position.y = 0.0915;
    coffee.visible = false;
    mug.add(mugBody, mugHandle, coffee);
    mug.traverse((o) => (o.userData.nonav = true));
    root.add(mug);
    scene.add(root);
    const placement: DeskPlacement = { rig: { root, screen, mug, coffee }, seat: { x: 0, z: 0 }, yaw: 0, back: { x: 0, z: 0 } };
    desks.push(placement);
    const turn = new THREE.Matrix4().makeRotationY(s.rot);
    const deskItem = new RoomItem(s.id, 'desk', `Tisch ${i + 1}`, root, { x: s.x, z: s.z, yaw: s.rot }, [tpl.box.clone().applyMatrix4(turn)], tpl.box.clone().applyMatrix4(turn), [], false);
    // the chair sits 0.75 behind the desk centre (local +z)
    deskItem.onApply = () => {
      const sin = Math.sin(root.rotation.y);
      const cos = Math.cos(root.rotation.y);
      placement.seat.x = root.position.x + sin * 0.75;
      placement.seat.z = root.position.z + cos * 0.75;
      placement.yaw = root.rotation.y + Math.PI;
      placement.back.x = sin;
      placement.back.z = cos;
    };
    deskItem.apply();
    items.push(deskItem);
  }

  const staticWorld = mergeStatic(world, true);
  const staticRoof = mergeStatic(roof, true);
  scene.remove(world, roof);
  scene.add(staticWorld);
  staticRoof.traverse((o) => {
    if (o instanceof THREE.Mesh) o.receiveShadow = false; // thin slanted roof planes self-shadow into moire stripes
  });
  staticRoof.visible = false;
  scene.add(staticRoof);

  // entrance double door: two wings (not merged, so each swings open on its own when somebody walks through)
  const wingW = 1.0; // two wings fill the doorway (model x -4.3 .. -2.3) exactly
  const wingH = 2.1;
  const wing = (side: 1 | -1): THREE.Group => {
    // side 1 = left wing (hinged at the west jamb, leaf extends east), -1 = right wing (mirrored)
    const g = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(wingW, wingH, 0.05), mat.lightgrey);
    leaf.position.set((side * wingW) / 2, wingH / 2, 0);
    leaf.castShadow = true;
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.03, 0.09), mat.steel);
    handle.position.set(side * (wingW - 0.1), 1.0, 0);
    // glass pane set into the upper part of the leaf (slightly proud of both faces)
    const pane = new THREE.Mesh(new THREE.BoxGeometry(wingW - 0.3, 1.1, 0.06), mat.glass);
    pane.position.set((side * wingW) / 2, 1.3, 0);
    g.add(leaf, pane, handle);
    g.position.set(ax(-3.3) - side * wingW, 0, az(B.z1) - 0.15 + 0.025); // flush with the inner face of the 0.3 m wall
    scene.add(g);
    return g;
  };
  const door = { left: wing(1), right: wing(-1) };

  // logo above the entrance door, on the outer face of the front wall
  {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="194" height="51" viewBox="0 0 194 51"><g fill="#000"><path d="M0 22.8779H5.58577L13.0206 43.4878L20.6869 22.8779H25.9261L14.9084 50.1525H10.7092L0 22.8779Z"/><path d="M29.5078 22.8779H34.3618V50.1525H29.5078V22.8779Z"/><path d="M45.7921 27.2693H38.0312V22.8779H58.4066V27.2693H50.646V50.1525H45.7921V27.2693Z"/><path d="M67.455 22.8779H71.6542L83.4037 50.1525H77.8563L75.3138 43.9114H63.4873L61.0218 50.1525H55.5898L67.455 22.8779ZM73.6188 39.7514L69.4196 28.6567L65.1437 39.7514H73.6188Z"/><path d="M85.8125 22.8779H93.209L100.493 41.9855L107.851 22.8779H115.17V50.1525H110.548V27.5007H110.47L102.188 50.1525H98.7978L90.5124 27.5007H90.4353V50.1525H85.8125V22.8779Z"/><path d="M121.535 22.8779H126.389V50.1525H121.535V22.8779Z"/><path d="M133.105 22.8779H139.539L152.753 43.1415L152.829 43.2183H152.753L152.829 43.1415V22.8779H157.684V50.1525H151.52L138.036 29.2344H137.96V50.1525H133.105V22.8779Z"/></g><path d="M190.3 0H170C169 0 168 0.4 167.3 1.1C166.6 1.7 166.2 2.7 166.2 3.6V17.1L163 25L171.1 21.8H190.3C191.3 21.8 192.2 21.4 192.9 20.7C193.6 20 194 19.1 194 18.1V3.6C194 3.1 193.9 2.7 193.7 2.2C193.5 1.8 193.2 1.4 192.9 1C192.6 0.7 192.1 0.4 191.7 0.2C191.3 0.1 190.8 0 190.3 0Z" fill="#000"/><path d="M179.981 13.9L182.511 11.79C183.011 11.39 183.461 10.87 183.831 10.26C184.141 9.74005 184.301 9.08005 184.301 8.30005C184.301 5.87005 182.611 4.30005 180.001 4.30005C177.271 4.30005 175.501 5.87005 175.501 8.30005V8.76005L179.001 9.04005V8.50005C179.001 8.37005 179.031 8.24005 179.091 8.01005C179.111 7.94005 179.171 7.83005 179.251 7.75005C179.301 7.70005 179.501 7.60005 179.621 7.54005C179.711 7.50005 179.821 7.49005 180.021 7.49005C180.111 7.49005 180.161 7.49005 180.291 7.55005C180.571 7.67005 180.641 7.75005 180.641 7.75005C180.721 7.84005 180.781 7.89005 180.821 7.97005C180.861 8.09005 180.891 8.21005 180.891 8.30005C180.891 8.74005 180.461 9.12005 179.981 9.51005L175.191 13.78V17.1H184.491V13.9H179.981Z" fill="#fff"/></svg>`;
    const cv = document.createElement('canvas');
    cv.width = 776; // 4 px per svg unit
    cv.height = 204;
    const logoTex = new THREE.CanvasTexture(cv);
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 8;
    const img = new Image();
    img.onload = () => {
      cv.getContext('2d')!.drawImage(img, 0, 0, cv.width, cv.height);
      logoTex.needsUpdate = true;
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const logoW = 1.5;
    const logoH = (logoW * 51) / 194;
    const logo = new THREE.Mesh(
      new THREE.PlaneGeometry(logoW, logoH),
      new THREE.MeshBasicMaterial({ map: logoTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    // centred above the door, between its head (2.1 m) and the wall top
    logo.position.set(ax(-3.3), (2.1 + H_LOW) / 2 + 0.02, az(B.z1) + 0.15 + 0.005);
    scene.add(logo);
  }

  // printer paper (not merged, shown while somebody prints)
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.22), L(0xffffff));
  paper.position.set(ax(PR.x - 0.52), 0.85, az(PR.z));
  paper.visible = false;
  const printerItem = items.find((it) => it.id === 'printer');
  if (printerItem) {
    // rides on the printer when that is moved
    paper.position.x -= printerItem.base.x;
    paper.position.z -= printerItem.base.z;
    printerItem.holder.add(paper);
  } else scene.add(paper);
  const printer = { stand: printerStand, paper };

  const meeting = { doorPos: { x: ax(20.65), z: az(CORR) }, center: meetCenter, seats: meetSeats };
  // the strip south of the wall, east of the annex, is outside: block it so nobody walks out through the entrance doorway into thin air
  blockers.push(new THREE.Box3(new THREE.Vector3(ax(ANNEX.x1), 0, OFFICE_D), new THREE.Vector3(OFFICE_W, 1.2, OFFICE_D + ANNEX_D)));
  const allBlockers = () => [...blockers, ...items.flatMap((it) => it.blockers())];
  // numbered room labels (blue, model coordinates of the room centres)
  const roomLabels = new THREE.Group();
  scene.add(roomLabels);
  [
    [-7.5, 2.0], // Wassermelonen (places 1-7)
    [-7.25, 11.2], // small meeting room (annex)
    [-2.5, -3.2], // storage
    [2.0, -3.2], // washroom
    [7.25, -3.2], // kitchen
    [14.5, -3.2], // archive
    [22.0, -3.5], // dark room
    [23.0, 6.0], // glass meeting room
  ].forEach(([x, z], i) => {
    const tex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#1f6fd0';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.font = 'bold 84px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(i + 1), w / 2, h / 2 + 4);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sp.position.set(ax(x), 2.2, az(z));
    sp.scale.set(0.6, 0.6, 1);
    sp.renderOrder = 999;
    roomLabels.add(sp);
  });

  return { desks, items, coatRacks, blockers: allBlockers, roof: staticRoof, entrance: door, doors, foosball: foosStands, printer, rowLabels, roomLabels, meeting, pod: { center: podCenter, seats: podSeats }, kitchen: { center: kitchenCenter, machine: kitchenMachine, stands: kitchenStands, table: tableSeats }, phoneBooth: { seat: boothSeat, doorPos: { x: ax(23.75), z: az(CZ) } } };
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
