import { DOOR, DOOR_LANES } from './Door';
import { CasualChat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { Presence } from './Presence';
import { CYCLE_SECONDS, cycleOf } from './TimeOfDay';
import type { Weather } from './Weather';
import { stream } from './rng';

/** Game seconds one clock hour of the working day takes at 1× (08:00–18:00 fill 54% of the cycle). */
export const GAME_HOUR = ((cycleOf(18) - cycleOf(8)) / 10) * CYCLE_SECONDS;

/**
 * Smoke breaks, in game seconds. `every` (1.5–2.5 clock hours) counts only while the smoker is in the office.
 * `length` is two or three drags: the 4–6 clock minutes of a real cigarette are 2–3 s at 1×, too short for one drag.
 * `retry`: the porch was full, try again 10–20 clock minutes later; `busy`: not free right now (talk, meeting, door busy, before hours), spread out so a backlog does not all go at once.
 * `early`: rain sent them in, seconds until they stub it out.
 */
export const SMOKE = {
  every: [1.5 * GAME_HOUR, 2.5 * GAME_HOUR],
  length: [32, 48],
  retry: [(10 / 60) * GAME_HOUR, (20 / 60) * GAME_HOUR],
  busy: [3, 20],
  /** seconds left of the break when the cigarette is stubbed out (then they walk in) */
  stub: 0.5,
};

/** One drag, seconds into the cycle: raise to the mouth, draw (tip glows), lower a little, hold the breath, exhale. */
const DRAG = { raise: 0.9, draw: 2.4, lower: 3.0, exhale: 4.2 };
/** Seconds from one drag to the next. */
export const DRAG_CYCLE = [15, 20];

/** Diameter (m) of the widest open umbrella on the tallest person: rain spots keep at least this plus a gap apart. */
export const UMBRELLA_DIAMETER = 1.0;
/** Closest two smokers stand when dry: shoulder to shoulder, near enough to chat. */
export const DRY_GAP = 0.8;
/** Seconds an umbrella takes to go up and open, or to fold shut and come down. */
export const UMBRELLA_FOLD = 0.5;
/** How far (m) from the front doorframe an umbrella may be open: the canopy stays off the frame. */
export const UMBRELLA_CLEAR = 0.6;

/** Smoke dice: a stream of their own, so smoke breaks do not shift the rest of the simulation's numbers. */
const smokeDice = stream(0x736d6f6b);
const between = ([a, b]: number[]) => a + smokeDice() * (b - a);
/** Seconds until the next drag (rolled per drag, on the smoke dice). */
export const nextDragCycle = (): number => between(DRAG_CYCLE);

const smooth = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};

/** Where the arm is `t` seconds into a drag cycle: `arm` 0 = hand a little below the mouth .. 1 = at the mouth; `draw` = inhaling; `puff` = seconds since the exhale began (-1 before). */
export function dragAt(t: number): { arm: number; draw: boolean; puff: number } {
  const arm = t < DRAG.raise ? smooth(t / DRAG.raise) : t < DRAG.draw ? 1 : 1 - smooth((t - DRAG.draw) / (DRAG.lower - DRAG.draw));
  return { arm, draw: t >= DRAG.raise && t < DRAG.draw, puff: t >= DRAG.exhale ? t - DRAG.exhale : -1 };
}

/** A place to stand on the porch; `rain`: also used in the rain (the rain spots are far enough apart for open umbrellas). */
export interface PorchSpot extends Vec2 {
  rain: boolean;
}

const [left, right] = DOOR_LANES.map((l) => l.out.x); // the two wings' lanes
/**
 * The smoking spots on the stone porch (3.4 m wide, the door near its middle): beside the door right and left of the
 * two lanes, and in front of where people appear and vanish, so nobody on the way in or out passes them. Dry, all of
 * them (at least DRY_GAP apart); in the rain only those marked (at least UMBRELLA_DIAMETER + 0.2 apart).
 */
