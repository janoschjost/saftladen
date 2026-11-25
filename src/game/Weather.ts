import { random } from './rng';
import { SEASON_PROFILE, type Season } from './Season';
export type WeatherMode = 'auto' | 'sun' | 'rain' | 'snow' | 'storm';
/** What falls while it is not dry. A storm is heavy rain with lightning. */
export type Precip = 'rain' | 'snow' | 'storm';

const DRY = [90, 220]; // seconds of dry weather between two showers
const WET = [50, 130]; // seconds a shower lasts
const SOAK = 45; // seconds of rain until the ground is soaked (puddles at full size)
const DRYING = 60; // seconds for soaked ground to dry again
const WHITEN = 45; // seconds of snow until the porch is white
const MELT = 80; // seconds for the snow on the ground to melt again
const FIRST_STRIKE = [3, 8]; // seconds from the start of a storm to its first flash
const STRIKES = [8, 25]; // seconds between two flashes
const THUNDER = [0.6, 2.8]; // seconds from a flash to its thunder
const STRONG = 0.35; // share of the strikes that make the lights flicker

/** what Auto weather does without a season: plain showers */
const PLAIN = { dry: 1, wet: 1, snow: 0, storm: 0 };

/** `x` moves a bit towards `target`; the last crumbs snap to 0 */
const ease = (x: number, target: number, k: number): number => {
  const v = x + (target - x) * k;
  return v < 0.002 ? 0 : v;
};

const between = ([a, b]: number[]) => a + random() * (b - a);

/** How bright the flash is `since` seconds after a strike: a sharp one, then a weaker echo. */
export function flashAt(since: number): number {
  const first = Math.exp(-since * 7);
  const echo = since > 0.22 ? 0.7 * Math.exp(-(since - 0.22) * 9) : 0;
  return Math.max(first, echo);
}

/** Whether the office lights are out for a moment `since` seconds after a strong strike (a few quick blinks). */
export function lightsOutAt(since: number): boolean {
  return since > 0.45 && since < 1.05 && Math.floor(since * 14) % 2 === 0;
}

/** Showers come and go by themselves (or the settings force sun / rain / snow / a storm). The amounts ease 0..1 so the visuals fade. */
export class Weather {
  mode: WeatherMode = 'auto';
  /** water falls (rain or storm) */
  raining = false;
  /** snow falls */
  snowing = false;
  /** the shower that falls is a thunderstorm (with `raining`) */
  stormy = false;
  /** the season shapes Auto weather; null: plain showers (what a test gets) */
  season: Season | null = null;
  /** 0 dry .. 1 pouring (eased) */
  rain = 0;
  /** 0 .. 1 snowing (eased) */
  snow = 0;
  /** 0 .. 1 thunderstorm (eased) */
  storm = 0;
  /** 0 dry .. 1 soaked: rises while it rains, falls when it stops (puddles) */
  wet = 0;
  /** 0 bare .. 1 white: rises while it snows, falls when it stops (the porch) */
  cover = 0;
  /** 0..1 how bright the lightning is right now */
  flash = 0;
  /** the office lights blink out for a moment (after a strong strike) */
  lightsOut = false;
  /** how many strikes there have been so far */
  strikes = 0;
  /** seconds since the last strike (large when none) */
  private since = 99;
  private strong = false;
  private strikeIn = 0; // set when a storm starts, so a plain Weather rolls no extra random number
  private thunderIn = -1;
  private thunders = 0;
  private timer = between(DRY);

  /** called when `start` / `stop` moved the forced mode (the settings chip follows) */
  onForce: (() => void) | null = null;

  /** anything falls from the sky */
  get foul(): boolean {
    return this.raining || this.snowing;
  }

  update(dt: number): void {
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.foul) {
          this.apply(null);
          this.timer = between(DRY) * this.profile().dry;
        } else {
          this.apply(this.pick());
          this.timer = between(WET) * this.profile().wet;
        }
      }
    } else {
      this.apply(this.mode === 'sun' ? null : this.mode);
    }
    const k = Math.min(1, dt * 0.7);
    this.rain = ease(this.rain, this.raining ? 1 : 0, k);
    this.snow = ease(this.snow, this.snowing ? 1 : 0, k);
    this.storm = ease(this.storm, this.stormy && this.raining ? 1 : 0, k);
    this.wet = Math.min(1, Math.max(0, this.wet + (this.rain > 0.3 ? dt / SOAK : -dt / DRYING)));
    this.cover = Math.min(1, Math.max(0, this.cover + (this.snow > 0.3 ? dt / WHITEN : -dt / MELT)));
    this.lightning(dt);
  }

  /** Dev / settings: start or stop a shower right now (auto mode keeps its timer going from there). */
  set(raining: boolean): void {
    if (raining) this.start('rain');
    else this.stop();
  }

  /** Dev / settings: rain, snow or a storm right now. */
  start(kind: Precip): void {
    this.force(kind);
  }

  /** Dev / settings: dry right now. */
  stop(): void {
    this.force(null);
  }

  /** Starts `kind` (null: dry) now, and keeps it up for a spell; a forced mode follows it (and the chip with it). */
  private force(kind: Precip | null): void {
    const before = this.mode;
    this.apply(kind);
    this.timer = kind ? between(WET) * this.profile().wet : between(DRY) * this.profile().dry;
    if (this.mode !== 'auto') this.mode = kind ?? 'sun';
    if (this.mode !== before) this.onForce?.();
  }

  /** Whether a clap of thunder came since the last call (the office reacts to it once). */
  takeThunder(): boolean {
    const had = this.thunders > 0;
    this.thunders = 0;
    return had;
  }

  private profile() {
    return this.season ? SEASON_PROFILE[this.season] : PLAIN;
  }

  /** The kind of the next shower of Auto weather: by the season's shares, plain rain when it has none (no random roll then). */
  private pick(): Precip {
    const { snow, storm } = this.profile();
    if (!snow && !storm) return 'rain';
    const r = random();
    return r < snow ? 'snow' : r < snow + storm ? 'storm' : 'rain';
  }

  private apply(kind: Precip | null): void {
    const wasStormy = this.stormy && this.raining;
    this.raining = kind === 'rain' || kind === 'storm';
    this.snowing = kind === 'snow';
    this.stormy = kind === 'storm';
    if (this.stormy && !wasStormy) this.strikeIn = between(FIRST_STRIKE);
  }

  /** Flashes of a storm, the thunder that follows each, and the lights that blink after a strong one. */
  private lightning(dt: number): void {
    if (this.stormy && this.raining && this.storm > 0.5) {
      this.strikeIn -= dt;
      if (this.strikeIn <= 0) {
        this.since = 0;
        this.strikes++;
        this.strong = random() < STRONG;
        this.thunderIn = between(THUNDER);
        this.strikeIn = between(STRIKES);
      }
    }
    this.since = Math.min(99, this.since + dt);
    if (this.thunderIn >= 0 && (this.thunderIn -= dt) < 0) {
      this.thunderIn = -1;
      this.thunders++;
    }
    this.flash = this.since < 2 ? flashAt(this.since) : 0;
    this.lightsOut = this.strong && lightsOutAt(this.since);
  }
}
