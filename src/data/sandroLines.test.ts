import { describe, expect, it } from 'vitest';
import { MAX_SANDRO_LINE, SANDRO_ANSWERS, SANDRO_LINES } from './sandroLines';

describe('play.sandro-ai', () => {
  it('play.sandro-ai: at least the eight German lines, none longer than a bubble takes, no repeats, KI, KI, KI! among them', () => {
    expect(SANDRO_LINES.length).toBeGreaterThanOrEqual(8);
    for (const line of SANDRO_LINES) {
      expect(line.length).toBeLessThanOrEqual(MAX_SANDRO_LINE);
      expect(line).not.toMatch(/[Ѐ-ӿ]/);
    }
    expect(new Set(SANDRO_LINES).size).toBe(SANDRO_LINES.length);
    for (const line of ['Sonst viben wir das einfach.', 'KI macht das in 5 Minuten.', 'Das erledigt ein Agent.', 'Einfach prompten, fertig.', 'Warum denken? KI denkt.', 'Mit KI geht alles. Alles.', 'Einfach KI draufwerfen.', 'KI, KI, KI!']) {
      expect(SANDRO_LINES).toContain(line);
    }
  });

  it('play.sandro-ai: the answers are wordless (😄 or ?)', () => {
    expect([...SANDRO_ANSWERS].sort()).toEqual(['?', '😄']);
  });
});
