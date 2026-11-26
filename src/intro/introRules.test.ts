import { describe, expect, it } from 'vitest';
import { shouldPlayIntro } from './introRules';

describe('intro.once', () => {
  it('intro.once: a plain first visit plays it, a later one does not', () => {
    expect(shouldPlayIntro('', '', false)).toBe(true);
    expect(shouldPlayIntro('', '', true)).toBe(false);
  });
  it('intro.once: #intro always plays it, also when seen, with a query or in test mode', () => {
    expect(shouldPlayIntro('', '#intro', true)).toBe(true);
    expect(shouldPlayIntro('?seed=1&time=11', '#intro', true)).toBe(true);
    expect(shouldPlayIntro('?test', '#intro', false)).toBe(true);
  });
  it('intro.once: deep links, ?seed and ?test never play it by themselves', () => {
    expect(shouldPlayIntro('', '#homes', false)).toBe(false);
    expect(shouldPlayIntro('?seed=1&time=11', '', false)).toBe(false);
    expect(shouldPlayIntro('?test&seed=1', '', false)).toBe(false);
    expect(shouldPlayIntro('?welcome=1', '', false)).toBe(false);
  });
  it('intro.once: ?intro=1 opts in (its spec, with ?test), once', () => {
    expect(shouldPlayIntro('?test&intro=1', '', false)).toBe(true);
    expect(shouldPlayIntro('?test&intro=1', '', true)).toBe(false);
    expect(shouldPlayIntro('?test&intro=1', '#plan', false)).toBe(false);
  });
});
