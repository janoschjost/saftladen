import type { BuildMark, BuildPhase } from './BlueprintOffice';

/** A rectangle on the floor (x, z in metres); z grows towards the camera. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Clawd walks a loop around the pad. `s` is the distance along it in metres, 0 at the front left corner, going right along the front edge. */
export const perimeterLength = (r: Rect): number => 2 * (r.x1 - r.x0 + (r.z1 - r.z0));

/** Where `s` is on the loop, and which way is outwards there. */
export function perimeterAt(r: Rect, s: number): { x: number; z: number; nx: number; nz: number } {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const L = perimeterLength(r);
  const u = ((s % L) + L) % L;
  if (u < w) return { x: r.x0 + u, z: r.z1, nx: 0, nz: 1 }; // front, to the right
  if (u < w + d) return { x: r.x1, z: r.z1 - (u - w), nx: 1, nz: 0 }; // right, away from the camera
  if (u < 2 * w + d) return { x: r.x1 - (u - w - d), z: r.z0, nx: 0, nz: -1 }; // back, to the left
  return { x: r.x0, z: r.z0 + (u - 2 * w - d), nx: -1, nz: 0 }; // left, towards the camera
}

/** The point of the loop closest to (x, z). */
export function perimeterNearest(r: Rect, x: number, z: number): number {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = Math.min(r.x1, Math.max(r.x0, x));
  const cz = Math.min(r.z1, Math.max(r.z0, z));
  const edges = [
    { dist: Math.abs(z - r.z1), s: cx - r.x0 },
    { dist: Math.abs(x - r.x1), s: w + (r.z1 - cz) },
    { dist: Math.abs(z - r.z0), s: w + d + (r.x1 - cx) },
    { dist: Math.abs(x - r.x0), s: 2 * w + d + (cz - r.z0) },
  ];
  return edges.reduce((best, e) => (e.dist < best.dist ? e : best)).s;
}

/** The piece that appeared last at this build level (`marks` sorted by `order`), if any has appeared yet. */
export function latestMark(marks: readonly BuildMark[], level: number): BuildMark | undefined {
  let lo = 0;
  let hi = marks.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (marks[mid].order <= level) lo = mid + 1;
    else hi = mid;
  }
  return lo > 0 ? marks[lo - 1] : undefined;
}

export type ClawdMode = 'walk' | 'build' | 'cheer' | 'wait';

const SPEED = 1.5; // metres per second
const RETARGET = 0.9; // seconds: he picks a new piece to head for this often, not on every piece
const CHEER = 2; // seconds of jumping for joy when the build is done
const SPIN = 0.9; // seconds of spinning when poked

/**
 * What Clawd does around the blueprint: he follows the piece that is appearing, along the pad's edge, celebrates when it is
 * finished, waits while it holds and goes back to his corner while it melts away.
 */
export class Clawd {
  /** distance along the loop; he starts at the front left corner */
  s = 0;
  mode: ClawdMode = 'wait';
  /** which way he last walked along the loop (+1 right/clockwise seen from above, -1 back) */
  dir = 1;
  /** seconds of spin left after a poke */
  spin = 0;
  /** how often he was poked, for the test hook */
  pokes = 0;
  private target = 0;
  private retargetIn = 0;
  private cheerLeft = 0;
  private cheered = false;

  constructor(private readonly rect: Rect) {}

  poke(): void {
    this.spin = SPIN;
    this.pokes++;
  }

  step(dt: number, phase: BuildPhase, level: number, marks: readonly BuildMark[]): void {
    const L = perimeterLength(this.rect);
    if (phase === 'build') {
      this.cheered = false;
      this.retargetIn -= dt;
      if (this.retargetIn <= 0) {
        const m = latestMark(marks, level);
        if (m) this.target = perimeterNearest(this.rect, m.x, m.z);
        this.retargetIn = RETARGET;
      }
    } else if (phase === 'hold') {
      if (!this.cheered) {
        this.cheered = true;
        this.cheerLeft = CHEER;
      }
    } else {
      this.target = 0;
      this.cheered = false;
      this.retargetIn = 0;
    }
    this.cheerLeft = Math.max(0, this.cheerLeft - dt);
    this.spin = Math.max(0, this.spin - dt);

    // the short way round the loop
    let delta = (((this.target - this.s) % L) + L) % L;
    if (delta > L / 2) delta -= L;
    const walking = phase !== 'hold' && Math.abs(delta) > 0.02;
    if (walking) {
      this.dir = Math.sign(delta);
      this.s += this.dir * Math.min(Math.abs(delta), SPEED * dt);
      this.s = ((this.s % L) + L) % L;
      this.mode = 'walk';
    } else if (phase === 'build') this.mode = 'build';
    else this.mode = phase === 'hold' && this.cheerLeft > 0 ? 'cheer' : 'wait';
  }

  /** where he stands and which way he looks: along his way while walking, at the pad otherwise */
  place(): { x: number; z: number; yaw: number } {
    const p = perimeterAt(this.rect, this.s);
    const ahead = perimeterAt(this.rect, this.s + this.dir * 0.05);
    const yaw = this.mode === 'walk' ? Math.atan2(ahead.x - p.x, ahead.z - p.z) : Math.atan2(-p.nx, -p.nz);
    return { x: p.x, z: p.z, yaw };
  }
}
