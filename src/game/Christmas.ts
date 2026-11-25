import * as THREE from 'three';
import { SnowFx } from '../render/snowFx';
import { XmasDecor } from '../render/xmasDecor';
import { setChristmasWear } from '../render/xmasWear';

const FROST = new THREE.Color('#dfe9f5'); // the sky leans cold and bright while it snows

/** Christmas mode: snowfall, decorations and light strands, and hats and scarves on everybody. */
export class Christmas {
  on = false;
  /** 0..1, eases so the snow fades in and out */
  amount = 0;
  private snow: SnowFx;
  readonly decor: XmasDecor;

  constructor(scene: THREE.Scene) {
    this.snow = new SnowFx(scene);
    this.decor = new XmasDecor(scene);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    setChristmasWear(on);
    this.decor.setVisible(on); // decorations switch at once, only the snow and sky fade
  }

  /** `weatherSnow` 0..1: snow that falls by the weather chip, with or without Christmas mode (it shares the flakes and the cold sky). */
  update(dt: number, day: number, sky: THREE.Color, sun: THREE.DirectionalLight, weatherSnow = 0): void {
    this.amount += ((this.on ? 1 : 0) - this.amount) * Math.min(1, dt * 0.8);
    if (this.amount < 0.002) this.amount = 0;
    const snowing = Math.max(this.amount, weatherSnow);
    this.snow.update(dt, snowing, 1 - day);
    this.decor.update(dt, this.on);
    if (snowing > 0) {
      sky.lerp(FROST, 0.35 * snowing * day);
      sun.intensity *= 1 - 0.12 * snowing;
    }
  }
}
