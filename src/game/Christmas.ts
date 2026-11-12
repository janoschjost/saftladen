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
  private decor: XmasDecor;

  constructor(scene: THREE.Scene) {
    this.snow = new SnowFx(scene);
    this.decor = new XmasDecor(scene);
  }

  set(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    setChristmasWear(on);
    if (on) this.decor.setVisible(true);
  }

  update(dt: number, day: number, sky: THREE.Color, sun: THREE.DirectionalLight): void {
    this.amount += ((this.on ? 1 : 0) - this.amount) * Math.min(1, dt * 0.8);
    if (this.amount < 0.002) this.amount = 0;
    this.snow.update(dt, this.amount, 1 - day);
    this.decor.update(dt, this.on);
    if (!this.on && this.amount === 0) this.decor.setVisible(false); // after the snow has faded out
    if (this.amount > 0) {
      sky.lerp(FROST, 0.35 * this.amount * day);
      sun.intensity *= 1 - 0.12 * this.amount;
    }
  }
}
