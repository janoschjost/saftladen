/**
 * The timeline of the origin-story intro (#322): which sentence shows when, when Claudius is summoned and when the
 * camera moves into the blueprint and the picture hands over to the office. Pure maths, so it can be tested in Node.
 */

export interface Line {
  de: string;
  en: string;
}

/** seconds before the first sentence */
const LEAD = 1.2;
/** a sentence stays this long, plus this much per character of the German line */
const BASE = 1.8;
const PER_CHAR = 0.038;
/** seconds the camera takes into the blueprint after the last sentence, and the crossfade to the office that follows */
export const PUSH = 2.6;
export const FADE = 1;
/** the sentence that summons Claudius: Clawd and the blueprint appear with it */
export const SUMMON_LINE = 7;

export interface Timeline {
  /** when each sentence appears (seconds) */
  starts: number[];
  /** Claudius appears, the blueprint starts to build */
  summon: number;
  /** the last sentence is over: the camera moves into the blueprint */
  push: number;
  /** the camera has arrived: the picture fades to the office, the game takes over */
  fade: number;
  end: number;
}

export function timeline(lines: readonly Line[]): Timeline {
  const starts: number[] = [];
  let t = LEAD;
  for (const line of lines) {
    starts.push(t);
    t += BASE + PER_CHAR * line.de.length;
  }
  return { starts, summon: starts[Math.min(SUMMON_LINE, starts.length - 1)], push: t, fade: t + PUSH, end: t + PUSH + FADE };
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
    sparks: during(tl, t, 4, 0.6, 6), // "… Er lehrte den Älteren alles, was er wusste."
    oath: during(tl, t, 6), // "… und schworen einen Eid …"
    puff: span(t, tl.summon, tl.summon + 1.4),
    clawd: t >= tl.summon + 0.35,
    built: blueprintLevel(tl, t),
    pad: span(t, tl.summon + 0.3, tl.summon + 1.3),
  };
}
