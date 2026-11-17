import { PHASES, TOPICS, type Phase, type Topic } from './chatBlocks';

/** How somebody writes in the crew chat. Shared fallback lines are passed through it (`voice.ts`); own lines are kept as written. */
export interface VoiceStyle {
  /** 'lower': everything in small letters */
  case: 'normal' | 'lower';
  /** share of messages (0..1) with an emoji; the others lose the emoji a shared line brings */
  emoji: number;
  /** 'none': no full stops or commas; 'many': !! and ?? */
  punctuation: 'normal' | 'none' | 'many';
  /** share of messages (0..1) with one typo (two letters swapped) */
  typo: number;
  /** 'short': only the first sentence; 'long': now and then a sentence more */
  length: 'short' | 'normal' | 'long';
}

/** Own lines per topic: one list for every phase, or a list per phase (`{ "ask": [...], "after": [...] }`). */
export type VoiceLines = Partial<Record<Topic, readonly string[] | Partial<Record<Phase, readonly string[]>>>>;

/** One person's voice: `src/data/voices/<person-id>.json`. */
export interface Voice {
  style: VoiceStyle;
  /** words they use a lot ("jo", "Gopf", "✨"), mixed into some shared lines */
  signature: readonly string[];
  lines: VoiceLines;
}

export const DEFAULT_STYLE: VoiceStyle = { case: 'normal', emoji: 0.2, punctuation: 'normal', typo: 0, length: 'normal' };

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : []);
const rate = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Reads a voice file (or a dev's edit of one): whatever is missing or of the wrong kind falls back to the default, unknown topics are dropped. */
export function parseVoice(raw: unknown): Voice {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const s = o.style && typeof o.style === 'object' ? (o.style as Record<string, unknown>) : {};
  const lines: VoiceLines = {};
  const l = o.lines && typeof o.lines === 'object' ? (o.lines as Record<string, unknown>) : {};
  for (const topic of TOPICS) {
    const v = l[topic];
    if (Array.isArray(v)) {
      if (strings(v).length) lines[topic] = strings(v);
    } else if (v && typeof v === 'object') {
      const byPhase: Partial<Record<Phase, string[]>> = {};
      for (const phase of PHASES) if (strings((v as Record<string, unknown>)[phase]).length) byPhase[phase] = strings((v as Record<string, unknown>)[phase]);
      if (Object.keys(byPhase).length) lines[topic] = byPhase;
    }
  }
  return {
    style: {
      case: oneOf(s.case, ['normal', 'lower'], DEFAULT_STYLE.case),
      emoji: rate(s.emoji, DEFAULT_STYLE.emoji),
      punctuation: oneOf(s.punctuation, ['normal', 'none', 'many'], DEFAULT_STYLE.punctuation),
      typo: rate(s.typo, DEFAULT_STYLE.typo),
      length: oneOf(s.length, ['short', 'normal', 'long'], DEFAULT_STYLE.length),
    },
    signature: strings(o.signature),
    lines,
  };
}

const files = import.meta.glob<unknown>('./voices/*.json', { eager: true, import: 'default' });

/** The voices in the repo by person id; somebody without a file gets the default voice (`voiceOf`). */
export const voiceFiles: Readonly<Record<string, Voice>> = Object.fromEntries(
  Object.entries(files).map(([path, raw]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), parseVoice(raw)]),
);
