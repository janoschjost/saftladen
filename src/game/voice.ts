import { chatBlocks, PHASES, type Phase, type Topic } from '../data/chatBlocks';
import { parseVoice, voiceFiles, type Voice } from '../data/voices';
import type { Rng } from './rng';

/**
 * What somebody writes in the crew chat (#195), German only. `speak` is pure: same person, topic and dice, same line.
 *
 * Where a line comes from, in this order:
 * 1. the person's own lines for the topic (`src/data/voices/<id>.json`: for the phase, else for the whole topic), kept as written;
 * 2. the shared pool of the topic (`src/data/chatBlocks.ts`: the phase, else any phase), then
 * 3. the idle pool (`random`),
 * and a shared line is passed through the person's style (case, emoji, punctuation, typos, length, signature words).
 */

/** Dev edits of a voice (dev panel), over the file in the repo until they are pasted into it. */
const overrides = new Map<string, Voice>();
const fallback = parseVoice({});

/** The voice of person `id`: a dev's edit, else their file, else the default. */
export function voiceOf(id: string): Voice {
  return overrides.get(id) ?? voiceFiles[id] ?? fallback;
}

/** Puts a dev's edit over somebody's voice (null: back to the file). */
export function setVoice(id: string, voice: Voice | null): void {
  if (voice) overrides.set(id, voice);
  else overrides.delete(id);
}

export interface SpeakOptions {
  /** what moment of the topic (before, an answer, while, after); none: any */
  phase?: Phase;
  /** who `{who}` stands for */
  who?: string;
  /** a voice instead of the person's own (tests, the dev panel's preview) */
  voice?: Voice;
}

/** One of `list` (not empty), rolled with `rng`. */
export const pickFrom = <T>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)];

const firstSentence = (text: string): string => text.split(/(?<=[.!?…])\s+/)[0];

/** The person's own lines for the topic (and phase), empty when they have none. */
function ownLines(voice: Voice, topic: Topic, phase?: Phase): readonly string[] {
  const l = voice.lines[topic];
  if (!l) return [];
  if (Array.isArray(l)) return l as readonly string[];
  const byPhase = l as Partial<Record<Phase, readonly string[]>>;
  if (phase) return byPhase[phase] ?? [];
  return PHASES.flatMap((p) => byPhase[p] ?? []);
}

/** The shared lines for the topic: the phase, else any phase of it, else the idle chatter. */
export function sharedLines(topic: Topic, phase?: Phase): readonly string[] {
  const b = chatBlocks[topic];
  const exact = phase ? (b[phase] ?? []) : [];
  if (exact.length) return exact;
  const any = PHASES.flatMap((p) => b[p] ?? []);
  return any.length ? any : (chatBlocks.random.during ?? []);
}

/** One line of `person` about `topic`. */
export function speak(person: { id: string }, topic: Topic, rng: Rng, opts: SpeakOptions = {}): string {
  const voice = opts.voice ?? voiceOf(person.id);
  const own = ownLines(voice, topic, opts.phase);
  const fill = (s: string) => s.replace(/\{who\}/g, opts.who ?? 'jemand');
  if (own.length) return fill(pickFrom(own, rng));
  return styled(fill(pickFrom(sharedLines(topic, opts.phase), rng)), voice, topic, rng);
}

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
/** an emoji that fits the topic, for a line that has none */
const TOPIC_EMOJI: Record<Topic, readonly string[]> = {
  greeting: ['👋', '😊', '☀️'],
  coffee: ['☕', '😌'],
  lunch: ['🍕', '🥙', '😋'],
  printer: ['🖨️', '🙄'],
  server: ['🔥', '😤', '🔧'],
  rain: ['🌧️', '☔'],
  meeting: ['📅', '🙈'],
  complaint: ['🙄', '😩'],
  random: ['😄', '🤔', '🙃'],
  play: ['⚽', '🏎️', '🎮'],
  toilet: ['🚽', '🙈'],
  pet: ['🐶', '🥰'],
};
/** what a long-winded writer adds now and then */
const TAILS = ['Was meint ihr?', 'Sagt Bescheid.', 'Nur so als Info.', 'Danke euch!'];

/** Swaps two neighbouring letters inside a word of four letters or more. */
function typo(text: string, rng: Rng): string {
  const words = [...text.matchAll(/\p{L}{4,}/gu)];
  if (!words.length) return text;
  const w = pickFrom(words, rng);
  const i = w.index! + 1 + Math.floor(rng() * (w[0].length - 2));
  return text.slice(0, i - 1) + text[i] + text[i - 1] + text.slice(i + 1);
}

/** A shared line in somebody's style. */
export function styled(text: string, voice: Voice, topic: Topic, rng: Rng): string {
  const s = voice.style;
  let t = text;
  if (s.length === 'short') t = firstSentence(t);
  else if (s.length === 'long' && rng() < 0.5) t = `${t} ${pickFrom(TAILS, rng)}`;
  if (s.punctuation === 'none') t = t.replace(/[.,](?=\s|$)/g, '');
  else if (s.punctuation === 'many') t = t.replace(/\.(?=\s*$)/, '!').replace(/([!?])(?=\s|$)/g, '$1$1');
  if (rng() < s.typo) t = typo(t, rng);
  if (rng() < s.emoji) {
    if (!HAS_EMOJI.test(t)) t = `${t} ${pickFrom(TOPIC_EMOJI[topic], rng)}`;
  } else {
    t = t.replace(EMOJI, '');
  }
  // after the emoji rule: a signature emoji (✨) is theirs and stays
  if (voice.signature.length && rng() < 0.3) {
    const sig = pickFrom(voice.signature, rng);
    // a short word leads ("jo, ..."), anything else (an emoji, "Liebe Grüsse") closes the line
    t = /^\p{L}{1,6}$/u.test(sig) ? `${sig}, ${t.charAt(0).toLowerCase()}${t.slice(1)}` : `${t} ${sig}`;
  }
  if (s.case === 'lower') t = t.toLowerCase();
  return t.replace(/\s{2,}/g, ' ').trim();
}

/** A line short enough for a speech bubble: as it is up to `max` characters, else the first sentence, cut at a word with … past `max`. */
export function bubbleLine(text: string, max = 40): string {
  if (text.length <= max) return text;
  const first = firstSentence(text);
  if (first.length <= max) return first;
  // by code points, so an emoji is never cut in half
  const cut = [...first].slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return `${space > max / 2 ? cut.slice(0, space) : cut}`.trimEnd() + '…';
}
