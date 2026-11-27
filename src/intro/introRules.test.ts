import { describe, expect, it } from 'vitest';
import { shouldGreet, shouldPlayIntro, withoutGreeting } from './introRules';

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

describe('intro.greeting', () => {
  it('intro.greeting: ?rene greets every time, also somebody who has seen the intro; without it nobody is greeted', () => {
    expect(shouldGreet('?rene')).toBe(true);
    expect(shouldGreet('?rene=1&seed=1')).toBe(true);
    expect(shouldGreet('')).toBe(false);
    expect(shouldGreet('?seed=1')).toBe(false);
    expect(shouldPlayIntro('?rene', '', false)).toBe(true);
    expect(shouldPlayIntro('?rene', '', true)).toBe(true); // seen it: plays again, with him
    expect(shouldPlayIntro('?rene&seed=1', '#plan', true)).toBe(true);
  });
  it('intro.greeting: a ?test page plays it only with intro=1', () => {
    expect(shouldPlayIntro('?test&rene', '', false)).toBe(false);
    expect(shouldPlayIntro('?test&intro=1&rene', '', true)).toBe(true);
  });
  it('intro.greeting: the marker leaves the address, the rest stays as written', () => {
    expect(withoutGreeting('?rene')).toBe('');
    expect(withoutGreeting('?rene=1')).toBe('');
    expect(withoutGreeting('?rene&seed=1')).toBe('?seed=1');
    expect(withoutGreeting('?test&intro=1&rene&time=11')).toBe('?test&intro=1&time=11');
    expect(withoutGreeting('?irene=1')).toBe('?irene=1');
    expect(withoutGreeting('')).toBe('');
  });
});
