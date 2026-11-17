import { describe, expect, it } from 'vitest';
import { chatBlocks, TOPICS } from '../data/chatBlocks';
import { team } from '../data/team';
import { parseVoice, voiceFiles, type Voice } from '../data/voices';
import { seeded } from './rng';
import { bubbleLine, setVoice, sharedLines, speak, styled, voiceOf } from './voice';

const plain = (over: Partial<Voice['style']> = {}, rest: Partial<Omit<Voice, 'style'>> = {}): Voice =>
  parseVoice({ style: { case: 'normal', emoji: 0, punctuation: 'normal', typo: 0, length: 'normal', ...over }, ...rest });
const many = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i));
const EMOJI = /\p{Extended_Pictographic}/u;
const someone = { id: 'nobody-in-particular' };

describe('voice', () => {
  it('chat.voice: every person of the team has a voice file, and every topic a shared pool', () => {
    for (const m of team) expect(voiceFiles[m.id], m.id).toBeDefined();
    for (const t of TOPICS) expect(sharedLines(t).length, t).toBeGreaterThan(0);
  });

  it('chat.voice: same seed, same lines', () => {
    const run = (seed: number) => {
      const rng = seeded(seed);
      return many(40, (i) => speak({ id: team[i % team.length].id }, TOPICS[i % TOPICS.length], rng));
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('chat.voice: own lines come first, kept as written; per phase they only answer that phase', () => {
    const v = plain({ case: 'lower', emoji: 1, punctuation: 'many', typo: 1 }, { lines: { coffee: ['Kafi? ☕'], lunch: { reply: ['Bin dabei, Chef.'] } } });
    const rng = seeded(1);
    expect(new Set(many(20, () => speak(someone, 'coffee', rng, { voice: v, phase: 'ask' })))).toEqual(new Set(['Kafi? ☕']));
    expect(speak(someone, 'lunch', rng, { voice: v, phase: 'reply' })).toBe('Bin dabei, Chef.');
    // no own ask for lunch: the shared asks, in the person's style (lower case)
    const lower = plain({ case: 'lower' }, { lines: v.lines });
    expect(chatBlocks.lunch.ask!.map((l) => l.toLowerCase())).toContain(speak(someone, 'lunch', rng, { voice: lower, phase: 'ask' }));
  });

  it('chat.voice: without own lines the shared pool of the phase, else of the topic, else the idle chatter', () => {
    const v = plain();
    const rng = seeded(3);
    for (const line of many(30, () => speak(someone, 'coffee', rng, { voice: v, phase: 'reply' }))) expect(chatBlocks.coffee.reply).toContain(line);
    // toilet has no reply: any toilet line
    const toilet = [...(chatBlocks.toilet.ask ?? []), ...(chatBlocks.toilet.during ?? []), ...(chatBlocks.toilet.after ?? [])];
    for (const line of many(20, () => speak(someone, 'toilet', rng, { voice: v, phase: 'reply' }))) expect(toilet).toContain(line);
    expect(sharedLines('random', 'ask')).toEqual(chatBlocks.random.during);
  });

  it('chat.voice: {who} is filled in', () => {
    const v = plain({}, { lines: { greeting: ['{who} ist da!'] } });
    expect(speak(someone, 'greeting', seeded(1), { voice: v, who: 'Zlatko' })).toBe('Zlatko ist da!');
  });

  it('chat.voice: style rules: case, punctuation, length, emoji rate, typos, signature', () => {
    const rng = seeded(5);
    const line = 'Bin unterwegs, bin gleich zurück. Wer kommt mit?';
    expect(styled(line, plain({ case: 'lower' }), 'random', rng)).toBe('bin unterwegs, bin gleich zurück. wer kommt mit?');
    expect(styled(line, plain({ punctuation: 'none' }), 'random', rng)).toBe('Bin unterwegs bin gleich zurück Wer kommt mit?');
    expect(styled(line, plain({ punctuation: 'many' }), 'random', rng)).toBe('Bin unterwegs, bin gleich zurück. Wer kommt mit??');
    expect(styled(line, plain({ length: 'short' }), 'random', rng)).toBe('Bin unterwegs, bin gleich zurück.');
    // emoji 0: a shared line loses its emoji; emoji 1: every line has one
    expect(styled('Tor! 🎉', plain({ emoji: 0 }), 'play', rng)).toBe('Tor!');
    for (const l of many(20, () => styled('Kaffee?', plain({ emoji: 1 }), 'coffee', rng))) expect(l).toMatch(EMOJI);
    // a typo swaps two letters: same letters, other order
    const typo = styled('Maschine', plain({ typo: 1 }), 'coffee', rng);
    expect(typo).not.toBe('Maschine');
    expect([...typo].sort().join('')).toBe([...'Maschine'].sort().join(''));
    // a short signature word leads, anything else closes the line
    const sig = many(40, () => styled('Kaffee?', plain({}, { signature: ['jo'] }), 'coffee', rng));
    expect(sig).toContain('jo, kaffee?');
    expect(sig).toContain('Kaffee?');
    expect(many(40, () => styled('Kaffee?', plain({}, { signature: ['Liebe Grüsse'] }), 'coffee', rng))).toContain('Kaffee? Liebe Grüsse');
  });

  it('chat.voice: the emoji rate is the share of messages with an emoji', () => {
    const rng = seeded(11);
    const share = (emoji: number) => many(400, () => styled('Kaffee?', plain({ emoji }), 'coffee', rng)).filter((l) => EMOJI.test(l)).length / 400;
    expect(share(0)).toBe(0);
    expect(share(0.3)).toBeGreaterThan(0.2);
    expect(share(0.3)).toBeLessThan(0.4);
  });

  it('chat.voice: a broken or half-filled voice file falls back to the default per field; a dev edit wins over the file', () => {
    const v = parseVoice({ style: { case: 'SHOUT', emoji: 7 }, signature: 'nope', lines: { coffee: [], lunch: ['Hunger'], nonsense: ['x'] } });
    expect(v.style).toEqual({ case: 'normal', emoji: 1, punctuation: 'normal', typo: 0, length: 'normal' });
    expect(v.signature).toEqual([]);
    expect(v.lines).toEqual({ lunch: ['Hunger'] });
    const id = team[0].id;
    setVoice(id, plain({}, { lines: { random: ['Edit'] } }));
    expect(speak({ id }, 'random', seeded(1))).toBe('Edit');
    setVoice(id, null);
    expect(voiceOf(id)).toBe(voiceFiles[id]);
  });

  it('chat.voice: bubble lines are one short sentence', () => {
    expect(bubbleLine('Kaffee? Ich geh jetzt.')).toBe('Kaffee?');
    const long = bubbleLine('Ich lauf kurz zum Take-away und hole für alle etwas Feines zum Mittag');
    expect(long.length).toBeLessThanOrEqual(41);
    expect(long.endsWith('…')).toBe(true);
  });
});
