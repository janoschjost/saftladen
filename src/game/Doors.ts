import { DOOR_SWING, type DoorRig } from '../render/officeModel';

/** how close somebody has to be to push a door open (metres) */
const TRIGGER = 1.25;
/** door stays open this long after the last person passed (seconds) */
const HOLD = 0.9;

interface State {
  rig: DoorRig;
  open: number;
  /** where the door rests when nobody is around: closed, ajar or propped wide open */
  rest: number;
  hold: number;
  reroll: number;
  /** shut and kept shut (a meeting is going on behind it) */
  locked: boolean;
}

const pickRest = (): number => {
  const r = Math.random();
  return r < 0.5 ? 0 : r < 0.7 ? 0.3 : 1;
};
const nextReroll = (): number => 30 + Math.random() * 90;

/** Interior doors: swing open when somebody walks through, otherwise rest closed, ajar or propped open. */
export class Doors {
  private states: State[];

  constructor(rigs: DoorRig[]) {
    this.states = rigs.map((rig) => {
      const rest = pickRest();
      const s = { rig, open: rest, rest, hold: 0, reroll: Math.random() * 90, locked: false };
      this.apply(s);
      return s;
    });
  }

  update(dt: number, positions: Array<{ x: number; z: number }>): void {
    for (const s of this.states) {
      const c = s.rig.center;
      const near = positions.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < TRIGGER);
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
      this.apply(s);
    }
  }

  /** The door the player is facing within `reach` metres, if any. */
  facing(x: number, z: number, dx: number, dz: number, reach = 2.2): { open: boolean; locked: boolean; toggle: () => void } | null {
    let best: State | null = null;
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
    let best: State | null = null;
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

  private apply(s: State): void {
    s.rig.pivot.rotation.y = s.rig.base + s.rig.swing * s.open * DOOR_SWING;
  }
}
