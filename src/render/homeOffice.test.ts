import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { HomeOffice } from './homeOffice';
import { team as TEAM } from '../data/team';
import { setSeed } from '../game/rng';

const BEACH = 8;
const SAFARI = 9;
const BEDROOM = 0;

/** The room's hemisphere light after a frame at this clock hour. */
function lightAt(variant: number, hour: number) {
  setSeed(1);
  const room = new HomeOffice(variant);
  room.setOccupant(TEAM.find((m) => m.id === 'marco-hefti') ?? TEAM[0]);
  room.hour = hour;
  room.update(0.05);
  const hemi = room.scene.children.find((c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight);
  const bg = room.scene.background as THREE.Color;
  return { intensity: hemi?.intensity ?? NaN, bg: bg.getHex() };
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

  it('home.rooms: every other home room looks the same all day', () => {
    for (const v of [BEDROOM, SAFARI]) expect(lightAt(v, 12)).toEqual(lightAt(v, 0));
  });
});
