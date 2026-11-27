/**
 * The timeline of the origin-story intro (#322): which sentence shows when, when Claudius is summoned and when the
 * camera moves into the blueprint and the picture hands over to the office. Pure maths, so it can be tested in Node.
 */

export interface Line {
  de: string;
  en: string;
}

/** seconds before the first sentence, and after René's greeting (the scene has been on for a while then) */
export const LEAD = 4;
export const AFTER_GREETING = 1;
/** a sentence stays this long, plus this much per character of the German line */
const BASE = 2.6;
const PER_CHAR = 0.06;
/** seconds the camera takes into the blueprint after the last sentence; clouds roll in over the last `CLOUDS` of them */
export const PUSH = 2.6;
export const CLOUDS = 1.5;
/** the picture stays white this long, then the clouds part over the office for `FADE` seconds */
export const HOLD = 0.4;
export const FADE = 1.8;
/** the sentence that summons Claudius: Clawd and the blueprint appear with it */
export const SUMMON_LINE = 7;

export interface Timeline {
  /** how long René's greeting takes in front of the story (0 without it): the story's camera and sentences start after it */
  greet: number;
  /** when each sentence appears (seconds) */
  starts: number[];
  /** Claudius appears, the blueprint starts to build */
  summon: number;
  /** the last sentence is over: the camera moves into the blueprint */
  push: number;
  /** the camera has arrived and the clouds have closed: all white, the scene behind them is gone */
  fade: number;
  /** the clouds start to part over the office: the game takes over and flies in */
  clear: number;
  end: number;
}

export function timeline(lines: readonly Line[], greet = 0): Timeline {
  const starts: number[] = [];
  let t = greet > 0 ? greet + AFTER_GREETING : LEAD;
  for (const line of lines) {
    starts.push(t);
    t += BASE + PER_CHAR * line.de.length;
  }
  return { greet, starts, summon: starts[Math.min(SUMMON_LINE, starts.length - 1)], push: t, fade: t + PUSH, clear: t + PUSH + HOLD, end: t + PUSH + HOLD + FADE };
}

/** The sentence on screen at `t`: -1 before the first one; the last one stays until the end. */
export function lineAt(tl: Timeline, t: number): number {
  let i = -1;
  while (i + 1 < tl.starts.length && t >= tl.starts[i + 1]) i++;
  return i;
}

/** 0..1 between two moments, clamped. */
export function span(t: number, from: number, to: number): number {
  return to <= from ? (t >= to ? 1 : 0) : Math.min(1, Math.max(0, (t - from) / (to - from)));
}

/**
 * How much of something that belongs to sentence `line` shows at `t`: fades in over `ramp` seconds when the sentence
 * starts and out again over the last `ramp` seconds before sentence `until` starts (default: the next one).
 */
export function during(tl: Timeline, t: number, line: number, ramp = 0.6, until = line + 1): number {
  const from = tl.starts[line];
  const to = tl.starts[until] ?? tl.push;
  return Math.min(span(t, from, from + ramp), 1 - span(t, to - ramp, to));
}

/** How far the blueprint is built at `t`: it starts shortly after the summoning and is complete when the camera arrives. */
export function blueprintLevel(tl: Timeline, t: number): number {
  return span(t, tl.summon + 0.8, tl.fade - 0.4);
}

/** What the scene shows at `t` (the fields of `StoryStage` in `CreditsScene`): the acting of each sentence, the summoning and the blueprint. */
export function stageAt(tl: Timeline, t: number): { slump: number; wizard: number; sparks: number; oath: number; puff: number; clawd: boolean; built: number; pad: number } {
  return {
    slump: during(tl, t, 3), // "… war der Ältere an solch dunkler Magie gescheitert."
    wizard: during(tl, t, 4), // "Der Jüngere aber war ein mächtiger Magier …"
    sparks: during(tl, t, 5), // "Er lehrte den Älteren alles, was er wusste."
    oath: during(tl, t, 6), // "… und schworen einen Eid …"
    puff: span(t, tl.summon, tl.summon + 1.4),
    clawd: t >= tl.summon + 0.35,
    built: blueprintLevel(tl, t),
    pad: span(t, tl.summon + 0.3, tl.summon + 1.3),
  };
}

/** The clouds between the story and the office at `t`: how far they have rolled in (1 = all white) and how far they have parted again. */
export function cloudsAt(tl: Timeline, t: number): { closed: number; parted: number } {
  return { closed: span(t, tl.fade - CLOUDS, tl.fade), parted: span(t, tl.clear, tl.end) };
}

/** René's greeting (#333): seconds he takes to walk in, and to walk off while the camera swings to the desk */
export const WALK_IN = 3.2;
export const LEAVE = 3;
/** a bubble stays this long plus this much per character, with a short gap to the next */
const SAY = 1.3;
const SAY_PER_CHAR = 0.05;
const SAY_GAP = 0.35;

export interface Greeting {
  /** when each of his lines appears and goes */
  starts: number[];
  ends: number[];
  /** he turns to go, the camera starts to swing */
  leave: number;
  total: number;
}

export function greeting(texts: readonly string[]): Greeting {
  const starts: number[] = [];
  const ends: number[] = [];
  let t = WALK_IN + 0.4;
  for (const text of texts) {
    starts.push(t);
    t += SAY + SAY_PER_CHAR * text.length;
    ends.push(t);
    t += SAY_GAP;
  }
  return { starts, ends, leave: t, total: t + LEAVE };
}

/** René at `t`: how far he has walked in, which line he says (-1: none), how far he has walked off. */
export function greetAt(g: Greeting, t: number): { walk: number; line: number; off: number } {
  return { walk: span(t, 0, WALK_IN), line: g.starts.findIndex((s, i) => t >= s && t < g.ends[i]), off: span(t, g.leave, g.total - 0.4) };
}
