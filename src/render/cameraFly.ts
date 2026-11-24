/**
 * Camera flights of the Orbit view (Aktionen): a shot is a floor point the camera looks at plus where it looks from
 * (azimuth around the point, polar angle from straight down, distance). Flights blend two shots; the azimuth takes the
 * shorter way round. Pure maths, no Three.js, so it can be tested in Node.
 */

/** seconds a flight to a place, a person or the overview takes */
export const FLY_TIME = 1.4;
/** while following the lead person of an action the camera is this many times closer than the overview */
export const FOLLOW_ZOOM = 2;
/** polar angle (radians from straight down) of action shots: steep enough to look over the interior walls */
export const ACTION_POLAR = 0.72;
/** how fast the camera trails a moving person once a flight has arrived (1/s) */
export const TRAIL = 4;
/** metres from the place: the lead counts as arrived, the camera settles on the place */
export const ARRIVE_RADIUS = 3;

export interface Shot {
  /** target on the floor (metres) */
  x: number;
  z: number;
  /** height of the target */
  y: number;
  /** radians around the target; 0 = camera on the +z side (front of the office), positive turns towards +x */
  azimuth: number;
  /** radians from straight down (0 = top-down) */
  polar: number;
  /** metres from the target */
  dist: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const TAU = Math.PI * 2;

/** Wraps an angle into [-PI, PI). */
export function wrapAngle(a: number): number {
  return ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Blends two angles the shorter way round: from 170° to -170° goes through 180°, not through 0°. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t;
}

/** Smooth start and stop (cubic). */
export function easeInOut(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
}

/** How a flight speeds up and slows down: the Aktionen use `inOut`, the show also drifts (`linear`) and glides in (`out`). */
export type Ease = 'inOut' | 'linear' | 'out';

export const EASE: Record<Ease, (t: number) => number> = {
  inOut: easeInOut,
  linear: (t) => Math.min(1, Math.max(0, t)),
  out: (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3,
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The shot `t` (0..1) of the way from `a` to `b`. The distance blends in log space, so zooming feels even. */
export function blendShot(a: Shot, b: Shot, t: number): Shot {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    z: lerp(a.z, b.z, t),
    azimuth: lerpAngle(a.azimuth, b.azimuth, t),
    polar: lerp(a.polar, b.polar, t),
    dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), t)),
  };
}

/** Where the camera stands for a shot. */
export function shotPosition(s: Shot): Vec3 {
  const flat = Math.sin(s.polar) * s.dist;
  return { x: s.x + Math.sin(s.azimuth) * flat, y: s.y + Math.cos(s.polar) * s.dist, z: s.z + Math.cos(s.azimuth) * flat };
}

/** The shot of a camera at `pos` looking at `target`. */
export function shotFrom(pos: Vec3, target: Vec3): Shot {
  const dx = pos.x - target.x;
  const dy = pos.y - target.y;
  const dz = pos.z - target.z;
  const dist = Math.max(1e-6, Math.hypot(dx, dy, dz));
  return { x: target.x, y: target.y, z: target.z, azimuth: Math.atan2(dx, dz), polar: Math.acos(Math.min(1, Math.max(-1, dy / dist))), dist };
}

/** a point of a camera path */
export interface PathKey extends Shot {
  t: number;
}

/**
 * Where a camera is at second `t` on a path through `keys` (in time order): one smooth curve that passes every key
 * without stopping there (Catmull-Rom, tangents from the neighbours), standing still at the first and the last. The
 * azimuth takes the short way round between keys, the distance blends in log space.
 */
export function samplePath(keys: readonly PathKey[], t: number): Shot {
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  let i = 0;
  while (keys[i + 1].t < t) i++;
  // the azimuths unrolled, so a path may go round more than half a turn
  const az = [keys[0].azimuth];
  for (let k = 1; k < keys.length; k++) az.push(az[k - 1] + wrapAngle(keys[k].azimuth - keys[k - 1].azimuth));
  const dt = keys[i + 1].t - keys[i].t;
  const u = (t - keys[i].t) / dt;
  const channel = (value: (k: number) => number): number => {
    const slope = (k: number) => (k <= 0 || k >= keys.length - 1 ? 0 : (value(k + 1) - value(k - 1)) / (keys[k + 1].t - keys[k - 1].t));
    const u2 = u * u;
    const u3 = u2 * u;
    return (
      (2 * u3 - 3 * u2 + 1) * value(i) +
      (u3 - 2 * u2 + u) * dt * slope(i) +
      (-2 * u3 + 3 * u2) * value(i + 1) +
      (u3 - u2) * dt * slope(i + 1)
    );
  };
  return {
    x: channel((k) => keys[k].x),
    y: channel((k) => keys[k].y),
    z: channel((k) => keys[k].z),
    azimuth: channel((k) => az[k]),
    polar: channel((k) => keys[k].polar),
    dist: Math.exp(channel((k) => Math.log(keys[k].dist))),
  };
}
