import { DOOR_SWING, type DoorRig } from '../render/officeModel';
import { letterOffset, stepLetterSpring, type LetterSpring } from './doorLetters';
import { random } from './rng';

/** how close somebody has to be to push a door open (metres) */
const TRIGGER = 1.25;
/** door stays open this long after the last person passed (seconds) */
const HOLD = 0.9;

/** One door's state; `Doors.states` is readable so tests can look at it. */
export interface DoorState {
  rig: DoorRig;
  open: number;
  /** where the door rests when nobody is around: closed, ajar or propped wide open */
  rest: number;
  hold: number;
  reroll: number;
  /** shut and kept shut (a meeting is going on behind it) */
  locked: boolean;
  /** drives the lettering on the leaf (if any): follows `open` with a little lag and wobble */
  letters: LetterSpring;
}

/** how far past the jambs a route may run and still count as going through the doorway (path waypoints are jittered) */
const DOORWAY_SLACK = 0.25;

/**
 * Somebody the doors can see. Without `path` they open the door by proximity (the player's eye, a steered person);
 * with `path` (the rest of their planned route) only when that route goes through the doorway.
 */
export interface Sight {
  x: number;
  z: number;
  path?: Array<{ x: number; z: number }>;
}

/** True when the line from `at` along `path` crosses the wall of `rig` inside its doorway (entering or leaving). */
function goesThrough(rig: DoorRig, at: { x: number; z: number }, path: Array<{ x: number; z: number }>): boolean {
  const c = rig.center;
  // base 0 = the wall runs along x (the leaf hangs along x), -PI/2 = along z
  const alongX = Math.cos(rig.base) > 0.7;
  const half = rig.width / 2 + DOORWAY_SLACK;
  // along: coordinate along the wall, across: distance from the wall line
  const along = (p: { x: number; z: number }) => (alongX ? p.x - c.x : p.z - c.z);
  const across = (p: { x: number; z: number }) => (alongX ? p.z - c.z : p.x - c.x);
  let a = at;
  for (const b of path) {
    const da = across(a);
    const db = across(b);
    if (da * db <= 0 && da !== db) {
      const t = da / (da - db);
      if (Math.abs(along(a) + (along(b) - along(a)) * t) <= half) return true;
    }
    a = b;
  }
  return false;
}

const pickRest = (): number => {
  const r = random();
  return r < 0.5 ? 0 : r < 0.7 ? 0.3 : 1;
};
const nextReroll = (): number => 30 + random() * 90;

/** Interior doors: swing open when somebody walks through, otherwise rest closed, ajar or propped open. */
export class Doors {
  readonly states: DoorState[];
  private letteredOpen = false;

  constructor(rigs: DoorRig[]) {
    this.states = rigs.map((rig) => {
      const rest = pickRest();
      const s = { rig, open: rest, rest, hold: 0, reroll: random() * 90, locked: false, letters: { x: rest, v: 0 } };
      this.apply(s, 0);
      return s;
    });
  }

  update(dt: number, sights: Sight[]): void {
    for (const s of this.states) {
      const c = s.rig.center;
      const near = sights.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < TRIGGER && (!p.path || goesThrough(s.rig, p, p.path)));
      if (near) s.hold = HOLD;
      else {
        s.hold = Math.max(0, s.hold - dt);
        s.reroll -= dt;
        if (s.reroll <= 0) {
          s.rest = pickRest();
          s.reroll = nextReroll();
        }
      }
      if (s.locked) s.hold = 0;
      const target = s.locked ? 0 : s.hold > 0 ? 1 : s.rest;
      s.open += (target - s.open) * Math.min(1, dt * (target > s.open ? 5 : 3));
      this.apply(s, dt);
    }
  }

  /** The door the player is facing within `reach` metres, if any. */
  facing(x: number, z: number, dx: number, dz: number, reach = 2.2): { open: boolean; locked: boolean; toggle: () => void } | null {
    let best: DoorState | null = null;
    let bestD = reach;
    for (const s of this.states) {
      const vx = s.rig.center.x - x;
      const vz = s.rig.center.z - z;
      const d = Math.hypot(vx, vz);
      if (d >= bestD || (d > 0.5 && (vx * dx + vz * dz) / d < 0.6)) continue;
      best = s;
      bestD = d;
    }
    if (!best) return null;
    const s = best;
    return {
      open: s.open > 0.5,
      locked: s.locked,
      toggle: () => {
        if (s.locked) return;
        // the player's choice holds for a good while; people walking through still push it open
        s.rest = s.open > 0.5 ? 0 : 1;
        s.hold = 0;
        s.reroll = 60;
      },
    };
  }

  /** Keeps the door nearest to `at` shut (or releases it). */
  setLocked(at: { x: number; z: number }, locked: boolean): void {
    let best: DoorState | null = null;
    let bestD = 1;
    for (const s of this.states) {
      const d = Math.hypot(s.rig.center.x - at.x, s.rig.center.z - at.z);
      if (d < bestD) {
        best = s;
        bestD = d;
      }
    }
    if (best) best.locked = locked;
  }

  /** Swings every door under the wall lettering open (first call), or shut again (next call); dev event / feature URL for #10. */
  toggleLettered(): boolean {
    const open = (this.letteredOpen = !this.letteredOpen);
    for (const s of this.states) {
      if (!s.rig.letters?.length || s.locked) continue;
      s.rest = open ? 1 : 0;
      s.hold = 0;
      s.reroll = 60;
    }
    return open;
  }

  private apply(s: DoorState, dt: number): void {
    s.rig.pivot.rotation.y = s.rig.base + s.rig.swing * s.open * DOOR_SWING;
    const letters = s.rig.letters;
    if (!letters?.length) return;
    stepLetterSpring(s.letters, s.open, dt);
    for (const l of letters) {
      const o = letterOffset(l.i, s.letters);
      l.mesh.position.x = l.x + o.x;
      l.mesh.position.y = l.y + o.y;
      l.mesh.rotation.z = o.rot;
    }
  }
}
