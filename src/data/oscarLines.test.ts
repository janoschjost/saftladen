import { describe, expect, it } from 'vitest';
import { MAX_LINE } from './christianLines';
import { CHRIGI, OSCAR_LINES } from './oscarLines';

describe('oscar.lines', () => {
  it('oscar.lines: every kind has lines, short enough for a bubble (the quoted Chrigi line aside), Chrigi starts', () => {
    expect(Object.keys(OSCAR_LINES).sort()).toEqual(['bin', 'done', 'lunchbox', 'start', 'tidy']);
    for (const lines of Object.values(OSCAR_LINES)) {
      expect(lines.length).toBeGreaterThan(0);
      expect(new Set(lines).size).toBe(lines.length);
      for (const line of lines) if (line !== CHRIGI) expect(line.length).toBeLessThanOrEqual(MAX_LINE);
    }
    expect(OSCAR_LINES.start).toContain('Was würde Chrigi davon halten?!');
    expect(OSCAR_LINES.tidy.length).toBeGreaterThanOrEqual(3);
    expect(OSCAR_LINES.lunchbox.length).toBeGreaterThanOrEqual(3);
  });
});
