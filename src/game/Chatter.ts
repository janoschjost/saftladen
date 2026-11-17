import type { Topic } from '../data/chatBlocks';
import type { Person } from './Person';
import { random, stream } from './rng';
import { bubbleLine, speak } from './voice';

/** A body-language beat: how somebody reacts while others talk (played by the game's `poseReaction`). */
export type Reaction = 'laugh' | 'point' | 'shrug' | 'surprise' | 'nod' | 'think' | 'wave' | 'cheer';

/** How long each reaction lasts, in seconds. */
export const REACTION_TIME: Record<Reaction, number> = {
  laugh: 1.5,
  point: 1.1,
  shrug: 1.2,
  surprise: 1,
  nod: 1.1,
  think: 1.5,
  wave: 1.3,
  cheer: 1.3,
};

interface Beat {
  /** what the speech bubble shows: no words, just a mood */
  symbol: string;
  /** what the speaker does with their body */
  speaker: Reaction;
  /** what the listeners do (each only sometimes) */
  listeners: Reaction;
  /** how often it comes up in a chat / in a heated discussion */
  chat: number;
  discussion: number;
}

const BEATS: Beat[] = [
  { symbol: '…', speaker: 'think', listeners: 'nod', chat: 3, discussion: 2 },
  { symbol: '😄', speaker: 'laugh', listeners: 'laugh', chat: 3, discussion: 0.7 },
  { symbol: '?', speaker: 'shrug', listeners: 'think', chat: 2, discussion: 2 },
  { symbol: '!', speaker: 'point', listeners: 'nod', chat: 1.5, discussion: 3 },
  { symbol: '!?', speaker: 'surprise', listeners: 'surprise', chat: 1, discussion: 2.5 },
  { symbol: '♪', speaker: 'cheer', listeners: 'cheer', chat: 0.8, discussion: 0.3 },
];

/** Bubbles for the special moments of a talk. */
export const SIGNALS = {
  join: { symbol: '👋', reaction: 'wave' as Reaction },
  bye: { symbol: '👋', reaction: 'wave' as Reaction },
  topic: { symbol: '💡', reaction: 'point' as Reaction },
};

export const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)];

function weighted(kind: 'chat' | 'discussion'): Beat {
  const total = BEATS.reduce((s, b) => s + b[kind], 0);
  let r = random() * total;
  for (const b of BEATS) if ((r -= b[kind]) <= 0) return b;
  return BEATS[0];
}

/** The speaker acts out a beat; every listener joins in now and then, slightly out of sync. */
export function playBeat(speaker: Person, listeners: readonly Person[], speakerReaction: Reaction, listenerReaction: Reaction | null): void {
  speaker.react(speakerReaction);
  if (!listenerReaction) return;
  for (const l of listeners) if (l !== speaker && random() < 0.55) l.react(listenerReaction, 0.15 + random() * 0.5);
}

/** share of talk turns whose bubble shows words (in the speaker's voice, `voice.ts`) instead of the beat's symbol */
export const TEXT_SHARE = 0.6;
/** the words are rolled on a side stream: the simulation's dice stay as they were before bubbles had words */
const words = stream(0x7e47);

/**
 * One thread of talk: every turn is a bubble plus matching body language for the speaker and the listeners. The
 * bubble shows a short line about `topic` in the speaker's voice (`TEXT_SHARE` of the turns), else the beat's symbol.
 */
export class Chat {
  turns = 0;

  constructor(readonly topic: Topic = 'random') {}

  /** The next bubble for `speaker`; also starts the animations. */
  next(speaker: Person, members: readonly Person[], kind: 'chat' | 'discussion'): string {
    const beat = weighted(kind);
    this.turns++;
    playBeat(speaker, members, beat.speaker, beat.listeners);
    return words() < TEXT_SHARE ? bubbleLine(speak(speaker, this.topic, words)) : beat.symbol;
  }
}
