import * as THREE from 'three';
import type { Vec2 } from './NavGrid';
import type { TimeOfDay } from './TimeOfDay';

/** Darkness (1 - daylight) from which a room lamp is worth switching on; same threshold as the desk lamps. */
const NIGHT = 0.02;
/** level per second, so a lamp fades in and out instead of popping */
const FADE = 1.6;

/** A ceiling lamp of a room: its glowing material and where the light hangs (game coordinates; `at` moves with the lamp in the room editor). */
export interface RoomLamp {
  glow: THREE.MeshLambertMaterial;
  at: Vec2;
  y: number;
}

/** How bright a room lamp wants to be (0..1): as bright as it is dark while somebody is in the room at night, off when the room is empty or it is day. */
export function roomLampTarget(occupants: number, day: number): number {
  const dark = 1 - day;
  return occupants > 0 && dark > NIGHT ? dark : 0;
}

/** One step of the fade from `level` toward `target`; a time jump only changes the target, the lamp still fades. */
export function fadeLevel(level: number, target: number, dt: number): number {
  return level + THREE.MathUtils.clamp(target - level, -FADE * dt, FADE * dt);
}

/** Switches a room's lamp on while people are in the room at night: a point light plus the matching glow on the lamp itself. */
export class RoomLight {
  /** 0 = off .. 1 = fully on */
  level = 0;
  private light: THREE.PointLight;

  constructor(
    scene: THREE.Scene,
    private lamp: RoomLamp,
    private tod: TimeOfDay,
    /** how many people are in the room right now */
    private occupants: () => number,
    private peak = 9,
    distance = 7,
    color = '#ffd9a0',
  ) {
    // always in the scene (intensity 0 when off): the number of lights never changes, so no shader recompiles
    this.light = new THREE.PointLight(color, 0, distance, 2);
    scene.add(this.light);
    this.apply();
  }

  update(dt: number): void {
    this.level = fadeLevel(this.level, roomLampTarget(this.occupants(), this.tod.day), dt);
    this.apply();
  }

  private apply(): void {
    const { at, y, glow } = this.lamp;
    this.light.position.set(at.x, y, at.z);
    this.light.intensity = this.level * this.peak;
    glow.emissiveIntensity = Math.min(1, this.level * 1.2);
  }
}
