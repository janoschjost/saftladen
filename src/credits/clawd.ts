import type { BuildMark, BuildPhase } from './BlueprintOffice';

/** The line along the pad's back rim that Clawd walks (x from `x0` to `x1`, at depth `z`, metres on the floor). */
export interface Rim {
  x0: number;
  x1: number;
  z: number;
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

const SPEED = 1.1; // metres per second: deliberate, not rushing
const CHEER = 2.5; // seconds of jumping for joy when the build is done
const SPIN = 0.9; // seconds of spinning when poked
const RETURN_SPEED = 2.2; // back to his corner while the blueprint melts

/**
 * What Clawd does around the blueprint: the build sweeps across the office from left to right and he walks along the back
 * of the pad with it, beaming at the piece that is appearing; when it is done he celebrates, waits while it holds and
 * hurries back to his corner while it melts away.
 */
export class Clawd {
  /** how far along the rim he is (metres from the left end) */
  s = 0;
  mode: ClawdMode = 'wait';
  /** which way he last walked (+1 right, -1 left) */
  dir = 1;
  /** seconds of spin left after a poke */
  spin = 0;
  /** how often he was poked, for the test hook */
  pokes = 0;
  /** the piece that is appearing right now (floor metres), while the build runs */
  aim: { x: number; z: number } | null = null;
  private cheerLeft = 0;
  private cheered = false;

  constructor(private readonly rim: Rim) {}

  poke(): void {
    this.spin = SPIN;
    this.pokes++;
  }

  step(dt: number, phase: BuildPhase, level: number, marks: readonly BuildMark[]): void {
    const width = this.rim.x1 - this.rim.x0;
    let target = 0;
    this.aim = null;
    if (phase === 'build') {
      this.cheered = false;
      const m = latestMark(marks, level);
      if (m) {
        this.aim = { x: m.x, z: m.z };
        target = Math.min(width, Math.max(0, m.x - this.rim.x0));
      } else target = this.s;
    } else if (phase === 'hold') {
      target = this.s;
      if (!this.cheered) {
        this.cheered = true;
        this.cheerLeft = CHEER;
      }
    } else this.cheered = false;
    this.cheerLeft = Math.max(0, this.cheerLeft - dt);
    this.spin = Math.max(0, this.spin - dt);

    const delta = target - this.s;
    if (Math.abs(delta) > 0.02) {
      this.dir = Math.sign(delta);
      this.s += this.dir * Math.min(Math.abs(delta), (phase === 'melt' || phase === 'rest' ? RETURN_SPEED : SPEED) * dt);
      this.mode = 'walk';
    } else if (phase === 'build' && this.aim) this.mode = 'build';
    else this.mode = phase === 'hold' && this.cheerLeft > 0 ? 'cheer' : 'wait';
  }

  /** where he stands and which way he looks: along his way while walking, at the piece he builds, otherwise at the camera */
  place(): { x: number; z: number; yaw: number } {
    const x = this.rim.x0 + this.s;
    const { z } = this.rim;
    const yaw = this.mode === 'walk' ? this.dir * (Math.PI / 2) : this.mode === 'build' && this.aim ? Math.atan2(this.aim.x - x, this.aim.z - z) : 0;
    return { x, z, yaw };
  }
}
