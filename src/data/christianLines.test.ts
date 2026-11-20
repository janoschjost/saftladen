import { describe, expect, it } from 'vitest';
import { CHRISTIAN_LINES, MAX_LINE } from './christianLines';

describe('christian.lines', () => {
  it('christian.lines: about a dozen short German lines, each kind has one, none longer than a bubble takes, no repeats', () => {
    const all = Object.values(CHRISTIAN_LINES).flat();
    expect(all.length).toBeGreaterThanOrEqual(12);
    for (const kind of Object.keys(CHRISTIAN_LINES) as Array<keyof typeof CHRISTIAN_LINES>) expect(CHRISTIAN_LINES[kind].length).toBeGreaterThan(0);
    for (const line of all) {
      expect(line.length).toBeLessThanOrEqual(MAX_LINE);
      expect(line).not.toMatch(/[Ѐ-ӿ]/);
    }
    expect(new Set(all).size).toBe(all.length);
    expect(CHRISTIAN_LINES.done).toContain('Passt. Fürs Erste.');
  });
});
