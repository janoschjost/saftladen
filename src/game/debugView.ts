import type { NavGrid, Vec2 } from './NavGrid';

/** The parts of a walker the debug overlays read (a Person or a pet); plain objects work in tests. */
export interface DebugWalker {
  id: string;
  away?: boolean;
  state: string;
  path: readonly Vec2[];
  held?: boolean;
  controlled?: boolean;
  // person
  presence?: string;
  awayKind?: string | null;
  inMeeting?: boolean;
  meetPhase?: string | null;
  talk?: unknown;
  playerChat?: unknown;
  printJob?: unknown;
  foosJob?: unknown;
  vapeJob?: unknown;
  coffeeJob?: unknown;
  phoneJob?: unknown;
  run?: unknown;
  snackLeft?: number;
  task?: { phase: string } | null;
  // pet
  owner?: unknown;
  petted?: unknown;
  sleep?: number;
}

/** What the state label above a walker says: what it is doing right now, in one short word. */
export function describeState(w: DebugWalker): string {
  if (w.owner) return w.away ? 'pet:away' : w.petted ? 'pet:petted' : (w.sleep ?? 0) > 0.5 ? 'pet:sleep' : `pet:${w.state}`;
  if (w.presence && w.presence !== 'in') return `${w.presence}:${w.awayKind ?? '-'}`;
  const act = w.held
    ? 'held'
    : w.controlled
      ? 'steered'
      : w.inMeeting
        ? `meeting:${w.meetPhase ?? '-'}`
        : w.foosJob
          ? 'foosball'
          : w.printJob
            ? 'print'
            : w.coffeeJob
              ? 'coffee'
              : w.vapeJob
                ? 'vape'
                : w.phoneJob
                  ? 'phone'
                  : w.run
                    ? 'run'
                    : w.talk || w.playerChat
                      ? 'talk'
                      : w.snackLeft
                        ? 'snack'
                        : w.task
                          ? `desk:${w.task.phase}`
                          : 'wander';
  return `${act} · ${w.state}`;
}

/** One walker's current path as points: where it is now, then each waypoint still ahead. Empty when it stands still. */
export function pathPoints(w: Pick<DebugWalker, 'away' | 'path'>, at: Vec2): Vec2[] {
  if (w.away || !w.path.length) return [];
  return [at, ...w.path];
}

/** The nav grid as the overlay shows it: one RGBA pixel per cell (row = z), walkable green, blocked red. */
export function gridPixels(nav: Pick<NavGrid, 'cols' | 'rows' | 'walkable'>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(nav.cols * nav.rows * 4);
  for (let z = 0; z < nav.rows; z++) {
    for (let x = 0; x < nav.cols; x++) {
      const i = (z * nav.cols + x) * 4;
      const ok = nav.walkable(x, z);
      out[i] = ok ? 60 : 230;
      out[i + 1] = ok ? 200 : 50;
      out[i + 2] = ok ? 120 : 40;
      out[i + 3] = ok ? 70 : 170;
    }
  }
  return out;
}
