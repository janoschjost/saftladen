import { seeded, type Rng } from '../game/rng';

export type TokenKind = 'keyword' | 'fn' | 'string' | 'number' | 'comment' | 'punct' | 'name';
export interface Token {
  text: string;
  kind: TokenKind;
}
export type Line = Token[];

/** What the code is made of: it looks right and compiles in a head, but says nothing. */
const NOUNS = ['coffee', 'office', 'desk', 'monday', 'pizza', 'kurt', 'ellie', 'blueprint', 'wall', 'stapler', 'meeting', 'printer', 'bug', 'vibes', 'sprint', 'juice', 'fridge', 'sofa', 'plant', 'cable'];
const VERBS = ['brew', 'build', 'merge', 'deploy', 'refactor', 'feed', 'ship', 'nap', 'hug', 'mute', 'stack', 'polish', 'rename', 'water'];
const WORDS = ['ok', 'later', 'maybe', 'yes', 'tuesday', 'cozy', 'nope', 'soon', 'fine', 'meow'];
const COMMENTS = ['TODO: ask the stapler', 'works on my sofa', 'do not feed after midnight', 'this fixes monday', 'please be a function', 'magic, do not touch', 'FIXME: it is Friday'];

const k = (text: string): Token => ({ text, kind: 'keyword' });
const f = (text: string): Token => ({ text, kind: 'fn' });
const s = (text: string): Token => ({ text: `'${text}'`, kind: 'string' });
const n = (text: string | number): Token => ({ text: String(text), kind: 'number' });
const p = (text: string): Token => ({ text, kind: 'punct' });
const id = (text: string): Token => ({ text, kind: 'name' });
const c = (text: string): Token => ({ text: `// ${text}`, kind: 'comment' });

type Pick = { noun: () => string; verb: () => string; word: () => string; num: () => number; comment: () => string };

/** Single lines and little blocks of code, with every bracket closed. */
const TEMPLATES: Array<(w: Pick) => Line[]> = [
  (w) => [[k('const '), id(w.noun()), p(' = '), k('await '), id(w.noun()), p('.'), f(w.verb()), p('('), id(w.noun()), p(');')]],
  (w) => [[k('if '), p('('), id(w.noun()), p(' > '), n(w.num()), p(') '), k('return '), id(w.noun()), p('.'), f(w.verb()), p('();')]],
  (w) => [[k('for '), p('('), k('let '), id('i'), p(' = '), n(0), p('; i < '), n(w.num()), p('; i++) '), id(w.noun()), p('.'), f(w.verb()), p('(i);')]],
  (w) => [[id(w.noun()), p('.'), f(w.verb()), p('('), id(w.noun()), p(' ?? '), s(w.word()), p(');')]],
  (w) => [[c(w.comment())]],
  (w) => [[k('import '), p('{ '), id(w.noun()), p(', '), id(w.noun()), p(' } '), k('from '), s(`./${w.noun()}`), p(';')]],
  (w) => [[k('while '), p('(!'), id(w.noun()), p('.'), id(`${w.verb()}d`), p(') '), id(w.noun()), p('.'), f(w.verb()), p('();')]],
  (w) => [[k('const '), id(w.noun()), p(' = ['), n(w.num()), p(', '), n(w.num()), p(', '), n(w.num()), p('].'), f('map'), p('('), id(w.noun()), p(' => '), id(w.noun()), p(' * '), n(w.num()), p(');')]],
  (w) => [
    [k('function '), f(`${w.verb()}${w.noun()[0].toUpperCase()}${w.noun().slice(1)}`), p('('), id(w.noun()), p(') {')],
    [p('  '), k('return '), id(w.noun()), p(' * '), n(w.num()), p(' + '), id(w.noun()), p(';')],
    [p('}')],
  ],
  (w) => [
    [k('try '), p('{ '), id(w.noun()), p('.'), f(w.verb()), p('('), s(w.word()), p('); '), p('} '), k('catch '), p('{ '), id(w.noun()), p('.'), f(w.verb()), p('(); }')],
  ],
];

/** A speech bubble's worth of nonsense code (2 or 3 lines), the same every time for the same `seed`. */
export function codeSnippet(seed: number, rnd: Rng = seeded(0x51ed + seed * 7919)): Line[] {
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const w: Pick = { noun: () => pick(NOUNS), verb: () => pick(VERBS), word: () => pick(WORDS), num: () => 1 + Math.floor(rnd() * 99), comment: () => pick(COMMENTS) };
  const lines: Line[] = [];
  const want = 2 + (rnd() < 0.5 ? 1 : 0);
  while (lines.length < want) {
    const block = pick(TEMPLATES)(w);
    if (lines.length + block.length > 3) continue;
    lines.push(...block);
  }
  return lines;
}

export const lineText = (l: Line): string => l.map((t) => t.text).join('');
