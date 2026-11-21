import { describe, expect, it } from 'vitest';
import { CHRISTIAN_FACTS, MAX_FACT } from './christianFacts';

describe('christian.facts', () => {
  it('christian.facts: about ten short German facts, none longer than a bubble takes, no repeats', () => {
    expect(CHRISTIAN_FACTS.length).toBeGreaterThanOrEqual(10);
    for (const fact of CHRISTIAN_FACTS) {
      expect(fact.length).toBeLessThanOrEqual(MAX_FACT);
      expect(fact).not.toMatch(/[Ѐ-ӿ]/);
    }
    expect(new Set(CHRISTIAN_FACTS).size).toBe(CHRISTIAN_FACTS.length);
    expect(CHRISTIAN_FACTS).toContain('Honig verdirbt nie.');
  });
});
