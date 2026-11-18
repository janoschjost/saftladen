import { describe, expect, it } from 'vitest';
import { codeSnippet, lineText } from './clawdCode';

const opens = '([{';
const closes = ')]}';
const balanced = (text: string): boolean => {
  const stack: string[] = [];
  let quote = false;
  for (const ch of text) {
    if (ch === "'") quote = !quote;
    if (quote) continue;
    if (opens.includes(ch)) stack.push(closes[opens.indexOf(ch)]);
    else if (closes.includes(ch) && stack.pop() !== ch) return false;
  }
  return !quote && (stack.length === 0 || text.trimEnd().endsWith('{'));
};

describe('credits.clawd: his code bubbles look like code and say nothing', () => {
  it('credits.clawd: a bubble is two or three lines of tokens, the same for the same seed', () => {
    for (let seed = 0; seed < 60; seed++) {
      const lines = codeSnippet(seed);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(3);
      for (const l of lines) expect(lineText(l).trim().length).toBeGreaterThan(0);
      expect(codeSnippet(seed)).toEqual(lines);
    }
    expect(new Set(Array.from({ length: 30 }, (_, i) => lineText(codeSnippet(i)[0]))).size).toBeGreaterThan(10);
  });

  it('credits.clawd: every statement is closed: brackets and quotes match, lines end like code does, no "undefined"', () => {
    for (let seed = 0; seed < 200; seed++) {
      const lines = codeSnippet(seed);
      for (const l of lines) {
        const text = lineText(l);
        expect(text).not.toMatch(/undefined|NaN|\[object/);
        if (text.trim().startsWith('//') || text.trim() === '}' ) continue;
        expect(balanced(text), text).toBe(true);
        expect(text.trimEnd(), text).toMatch(/[;{}]$/);
      }
      // a function block is opened and closed within the bubble
      const joined = lines.map(lineText).join('\n');
      expect((joined.match(/\{$/gm) ?? []).length).toBe((joined.match(/^\}$/gm) ?? []).length);
    }
  });
});
