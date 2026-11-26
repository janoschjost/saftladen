import type { ViewMode } from './Views';

/** The views a player can pick (keys 1-4, the settings, a deep link); `third` belongs to the day mode. */
export const PICKABLE: readonly ViewMode[] = ['iso', 'orbit', 'plan', 'walk'];
export const DEFAULT_MODE: ViewMode = 'orbit';

/** The view a request ends up in: walk mode needs a mouse and keys, so a touch screen gets Orbit instead. */
export function allowedView(mode: ViewMode, touch: boolean): ViewMode {
  return touch && mode === 'walk' ? DEFAULT_MODE : mode;
}

/**
 * The deep link of the page: `#iso` `#orbit` `#plan` `#walk` `#walk@x,z,yaw` (game metres, radians). Anything else
 * opens the default view; on a touch screen `#walk` opens Orbit. `at` is where the walk view stands (yaw NaN: not given).
 */
export function startView(hash: string, touch: boolean): { mode: ViewMode; at: { x: number; z: number; yaw: number } | null } {
  const [h, place] = hash.replace(/^#/, '').split('@');
  const asked = PICKABLE.includes(h as ViewMode) ? (h as ViewMode) : DEFAULT_MODE;
  const n = (place ?? '').split(',');
  // a missing yaw is NaN: the walk view keeps the way it faces
  return { mode: allowedView(asked, touch), at: place ? { x: Number(n[0]), z: Number(n[1]), yaw: Number(n[2]) } : null };
}

/** The view button of the phone bar: Iso, Orbit and Grundriss in turn (walk mode is not offered on touch). */
export function nextView(mode: ViewMode): ViewMode {
  const ring: ViewMode[] = ['iso', 'orbit', 'plan'];
  return ring[(ring.indexOf(mode) + 1) % ring.length];
}
