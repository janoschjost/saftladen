export type WeatherMode = 'auto' | 'sun' | 'rain';

const DRY = [90, 220]; // seconds of dry weather between two showers
const WET = [50, 130]; // seconds a shower lasts

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

/** Showers come and go by themselves (or the settings force sun / rain). `rain` eases 0..1 so the visuals fade. */
export class Weather {
  mode: WeatherMode = 'auto';
  raining = false;
  /** 0 dry .. 1 pouring (eased) */
  rain = 0;
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
  }

  /** Dev / settings: start or stop a shower right now (auto mode keeps its timer going from there). */
  set(raining: boolean): void {
    this.raining = raining;
    this.timer = between(raining ? WET : DRY);
    if (this.mode !== 'auto') this.mode = raining ? 'rain' : 'sun';
  }
}
