import * as THREE from 'three';
import { fxRandom } from '../game/rng';
import { groundAt, type Rect } from './cityLayout';
import { OFFICE_D, OFFICE_W } from './officeModel';
import { WORLD } from './World';

/** The office footprint and the real building's centre, as `Game` hands them to the `City`. */
export const CITY_FOOT: Rect = { x0: 0, z0: 0, x1: WORLD.width, z1: WORLD.depth };
export const CITY_ORIGIN = { x: OFFICE_W / 2, z: OFFICE_D / 2 };

/** Rain and snow reach this far from the office centre (m, each side): the city beyond fades into the haze anyway. */
export const WEATHER_HALF = 110;

/** How high above the floor rain and snow start (m): high enough to come out of the sky, out of sight in the haze, in Orbit and Iso. */
export const SKY = 32;

/** On-screen size (px) of a point of `world` metres: a perspective camera scales it itself, an orthographic one (Iso, Plan) does not, so it is worked out from the view's height here. */
export function pointSize(camera: THREE.Camera, world: number, drawingHeight: number): number {
  if (!(camera as THREE.OrthographicCamera).isOrthographicCamera) return world;
  const o = camera as THREE.OrthographicCamera;
  return Math.max(1.5, (world * drawingHeight * o.zoom) / (o.top - o.bottom));
}

/** The street (m, relative to the office's floor) at a point of the city, where rain and snow land. */
export function streetAt(x: number, z: number): number {
  return groundAt(CITY_FOOT, CITY_ORIGIN, x, z);
}

/** A spot of the city outside the office and its surroundings (`margin`): where a drop or a flake of the outer zone falls, and where it lands. */
export function outerSpot(margin: number, random: () => number = fxRandom): { x: number; z: number; floor: number } {
  for (;;) {
    const x = CITY_ORIGIN.x + (random() * 2 - 1) * WEATHER_HALF;
    const z = CITY_ORIGIN.z + (random() * 2 - 1) * WEATHER_HALF;
    if (x > -margin && x < WORLD.width + margin && z > -margin && z < WORLD.depth + margin) continue; // the office has its own drops
    return { x, z, floor: streetAt(x, z) };
  }
}

/** What the city's surfaces look like when dry, wet and snowed over. */
const GROUND = { dry: '#dcdcda', wet: '#b9bec6', snow: '#f7f9fc' };
const ROAD = { dry: '#e8e8e6', wet: '#cfd3da', snow: '#fbfcfe' };
const FILL = { dry: '#e8e8e6', wet: '#d4d8de', snow: '#ffffff' };

const mix = (set: { dry: string; wet: string; snow: string }, wet: number, cover: number, into: THREE.Color): THREE.Color =>
  into.set(set.dry).lerp(new THREE.Color(set.wet), wet).lerp(new THREE.Color(set.snow), cover);

/** The colours of the city's ground, roads and building fill for the weather: `wet` (weather.wet) darkens them, `cover` (weather.cover) whitens them. */
export function cityColours(wet: number, cover: number): { ground: THREE.Color; road: THREE.Color; fill: THREE.Color } {
  const w = Math.min(1, Math.max(0, wet));
  const c = Math.min(1, Math.max(0, cover));
  return { ground: mix(GROUND, w, c, new THREE.Color()), road: mix(ROAD, w, c, new THREE.Color()), fill: mix(FILL, w, c, new THREE.Color()) };
}
