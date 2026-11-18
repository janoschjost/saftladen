import { fxRandom } from '../game/rng';

/** A point on the floor (x, z) in metres. */
export type Vec2 = readonly [number, number];

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
