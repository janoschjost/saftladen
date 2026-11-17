import { random } from './rng';
export type WeatherMode = 'auto' | 'sun' | 'rain';

const DRY = [90, 220]; // seconds of dry weather between two showers
const WET = [50, 130]; // seconds a shower lasts
const SOAK = 45; // seconds of rain until the ground is soaked (puddles at full size)
const DRYING = 60; // seconds for soaked ground to dry again

const between = ([a, b]: number[]) => a + random() * (b - a);

/** Showers come and go by themselves (or the settings force sun / rain). `rain` eases 0..1 so the visuals fade. */
export class Weather {
  mode: WeatherMode = 'auto';
  raining = false;
  /** 0 dry .. 1 pouring (eased) */
  rain = 0;
  /** 0 dry .. 1 soaked: rises while it rains, falls when it stops (puddles) */
  wet = 0;
  private timer = between(DRY);

  update(dt: number): void {
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.raining = !this.raining;
        this.timer = between(this.raining ? WET : DRY);
      }
    } else {
      this.raining = this.mode === 'rain';
    }
    this.rain += ((this.raining ? 1 : 0) - this.rain) * Math.min(1, dt * 0.7);
    if (this.rain < 0.002) this.rain = 0;
    this.wet = Math.min(1, Math.max(0, this.wet + (this.rain > 0.3 ? dt / SOAK : -dt / DRYING)));
  }

  /** Dev / settings: start or stop a shower right now (auto mode keeps its timer going from there). */
  set(raining: boolean): void {
    this.raining = raining;
    this.timer = between(raining ? WET : DRY);
    if (this.mode !== 'auto') this.mode = raining ? 'rain' : 'sun';
  }
}
