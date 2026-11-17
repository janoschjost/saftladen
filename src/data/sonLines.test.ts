import { describe, expect, it } from 'vitest';
import { SON_BYE, SON_GAP, SON_LINES, bubbleSeconds, sonTimeline } from './sonLines';

describe('home.son', () => {
  it('there are at least 6 lines, each with a reply, in Serbian Latin script', () => {
    expect(SON_LINES.length).toBeGreaterThanOrEqual(6);
    for (const { son, dad } of SON_LINES) {
      for (const text of [son, dad]) {
        expect(text.trim().length).toBeGreaterThan(5);
        expect(text).not.toMatch(/[Ѐ-ӿ]/); // no Cyrillic
        expect(text.length).toBeLessThanOrEqual(36); // longer ones get squeezed in the bubble
      }
      expect(son).toMatch(/^Tata/);
    }
    expect(new Set(SON_LINES.map((l) => l.son)).size).toBe(SON_LINES.length);
    expect(SON_LINES.map((l) => l.son + l.dad).join('')).toMatch(/[ćčšžđ]/);
  });

  it('a bubble stays up at least 3 s, longer lines about 1 s per 12 characters', () => {
    expect(bubbleSeconds('Tata, gladan sam!')).toBe(3);
    expect(bubbleSeconds('x'.repeat(60))).toBe(5);
  });

  it('the bubbles never overlap, and the visit outlasts both plus the goodbye', () => {
    for (const line of SON_LINES) {
      const t = sonTimeline(line);
      expect(t.sonEnd).toBeGreaterThanOrEqual(3);
      expect(t.dadStart - t.sonEnd).toBeGreaterThanOrEqual(SON_GAP - 1e-9);
      expect(t.dadEnd - t.dadStart).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(t.talk - t.dadEnd).toBeGreaterThanOrEqual(SON_BYE);
    }
  });
});
