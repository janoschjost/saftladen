import * as THREE from 'three';

/** Real seconds for one full 24 h cycle. */
const CYCLE_SECONDS = 600;
/** Cycle position at the start of the game (10:00). */
const START = 0.308;
/**
 * Cycle position -> clock hour. The night (21:00 - 05:00) is squeezed into a small slice of the cycle,
 * so the clock races through it while the working day takes most of the slider.
 */
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.07, 5],
  [0.2, 8],
  [0.74, 18],
  [0.93, 21],
  [1, 24],
];

/** Clock speeds the player can pick: 1x = one day in `CYCLE_SECONDS`. */
export const SPEEDS = [1, 10, 25] as const;
export type Speed = (typeof SPEEDS)[number];
/** Days of the week, Monday first (`TimeOfDay.weekday` indexes this). */
export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

export function hourOf(cycle: number): number {
  for (let i = 1; i < ANCHORS.length; i++) {
    const [c1, h1] = ANCHORS[i];
    if (cycle <= c1) {
      const [c0, h0] = ANCHORS[i - 1];
      return h0 + ((cycle - c0) / (c1 - c0)) * (h1 - h0);
    }
  }
  return 24;
}

/** Clock hour -> cycle position (the inverse of `hourOf`): where an hour sits on the time slider. */
export function cycleOf(hour: number): number {
  const h = Math.min(24, Math.max(0, hour));
  for (let i = 1; i < ANCHORS.length; i++) {
    const [c1, h1] = ANCHORS[i];
    if (h <= h1) {
      const [c0, h0] = ANCHORS[i - 1];
      return c0 + ((h - h0) / (h1 - h0)) * (c1 - c0);
    }
  }
  return 1;
}

/** Day / night clock: drives the light, who is in the office and how tired everybody looks. */
export class TimeOfDay {
  /** 0..1 position in the cycle (0 = midnight); the slider moves this */
  cycle = START;
  /** the clock advances by itself (false = paused) */
  auto = true;
  /** how fast the game runs while `auto` (one of SPEEDS); `Game` scales the time it hands to `update` and the simulation by it */
  speed: Speed = 1;
  /** 0 = Monday .. 6 = Sunday; moves on at midnight */
  weekday = 0;
  /** counts the player's jumps in time (dial, slider, weekday): Presence then puts everybody where the new time wants them */
  jumps = 0;
  /** counts the days the player picked: Presence rolls fresh plans for each */
  picks = 0;
  hour = 0;
  /** 0 = dark night .. 1 = full daylight */
  day = 1;
  /** 0 = fresh .. 1 = dead tired */
  tired = 0;
  /** true while it is dark enough for the night shift (with hysteresis, so the slider does not flicker) */
  night = false;

  constructor() {
    this.refresh();
    this.night = this.day < 0.45;
  }

  update(dt: number): void {
    if (!this.auto) return;
    const c = this.cycle + dt / CYCLE_SECONDS; // `dt` is game time: Game already scaled it by `speed`
    if (c >= 1) this.weekday = (this.weekday + 1) % WEEKDAYS.length; // past midnight: the next day
    this.setCycle(c);
  }

  /** The player jumps to another time of the same day: light and night state follow at once, people via `jumps`. */
  jumpTo(cycle: number): void {
    this.setCycle(cycle);
    this.night = this.day < 0.45;
    this.jumps++;
  }

  /** Clock hour (0..24) -> `jumpTo`. */
  jumpToHour(hour: number): void {
    this.jumpTo(cycleOf(((hour % 24) + 24) % 24)); // hours wrap around midnight
  }

  /** The player picks a day of the week: a fresh working day at the same time of day. */
  pickWeekday(day: number): void {
    this.weekday = ((Math.round(day) % WEEKDAYS.length) + WEEKDAYS.length) % WEEKDAYS.length;
    this.picks++;
    this.jumps++;
  }

  get weekdayName(): string {
    return WEEKDAYS[this.weekday];
  }

  setCycle(c: number): void {
    this.cycle = ((c % 1) + 1) % 1;
    this.refresh();
  }

  get clock(): string {
    const total = Math.floor(this.hour * 60 + 1e-6); // a jump to 23:00 lands a hair below it
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private refresh(): void {
    this.hour = hourOf(this.cycle);
    this.day = smooth(5, 8, this.hour) * (1 - smooth(17.5, 21, this.hour));
    if (!this.night && this.day < 0.35) this.night = true;
    else if (this.night && this.day > 0.55) this.night = false;
    this.tired = 0.08 + 0.92 * (1 - this.day);
  }
}

export interface SkyRig {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** background colour at full daylight */
  dayBackground: THREE.Color;
}

const NIGHT_BG = new THREE.Color('#0f1329');
const SUN_WHITE = new THREE.Color('#ffffff');
const SUN_LOW = new THREE.Color('#ffb070');
const MOON = new THREE.Color('#8fa8ff');
const SKY_DAY = new THREE.Color('#ffffff');
const SKY_NIGHT = new THREE.Color('#5a6fb8');
const GROUND_DAY = new THREE.Color('#c9b8a4');
const GROUND_NIGHT = new THREE.Color('#1b2036');
const tmp = new THREE.Color();
const tmp2 = new THREE.Color();

/** Light, sun (moon at night) and background for the current time. */
export function applySky(t: TimeOfDay, rig: SkyRig): void {
  const d = t.day;
  // sun arc between 06:00 and 20:00; the moon takes over when it is down
  const a = THREE.MathUtils.clamp(((t.hour - 6) / 14) * Math.PI, 0.05, Math.PI - 0.05);
  const low = 1 - clamp01(Math.sin(a) * 2.4);
  const target = rig.sun.target.position;
  const W = target.x * 2;
  const D = target.z * 2;
  const sunX = W * 0.4 - Math.cos(a) * W * 0.9;
  const sunY = 6 + Math.sin(a) * 20;
  rig.sun.position.set(target.x + THREE.MathUtils.lerp(-W * 0.35, sunX, d), THREE.MathUtils.lerp(22, sunY, d), target.z + D * 1.1);
  rig.sun.intensity = 0.3 + d * 1.6;
  tmp.copy(SUN_WHITE).lerp(SUN_LOW, low * d);
  rig.sun.color.copy(MOON).lerp(tmp, d);

  rig.hemi.intensity = 0.5 + d * 0.8;
  rig.hemi.color.copy(SKY_NIGHT).lerp(SKY_DAY, d);
  rig.hemi.groundColor.copy(GROUND_NIGHT).lerp(GROUND_DAY, d);

  tmp2.copy(NIGHT_BG).lerp(rig.dayBackground, d);
  (rig.scene.background as THREE.Color).copy(tmp2);
}
