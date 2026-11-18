import { fxRandom } from '../game/rng';

/** A point on the floor (x, z) in metres. */
export type Vec2 = readonly [number, number];

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

/**
 * Kurt's way from his chair to the right end of the big desk, in his workstation's coordinates (the chair is the
 * origin, 1 unit = 1/MINI metre): out right of the chair, past his tiny desk, then along the front edge to where he jumps.
 */
export const KURT_TO_EDGE = new Path([[0, 0], [0.5, -0.05], [1.0, 0.4], [1.0, 2.5], [6.5, 2.5]]);

export type DogStep =
  | { kind: 'rest'; d: number }
  | { kind: 'walk'; to: Vec2 }
  | { kind: 'play'; d: number }
  | { kind: 'sniff'; d: number };

/** Where Ellie may wander: the open floor in front of the desks. */
export const DOG_AREA = { x: [2.4, 3.7], z: [1.5, 2.2] } as const;

const between = (r: () => number, [a, b]: readonly [number, number]) => a + r() * (b - a);

/** One outing: get up from the rest spot, one or two stops (play or sniff the floor), back home, lie down. */
export function planTrip(home: Vec2, rnd: () => number = fxRandom): DogStep[] {
  const steps: DogStep[] = [{ kind: 'rest', d: 6 + rnd() * 6 }];
  const stops = rnd() < 0.5 ? 1 : 2;
  for (let i = 0; i < stops; i++) {
    steps.push({ kind: 'walk', to: [between(rnd, DOG_AREA.x), between(rnd, DOG_AREA.z)] });
    steps.push(rnd() < 0.6 ? { kind: 'play', d: 4 + rnd() * 2 } : { kind: 'sniff', d: 2 + rnd() * 1.5 });
  }
  steps.push({ kind: 'walk', to: home });
  return steps;
}
