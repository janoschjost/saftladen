import { fxRandom } from '../game/rng';
import type { Vec2 } from './behaviors';

/** A walk along waypoints: where somebody is after `d` metres, and which way they face (yaw 0 = +z). */
export class Path {
  readonly length: number;
  private readonly cum: number[] = [0];

  constructor(readonly points: readonly Vec2[]) {
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    this.length = this.cum[this.cum.length - 1];
  }

  at(d: number): { x: number; z: number; yaw: number } {
    const p = this.points;
    const dist = Math.min(Math.max(d, 0), this.length);
    let i = 1;
    while (i < p.length - 1 && this.cum[i] < dist) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const k = (dist - this.cum[i - 1]) / seg;
    const dx = p[i][0] - p[i - 1][0];
    const dz = p[i][1] - p[i - 1][1];
    return { x: p[i - 1][0] + dx * k, z: p[i - 1][1] + dz * k, yaw: Math.atan2(dx, dz) };
  }
}

export interface ClawdPlan {
  /** where he sits (world metres, y = his feet) and which way he faces */
  seat: { x: number; y: number; z: number; yaw: number };
  /** the way over the floor to where he talks (x, z), starting where he stands up from his seat */
  path: Path;
  /** which way he faces when he talks */
  talkYaw: number;
}

export type ClawdPhase = 'work' | 'stand' | 'walk' | 'talk' | 'back' | 'sit';

export interface ClawdState {
  phase: ClawdPhase;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** 0..1: in mid air (always 0 now, kept for the pose) */
  air: number;
  /** on his feet and walking */
  moving: boolean;
  /** how he holds himself: seated at the laptop, upright, or talking */
  look: 'sit' | 'stand' | 'talk';
  /** the speech bubble to show, and how far into it (0..1) */
  bubble: { index: number; u: number } | null;
}

export const BUBBLES = 3; // bubbles per talk
export const BUBBLE_SECONDS = 2.6;
const WALK = 0.9; // metres per second on the floor
const turn = (a: number, b: number, k: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Now and then Clawd stops working: he stands up, walks round the blueprint to a spot where he can be seen, tells a few
 * code bubbles, walks back and sits down to his laptop again.
 */
export class ClawdRoutine {
  phase: ClawdPhase = 'work';
  private t = 0;
  private wait: number;
  /** how many bubbles he told so far, so each talk starts with a different one */
  private told = 0;

  constructor(
    private readonly plan: ClawdPlan,
    firstWait = 14,
    private readonly rnd: () => number = fxRandom,
  ) {
    this.wait = firstWait;
  }

  private go(phase: ClawdPhase): void {
    this.phase = phase;
    this.t = 0;
  }

  step(dt: number): ClawdState {
    const { seat, path, talkYaw } = this.plan;
    this.t += dt;
    const t = this.t;
    const phase = this.phase;
    const start = path.at(0);
    const out = (x: number, y: number, z: number, yaw: number, extra: Partial<ClawdState> = {}): ClawdState => ({ phase, x, y, z, yaw, air: 0, moving: false, look: 'stand', bubble: null, ...extra });
    const toPath = path.at(0.3).yaw;
    switch (phase) {
      case 'work':
        if (t >= this.wait) this.go('stand');
        return out(seat.x, seat.y, seat.z, seat.yaw, { look: 'sit' });
      case 'stand': {
        // gets up off the stool and onto his feet, turning to where he is going
        const u = smooth(Math.min(1, t / 0.6));
        if (t >= 0.6) this.go('walk');
        return out(seat.x + (start.x - seat.x) * u, seat.y * (1 - u), seat.z + (start.z - seat.z) * u, turn(seat.yaw, toPath, u));
      }
      case 'walk': {
        const d = Math.min(path.length, t * WALK);
        const at = path.at(d);
        if (d >= path.length) this.go('talk');
        return out(at.x, 0, at.z, at.yaw, { moving: true });
      }
      case 'talk': {
        const end = path.at(path.length);
        const total = BUBBLES * BUBBLE_SECONDS;
        const turned = turn(end.yaw, talkYaw, smooth(Math.min(1, t / 0.6)));
        const slot = Math.min(BUBBLES - 1, Math.floor(t / BUBBLE_SECONDS));
        const u = (t - slot * BUBBLE_SECONDS) / BUBBLE_SECONDS;
        const bubble = t >= 0.6 && t < total ? { index: this.told + slot, u: Math.min(1, u) } : null;
        if (t >= total + 0.5) {
          this.told += BUBBLES;
          this.go('back');
        }
        return out(end.x, 0, end.z, turned, { look: 'talk', bubble });
      }
      case 'back': {
        const d = Math.max(0, path.length - t * WALK);
        const at = path.at(d);
        if (d <= 0) this.go('sit');
        return out(at.x, 0, at.z, at.yaw + Math.PI, { moving: true });
      }
      case 'sit': {
        // turns to the laptop and sits down again
        const u = smooth(Math.min(1, t / 0.6));
        if (t >= 0.6) {
          this.wait = 22 + this.rnd() * 16;
          this.go('work');
        }
        return out(start.x + (seat.x - start.x) * u, seat.y * u, start.z + (seat.z - start.z) * u, turn(toPath + Math.PI, seat.yaw, u));
      }
    }
  }
}
