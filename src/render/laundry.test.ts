import { describe, expect, it } from 'vitest';
import { HomeOffice } from './homeOffice';
import { LAUNDRY, LAUNDRY_PICKS, RACK_SLOTS, laundryHung, laundryTime, laundryTrip } from './laundry';
import { team as TEAM } from '../data/team';
import { setSeed } from '../game/rng';

describe('home.laundry', () => {
  it('a round hangs two or three pieces, never more than fit', () => {
    expect(laundryTrip(0, 0.1)).toBe(2);
    expect(laundryTrip(0, 0.9)).toBe(3);
    expect(laundryTrip(RACK_SLOTS - 1, 0.9)).toBe(1);
    expect(laundryTrip(RACK_SLOTS, 0.1)).toBe(0);
  });

  it('pieces land one by one while the person stands at the rack', () => {
    const n = 3;
    expect(laundryHung(0, n)).toBe(0);
    expect(laundryHung(LAUNDRY.arrive, n)).toBe(0);
    expect(laundryHung(LAUNDRY.arrive + LAUNDRY.hang * 0.6, n)).toBe(1);
    expect(laundryHung(LAUNDRY.arrive + LAUNDRY.hang * 1.6, n)).toBe(2);
    expect(laundryHung(laundryTime(n), n)).toBe(n);
    expect(laundryTime(3)).toBeGreaterThan(laundryTime(2));
  });

  it('the draw gives laundry a ticket among the usual breaks', () => {
    expect(LAUNDRY_PICKS).toBeGreaterThan(0);
  });

  const person = TEAM[0];
  const run = (room: HomeOffice, seconds: number) => {
    for (let t = 0; t < seconds; t += 0.05) room.update(0.05);
  };

  it('in a room with a rack the clothes go up and stay there afterwards', () => {
    setSeed(1);
    const room = new HomeOffice(0); // bedroom
    room.setOccupant(person);
    expect(room.laundryHung).toBe(0);
    expect(room.startLaundry()).toBe(true);
    expect(room.activityLabel).toBe('Hängt Wäsche auf');
    run(room, 20);
    expect(room.laundryHung).toBeGreaterThanOrEqual(2);
    const hung = room.laundryHung;
    // later breaks never take them down again
    run(room, 60);
    expect(room.laundryHung).toBeGreaterThanOrEqual(hung);
  });

  it('the laundry is gone when the next person moves in', () => {
    setSeed(1);
    const room = new HomeOffice(0);
    room.setOccupant(person);
    room.startLaundry();
    run(room, 20);
    room.setOccupant(null);
    room.setOccupant(person);
    expect(room.laundryHung).toBe(0);
  });

  it('rooms where it makes no sense never do laundry', () => {
    setSeed(1);
    for (const variant of [2, 7, 8]) {
      // couch, gamer den, Marco's beach
      const room = new HomeOffice(variant);
      room.setOccupant(person);
      expect(room.startLaundry()).toBe(false);
      run(room, 120);
      expect(room.laundryHung).toBe(0);
    }
  });

  it('a full rack is not asked for another round', () => {
    setSeed(1);
    const room = new HomeOffice(0);
    room.setOccupant(person);
    for (let i = 0; i < 10; i++) {
      if (!room.startLaundry()) break;
      run(room, 30);
    }
    expect(room.laundryHung).toBe(RACK_SLOTS);
    expect(room.startLaundry()).toBe(false);
  });
});
