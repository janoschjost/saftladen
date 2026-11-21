import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HomeOffice } from './homeOffice';
import { team as TEAM } from '../data/team';
import { setSeed } from '../game/rng';

const BEACH = 8;
const SAFARI = 9;
const BEDROOM = 0;
const BALCONY = 3;

/** The room's hemisphere light after a frame at this clock hour. */
function lightAt(variant: number, hour: number) {
  setSeed(1);
  const room = new HomeOffice(variant);
  room.setOccupant(TEAM.find((m) => m.id === 'marco-hefti') ?? TEAM[0]);
  room.hour = hour;
  room.update(0.05);
  const hemi = room.scene.children.find((c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight);
  const bg = room.scene.background as THREE.Color;
  const key = room.scene.children.find((c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight);
  return { intensity: hemi?.intensity ?? NaN, key: key?.intensity ?? NaN, bg: bg.getHex(), rgb: { r: bg.r, g: bg.g, b: bg.b } };
}

describe('light', () => {
  it('home.beach: the beach room is dark while it is day in the office and bright at night there', () => {
    const noon = lightAt(BEACH, 12);
    const midnight = lightAt(BEACH, 0);
    expect(midnight.intensity).toBeGreaterThan(noon.intensity * 2);
    expect(midnight.bg).not.toBe(noon.bg);
    const dusk = lightAt(BEACH, 6.1); // dawn in the office, dusk at the beach
    expect(dusk.intensity).toBeGreaterThan(noon.intensity);
    expect(dusk.intensity).toBeLessThan(midnight.intensity);
  });

  it('home.rooms: a room that follows no light looks the same all day', () => {
    for (const v of [BEDROOM, 1, 2, 4, 5, 6, 7]) expect(lightAt(v, 12)).toEqual(lightAt(v, 0));
  });

  it('home.beach: the beach keeps the flipped light, not the office light', () => {
    // dark at noon and bright at midnight, the opposite of the balcony and the safari camp
    for (const v of [BALCONY, SAFARI]) expect(lightAt(v, 12).intensity).toBeGreaterThan(lightAt(v, 0).intensity * 2);
    expect(lightAt(BEACH, 12).intensity).toBeLessThan(lightAt(BEACH, 0).intensity);
  });

  it.each([
    ['home.safari', SAFARI],
    ['home.rooms', BALCONY],
  ])('%s: the room has the office light: bright by day, the orange sunset when the sun is low, dark blue at night', (_id, room) => {
    const noon = lightAt(room, 12);
    const sunset = lightAt(room, 19.6);
    const dawn = lightAt(room, 6.4);
    const night = lightAt(room, 1);
    expect(noon.intensity).toBeGreaterThan(night.intensity * 2);
    expect(noon.key).toBeGreaterThan(night.key * 2);
    // sky colour: blue by day, orange at dusk and dawn, dark blue at night
    expect(noon.rgb.b).toBeGreaterThan(noon.rgb.r);
    for (const low of [sunset, dawn]) {
      expect(low.rgb.r).toBeGreaterThan(low.rgb.b + 0.2);
      expect(low.rgb.r).toBeGreaterThan(night.rgb.r);
    }
    expect(night.rgb.b).toBeGreaterThan(night.rgb.r);
    expect(night.rgb.b).toBeLessThan(noon.rgb.b / 3);
    // the office's clock exactly, not the flipped one: noon is bright, midnight is dark
    expect(lightAt(room, 13)).toEqual(lightAt(room, 12));
  });

  it.each([SAFARI, BALCONY])('home.rooms: room %i changes smoothly over the day', (room) => {
    let last = lightAt(room, 0);
    for (let h = 0.1; h <= 24; h += 0.1) {
      const now = lightAt(room, h);
      expect(Math.abs(now.intensity - last.intensity)).toBeLessThan(0.15);
      expect(Math.abs(now.rgb.r - last.rgb.r) + Math.abs(now.rgb.g - last.rgb.g) + Math.abs(now.rgb.b - last.rgb.b)).toBeLessThan(0.25);
      last = now;
    }
  });
});
