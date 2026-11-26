/**
 * Placement, size and animation math of the speech bubbles (`Bubbles.ts`), kept free of three.js so it can be tested.
 * Screen coordinates are pixels with y pointing down.
 */
export const BUBBLE = {
  /** metres between the top of the speaker's head and the tip of the tail, the same seated or standing */
  gap: 0.1,
  /** world height of the bubble body (without tail) in metres */
  height: 0.5,
  /** the body's height on screen is clamped to this range (px), so it stays readable zoomed out and doesn't fill the view zoomed in */
  minPx: 26,
  maxPx: 56,
  /** px kept free between two stacked bubbles */
  spacing: 4,
  /** seconds to fade in / out */
  fadeIn: 0.14,
  fadeOut: 0.3,
  /** seconds of the pop when a new line starts */
  pop: 0.28,
  /** px kept free between a bubble and the edge of the view */
  edge: 8,
  /** opacity of a bubble whose speaker the scene hides from the camera, and the rate (per second) it fades there and back */
  hiddenOpacity: 0.35,
  dimRate: 6,
};

export type BubbleConfig = typeof BUBBLE;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * World height (m) of a bubble whose speaker is shown at `pxPerMetre` screen pixels per metre: world-sized (shrinks when
 * zoomed out, grows when zoomed in), but its screen height stays within `minPx`..`maxPx`.
 */
export function bubbleWorldHeight(pxPerMetre: number, c: BubbleConfig = BUBBLE): number {
  if (!(pxPerMetre > 0) || !Number.isFinite(pxPerMetre)) return c.height;
  return clamp(c.height * pxPerMetre, c.minPx, c.maxPx) / pxPerMetre;
}

/** A bubble on screen: `x` its centre, `y` the tip of its tail (where it points at the head), `w`/`h` the body in px. */
export interface BubbleRect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How far (px, upwards) each bubble has to move so no two overlap. The bubble lowest on screen keeps its place, the ones
 * behind it stack upwards in turn. Stable: equal input gives equal output, ties are broken by id.
 */
export function stackBubbles(rects: readonly BubbleRect[], spacing = BUBBLE.spacing): Map<string, number> {
  const order = [...rects].sort((a, b) => b.y - a.y || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed: Array<{ x: number; w: number; top: number; bottom: number }> = [];
  const lifts = new Map<string, number>();
  for (const r of order) {
    let lift = 0;
    // every hit only ever lifts further, so this ends after at most one pass per placed bubble
    for (let guard = 0; guard <= placed.length; guard++) {
      const bottom = r.y - lift;
      const top = bottom - r.h;
      const hit = placed.find((p) => Math.abs(p.x - r.x) < (p.w + r.w) / 2 + spacing && top < p.bottom + spacing && bottom > p.top - spacing);
      if (!hit) break;
      lift = r.y - (hit.top - spacing);
    }
    placed.push({ x: r.x, w: r.w, top: r.y - lift - r.h, bottom: r.y - lift });
    lifts.set(r.id, lift);
  }
  return lifts;
}

/** The part of the screen (px) a bubble may fill. */
export interface BubbleView {
  left: number;
  top: number;
  right: number;
}

/**
 * How far (px, sideways) a bubble has to move to stay inside `view`: 0 when it fits or when its tail tip is outside the
 * screen altogether (a speaker that is not shown gets no bubble dragged in from the edge). A bubble wider than the view
 * is centred.
 */
export function shiftIntoView(r: BubbleRect, view: BubbleView, screen: { width: number; height: number }): number {
  if (r.x < 0 || r.x > screen.width || r.y < 0 || r.y > screen.height) return 0;
  const lo = view.left + r.w / 2;
  const hi = view.right - r.w / 2;
  if (lo > hi) return (view.left + view.right) / 2 - r.x;
  return clamp(r.x, lo, hi) - r.x;
}

/** The most (px, upwards) a stacked bubble may be lifted without its top leaving `view`. */
export function maxLift(r: BubbleRect, view: BubbleView): number {
  return Math.max(0, r.y - r.h - view.top);
}

/** Opacity of a bubble `dim` (0..1) of the way into the hidden state: 1 when its speaker is seen, `hiddenOpacity` when not. */
export function dimmedOpacity(opacity: number, dim: number, c: BubbleConfig = BUBBLE): number {
  return opacity * (1 - (1 - c.hiddenOpacity) * dim);
}

/** Eases `dim` towards 1 (the speaker is hidden) or 0 (seen). */
export function stepDim(dim: number, hidden: boolean, dt: number, c: BubbleConfig = BUBBLE): number {
  const step = c.dimRate * dt;
  return hidden ? Math.min(1, dim + step) : Math.max(0, dim - step);
}

/** Opacity after `dt` seconds of fading in (`on`) or out. */
export function stepOpacity(opacity: number, on: boolean, dt: number, c: BubbleConfig = BUBBLE): number {
  return on ? Math.min(1, opacity + dt / c.fadeIn) : Math.max(0, opacity - dt / c.fadeOut);
}

/** Scale of the pop `t` seconds after a new line started: from 0.6 with a small overshoot back to 1. */
export function popScale(t: number, c: BubbleConfig = BUBBLE): number {
  if (t >= c.pop) return 1;
  const k = Math.max(0, t) / c.pop;
  // easeOutBack
  const s = 1.70158;
  const e = 1 + (s + 1) * (k - 1) ** 3 + s * (k - 1) ** 2;
  return 0.6 + 0.4 * e;
}

/** Eases the lift of a bubble towards its target, so a bubble slides out of the way instead of jumping. */
export function easeLift(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt * 12);
}
