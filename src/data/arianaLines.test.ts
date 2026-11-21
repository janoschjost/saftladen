import { describe, expect, it } from 'vitest';
import { homeRoomOf } from './homeAssignments';
import { HOME_ROOMS } from './types';
import {
  ARIANA_DAY_LINES,
  ARIANA_NIGHT_LINES,
  ARIANA_VISIT,
  HUG_GAP,
  HUG_SECONDS,
  REPLY_GAP,
  SPEAK_LEAD,
  arianaTimeline,
  arianaVisitAt,
  isNightHour,
} from './arianaLines';

describe('home.ariana', () => {
  it('lines: 7 by day, 4 at night, each short, the nickname Chäfer is in a few, no two alike', () => {
    expect(ARIANA_DAY_LINES.length).toBeGreaterThanOrEqual(6);
    expect(ARIANA_NIGHT_LINES.length).toBeGreaterThanOrEqual(4);
    const lines = [...ARIANA_DAY_LINES, ...ARIANA_NIGHT_LINES];
    for (const { ari, marco } of lines) {
      for (const text of [ari, marco]) {
        expect(text.trim().length).toBeGreaterThan(5);
        expect(text.length).toBeLessThanOrEqual(42); // longer ones get squeezed in the bubble
      }
    }
    expect(lines.filter((l) => l.ari.includes('Chäfer')).length).toBeGreaterThanOrEqual(3);
    const spoken = lines.map((l) => l.ari);
    expect(new Set(spoken).size).toBe(spoken.length);
  });

  it('the night runs from 22:00 to 07:00', () => {
    expect([22, 23.5, 0, 3, 6.99].every(isNightHour)).toBe(true);
    expect([7, 11, 17.5, 21.99].some(isNightHour)).toBe(false);
  });

  it('the bubbles never overlap, the hug comes after both, and she walks out right after the hug', () => {
    for (const line of [...ARIANA_DAY_LINES, ...ARIANA_NIGHT_LINES]) {
      const t = arianaTimeline(line);
      expect(t.sonEnd + SPEAK_LEAD).toBeGreaterThanOrEqual(3 - 1e-9); // her bubble is up at least 3 s, the first part while she walks in
      expect(t.dadStart - t.sonEnd).toBeCloseTo(REPLY_GAP, 9); // he answers right away, but never over her
      expect(t.dadEnd - t.dadStart).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(t.hugStart - t.dadEnd).toBeCloseTo(HUG_GAP, 9); // he is already getting up while he finishes
      expect(t.hugEnd - t.hugStart).toBeCloseTo(HUG_SECONDS, 9);
      expect(t.talk - t.hugEnd).toBeGreaterThan(0);
    }
  });

  it('a stay gets a visit in about a third of the cases, once, in the first minute', () => {
    expect(arianaVisitAt(ARIANA_VISIT.chance, 0.5)).toBe(Infinity);
    expect(arianaVisitAt(0.99, 0)).toBe(Infinity);
    expect(arianaVisitAt(0, 0)).toBe(ARIANA_VISIT.after[0]);
    expect(arianaVisitAt(0.1, 0.999)).toBeLessThan(ARIANA_VISIT.after[1]);
    const stays = 1000;
    const some = Array.from({ length: stays }, (_, i) => arianaVisitAt(i / stays, 0.5)).filter(Number.isFinite).length;
    expect(some / stays).toBeCloseTo(ARIANA_VISIT.chance, 1);
  });
});

describe('home.marco-room', () => {
  it('Marco Rieser works from the Skandi-Studio, which has the swivel chair her visit needs', () => {
    expect(homeRoomOf('marco-rieser')).toBe(HOME_ROOMS.indexOf('scandi'));
  });
});
