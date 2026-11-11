import * as THREE from 'three';
import type { Desk, Office } from './Office';
import type { TimeOfDay } from './TimeOfDay';

/** Lamps in the pool. Their number never changes (so no shader recompiles); they hop between the desks that are in use. */
const POOL = 12;
const COLOR = '#ffd9a0';
const PEAK = 5.5;
const DISTANCE = 5.5;
const FADE = 2.2; // intensity per second
const HEIGHT = 1.75;
const LOCAL = new THREE.Vector3(0, HEIGHT, 0.15);

interface Lamp {
  light: THREE.PointLight;
  desk: Desk | null;
  level: number;
}

/** At night a warm light shines over every desk where somebody is working, so the lit spots show where the work happens. */
export class DeskLights {
  private lamps: Lamp[] = [];

  constructor(
    scene: THREE.Scene,
    private office: Office,
    private tod: TimeOfDay,
  ) {
    for (let i = 0; i < POOL; i++) {
      const light = new THREE.PointLight(COLOR, 0, DISTANCE, 2);
      scene.add(light);
      this.lamps.push({ light, desk: null, level: 0 });
    }
  }

  update(dt: number): void {
    const dark = 1 - this.tod.day;
    const wanted = new Set<Desk>();
    if (dark > 0.02) for (const d of this.office.desks) if (d.occupant?.working) wanted.add(d);

    // lamps whose desk is no longer in use fade out and are freed
    const taken = new Set<Desk>();
    for (const l of this.lamps) {
      if (l.desk && wanted.has(l.desk)) taken.add(l.desk);
    }
    for (const d of wanted) {
      if (taken.has(d)) continue;
      const free = this.lamps.find((l) => !l.desk) ?? null;
      if (!free) break;
      free.desk = d;
      free.level = 0;
      taken.add(d);
    }
    for (const l of this.lamps) {
      const on = !!l.desk && wanted.has(l.desk);
      const target = on ? dark : 0;
      l.level += THREE.MathUtils.clamp(target - l.level, -FADE * dt, FADE * dt);
      if (l.desk) l.light.position.copy(deskPos(l.desk));
      l.light.intensity = l.level * PEAK;
      if (!on && l.level <= 0.001) l.desk = null;
    }
  }
}

const v = new THREE.Vector3();
function deskPos(d: Desk): THREE.Vector3 {
  return d.root.localToWorld(v.copy(LOCAL));
}
