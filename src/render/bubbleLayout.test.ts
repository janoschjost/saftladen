import { describe, expect, it } from 'vitest';
import { BUBBLE, bubbleWorldHeight, dimmedOpacity, easeLift, maxLift, popScale, shiftIntoView, stackBubbles, stepDim, stepOpacity, type BubbleRect } from './bubbleLayout';

const overlaps = (a: BubbleRect, la: number, b: BubbleRect, lb: number) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.y - la - a.h < b.y - lb && a.y - la > b.y - lb - b.h;

describe('social.bubbles', () => {
  it('is world-sized between the zoom clamps', () => {
    const ppm = (BUBBLE.minPx + BUBBLE.maxPx) / 2 / BUBBLE.height;
    expect(bubbleWorldHeight(ppm)).toBeCloseTo(BUBBLE.height);
    // zooming in within the clamps: same world size, so bigger on screen
    expect(bubbleWorldHeight(ppm * 1.1) * ppm * 1.1).toBeGreaterThan(bubbleWorldHeight(ppm) * ppm);
  });

  it('stays readable zoomed out and never grows past the max zoomed in', () => {
    const far = 10; // px per metre, far zoomed out
    expect(bubbleWorldHeight(far) * far).toBeCloseTo(BUBBLE.minPx);
    const near = 2000;
    expect(bubbleWorldHeight(near) * near).toBeCloseTo(BUBBLE.maxPx);
    // screen size grows monotonically with zoom
    let last = 0;
    for (let p = 5; p < 3000; p *= 1.3) {
      const px = bubbleWorldHeight(p) * p;
      expect(px).toBeGreaterThanOrEqual(last - 1e-9);
      last = px;
    }
    expect(bubbleWorldHeight(0)).toBe(BUBBLE.height);
    expect(bubbleWorldHeight(NaN)).toBe(BUBBLE.height);
  });

  it('bubbles apart from each other stay where they are', () => {
    const lifts = stackBubbles([
      { id: 'a', x: 100, y: 300, w: 40, h: 30 },
      { id: 'b', x: 300, y: 300, w: 40, h: 30 },
    ]);
    expect(lifts.get('a')).toBe(0);
    expect(lifts.get('b')).toBe(0);
  });

  it('neighbouring seated speakers do not overlap: the lower one stays, the others stack up', () => {
    // a row of desks: heads close together on screen, all chatting
    const rects: BubbleRect[] = [0, 1, 2, 3, 4].map((i) => ({ id: `p${i}`, x: 200 + i * 25, y: 300 + (i % 2) * 6, w: 50, h: 28 }));
    const lifts = stackBubbles(rects);
    expect(lifts.get('p1')).toBe(0); // lowest on screen (largest y) keeps its spot
    for (const a of rects) for (const b of rects) if (a !== b) expect(overlaps(a, lifts.get(a.id)!, b, lifts.get(b.id)!)).toBe(false);
    for (const r of rects) expect(lifts.get(r.id)).toBeGreaterThanOrEqual(0);
  });

  it('stacking is stable for equal input', () => {
    const rects: BubbleRect[] = [
      { id: 'b', x: 100, y: 200, w: 40, h: 30 },
      { id: 'a', x: 100, y: 200, w: 40, h: 30 },
    ];
    expect([...stackBubbles(rects)]).toEqual([...stackBubbles([...rects].reverse())]);
    expect(stackBubbles(rects).get('a')).toBe(0);
    expect(stackBubbles(rects).get('b')).toBe(30 + BUBBLE.spacing);
  });

  it('fades in and out instead of popping on and off', () => {
    let o = 0;
    o = stepOpacity(o, true, BUBBLE.fadeIn / 2);
    expect(o).toBeGreaterThan(0);
    expect(o).toBeLessThan(1);
    o = stepOpacity(o, true, 1);
    expect(o).toBe(1);
    o = stepOpacity(o, false, BUBBLE.fadeOut / 2);
    expect(o).toBeCloseTo(0.5);
    expect(stepOpacity(o, false, 1)).toBe(0);
  });

  it('a new line pops: starts small, overshoots, settles at 1', () => {
    expect(popScale(0)).toBeCloseTo(0.6);
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => popScale((i / 50) * BUBBLE.pop)));
    expect(peak).toBeGreaterThan(1);
    expect(popScale(BUBBLE.pop)).toBe(1);
    expect(popScale(5)).toBe(1);
  });

  it('a lifted bubble slides to its place instead of jumping', () => {
    const l = easeLift(0, 40, 1 / 60);
    expect(l).toBeGreaterThan(0);
    expect(l).toBeLessThan(40);
    expect(easeLift(0, 40, 1)).toBe(40);
  });
});

describe('social.bubbles: inside the view and faded when hidden', () => {
  const screen = { width: 800, height: 600 };
  const view = { left: 8, top: 8, right: 792 };
  const rect = (x: number, y = 300, w = 100, h = 40): BubbleRect => ({ id: 'a', x, y, w, h });

  it('social.bubbles: a bubble that fits stays, one over the edge is pushed back in', () => {
    expect(shiftIntoView(rect(400), view, screen)).toBe(0);
    expect(shiftIntoView(rect(20), view, screen)).toBe(8 + 50 - 20);
    expect(shiftIntoView(rect(790), view, screen)).toBe(792 - 50 - 790);
  });

  it('social.bubbles: a speaker outside the screen gets no bubble dragged in', () => {
    expect(shiftIntoView(rect(-30), view, screen)).toBe(0);
    expect(shiftIntoView(rect(900), view, screen)).toBe(0);
    expect(shiftIntoView(rect(400, 700), view, screen)).toBe(0);
  });

  it('social.bubbles: a bubble wider than the view is centred', () => {
    expect(shiftIntoView(rect(100, 300, 2000), view, screen)).toBe(400 - 100);
  });

  it('social.bubbles: a lift never takes the bubble past the top of the view', () => {
    expect(maxLift(rect(400, 300, 100, 40), view)).toBe(300 - 40 - 8);
    expect(maxLift(rect(400, 20, 100, 40), view)).toBe(0);
  });

  it('social.bubbles: a hidden speaker fades the bubble to the hidden opacity and back, smoothly', () => {
    expect(dimmedOpacity(1, 0)).toBe(1);
    expect(dimmedOpacity(1, 1)).toBeCloseTo(BUBBLE.hiddenOpacity);
    expect(dimmedOpacity(0, 1)).toBe(0);
    let d = 0;
    let frames = 0;
    for (; d < 1 && frames < 600; frames++) d = stepDim(d, true, 1 / 60);
    expect(frames).toBeGreaterThan(3); // a fade, not a jump
    expect(frames).toBeLessThan(60);
    expect(stepDim(d, false, 1 / 60)).toBeLessThan(1);
    expect(stepDim(0, false, 1)).toBe(0);
  });
});