export const PORCH_SPOTS: readonly PorchSpot[] = [
  { x: right + 0.95, z: DOOR.z + 0.6, rain: true },
  { x: right + 0.95, z: DOOR.z + 1.45, rain: false },
  { x: right + 0.9, z: DOOR.z + 2.35, rain: true },
  { x: right + 0.05, z: DOOR.z + 2.65, rain: false },
  { x: left + 0.15, z: DOOR.z + 2.65, rain: true },
  { x: left - 0.8, z: DOOR.z + 2.3, rain: false },
  { x: left - 0.8, z: DOOR.z + 0.6, rain: true },
];

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Smokers step out of the front door now and then and smoke on the porch beside it (#169). Who finds another smoker
 * out there stands next to them and they chat. The porch has a fixed set of spots, fewer in the rain (umbrellas): a
 * smoker who finds them all taken tries again later, and rain sends home whoever no rain spot is left for.
 */
export class SmokeBreaks {
  /** the chat of the smokers standing on the porch (two or more), null otherwise */
  chat: CasualChat | null = null;
  private due = new Map<Person, number>();
  private readonly smokers: Person[];

  constructor(
    people: readonly Person[],
    private presence: Presence,
    private weather: Weather,
  ) {
    this.smokers = people.filter((p) => p.member.smoke);
    for (const p of this.smokers) this.due.set(p, between(SMOKE.every));
  }

  /** Spots in use right now (dry: all of them, rain: the rain spots). */
  get spots(): readonly PorchSpot[] {
    return this.weather.raining ? PORCH_SPOTS.filter((s) => s.rain) : PORCH_SPOTS;
  }

  private taken(spot: PorchSpot): boolean {
    return this.smokers.some((p) => p.porchSpot === spot);
  }

  /** A free spot, next to somebody already out there (they will chat), else the one closest to the door. Null: the porch is full. */
  freeSpot(): PorchSpot | null {
    const free = this.spots.filter((s) => !this.taken(s));
    const busy = PORCH_SPOTS.filter((s) => this.taken(s));
    if (!free.length) return null;
    if (!busy.length) return free[0];
    const near = (s: PorchSpot) => Math.min(...busy.map((b) => dist(b, s)));
    return free.reduce((a, b) => (near(b) < near(a) ? b : a));
  }

  /** The next break is due now (tests, and whoever wants to see one). */
  urge(p: Person): void {
    this.due.set(p, 0);
  }

  /** Out for a cigarette now, if they may and the porch has room. */
  start(p: Person, nav: NavGrid): 'ok' | 'busy' | 'full' {
    if (!p.member.smoke || !this.presence.maySmoke(p)) return 'busy';
    const spot = this.freeSpot();
    if (!spot) return 'full';
    if (!this.presence.smokeBreak(p, nav, between(SMOKE.length))) return 'busy';
    p.porchSpot = spot;
    this.due.set(p, between(SMOKE.every));
    return 'ok';
  }

  update(dt: number, nav: NavGrid): void {
    for (const p of this.smokers) {
      if (p.presence !== 'in') continue;
      const left = (this.due.get(p) ?? 0) - dt;
      this.due.set(p, left);
      if (left > 0) continue;
      const r = this.start(p, nav);
      if (r !== 'ok') this.due.set(p, between(r === 'full' ? SMOKE.retry : SMOKE.busy));
    }
    if (this.weather.raining) this.makeRoomForUmbrellas();
    this.updateChat(dt);
  }

  /** Rain: whoever stands (or is heading) on a dry-only spot moves to a free rain spot, or finishes up and comes in. */
  private makeRoomForUmbrellas(): void {
    for (const p of this.smokers) {
      const spot = p.porchSpot;
      if (!spot || spot.rain) continue;
      const free = PORCH_SPOTS.filter((s) => s.rain && !this.taken(s));
      if (free.length) {
        p.movePorchSpot(free.reduce((a, b) => (dist(b, spot) < dist(a, spot) ? b : a)));
      } else if (p.beforeDoor) {
        p.cancelLeave(); // not out yet: stays in, tries again later
        this.due.set(p, between(SMOKE.retry));
      } else {
        p.porchSpot = null; // leaves the spot at once, so no two umbrellas overlap
        this.presence.hurryIn(p);
      }
    }
  }

  /** Two or more smokers standing out there chat; who goes in drops out of it. */
  private updateChat(dt: number): void {
    const standing = this.smokers.filter((p) => p.atPorchSpot);
    const chat = this.chat;
    // who went in (or everybody, once fewer than two are left) drops out of it
    for (const m of chat?.members ?? []) {
      if (standing.length >= 2 && standing.includes(m)) continue;
      if (m.talk === chat) m.talk = null;
      m.speaking = false;
    }
    if (standing.length < 2) {
      this.chat = null;
      return;
    }
    const c = (this.chat ??= new CasualChat(standing, { x: 0, z: 0 }));
    c.members = standing;
    for (const m of standing) m.talk = c;
    c.center.x = standing.reduce((s, p) => s + p.pos.x, 0) / standing.length;
    c.center.z = standing.reduce((s, p) => s + p.pos.z, 0) / standing.length;
    c.update(dt);
  }

}
