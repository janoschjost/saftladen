import { describe, expect, it } from 'vitest';
import { MAX_FRAME } from './seams';
import { BLUR_FPS, FULL_FPS, FramePacer, IDLE_FPS, WAKE_TIME, type FrameState } from './framePacer';

const running: FrameState = { timeScale: 1, viewMoved: false, keysHeld: false, focused: true };
const still: FrameState = { ...running, timeScale: 0 };

/** frames the pacer draws in `seconds` of refreshes at `hz`, from `t0` ms */
function drawn(p: FramePacer, hz: number, seconds: number, s: FrameState, t0 = 10_000): number {
  let n = 0;
  for (let i = 0; i < hz * seconds; i++) if (p.due(t0 + (i * 1000) / hz, s)) n++;
  return n;
}

describe('perf.idle', () => {
  it('perf.idle: a running office draws at most 60 frames a second, whatever the display refreshes at', () => {
    for (const hz of [60, 120]) expect(drawn(new FramePacer(), hz, 10, running)).toBeCloseTo(FULL_FPS * 10, -1);
    for (const hz of [90, 144]) {
      const n = drawn(new FramePacer(), hz, 10, running) / 10;
      expect(n).toBeGreaterThan(55);
      expect(n).toBeLessThanOrEqual(FULL_FPS + 1);
    }
    expect(drawn(new FramePacer(), 30, 10, running)).toBe(300); // a slow display: every refresh
  });

  it('perf.idle: refreshes that jitter around 120 Hz still give 60 frames, not fewer', () => {
    const p = new FramePacer();
    let n = 0;
    for (let i = 0; i < 1200; i++) if (p.due(10_000 + i * (1000 / 120) + (i % 2 ? 1.5 : -1.5), running)) n++;
    expect(n / 10).toBeGreaterThan(58);
  });

  it('perf.idle: what counts as idle: time stands still, the camera is still, no key held, no input for a while', () => {
    const p = new FramePacer();
    expect(p.rate(10_000, still)).toBe(IDLE_FPS);
    expect(p.rate(10_000, running)).toBe(FULL_FPS); // 1x, 10x, 25x: the office lives
    expect(p.rate(10_000, { ...still, viewMoved: true })).toBe(FULL_FPS); // a camera flight or damping while paused
    expect(p.rate(10_000, { ...still, keysHeld: true })).toBe(FULL_FPS); // walking in the walk view
  });

  it('perf.idle: without focus the office draws slowly, paused and without focus it idles', () => {
    const p = new FramePacer();
    expect(p.rate(10_000, { ...running, focused: false })).toBe(BLUR_FPS);
    expect(p.rate(10_000, { ...still, focused: false })).toBe(IDLE_FPS);
    expect(drawn(p, 120, 10, { ...running, focused: false })).toBeCloseTo(BLUR_FPS * 10, -1);
  });

  it('perf.idle: a mouse moving all the time does not draw past the cap, with focus or without', () => {
    for (const [s, cap] of [[running, FULL_FPS], [{ ...running, focused: false }, BLUR_FPS]] as const) {
      const p = new FramePacer();
      let n = 0;
      for (let i = 0; i < 1200; i++) {
        const t = 10_000 + (i * 1000) / 120;
        p.wake(t);
        if (p.due(t + 1, s)) n++;
      }
      expect(n / 10).toBeLessThanOrEqual(cap + 1);
    }
  });

  it('perf.idle: back in focus, or moving again without input, the next refresh draws at once', () => {
    const p = new FramePacer();
    const blurred = { ...running, focused: false };
    let t = 10_000;
    for (; t < 11_000; t += 1000 / 120) p.due(t, blurred);
    expect(p.due(t, running)).toBe(true);
    expect(p.due(t + 1000 / 120, running)).toBe(false); // then 60 again
    for (t += 2000; t < 14_000; t += 1000 / 120) p.due(t, still);
    expect(p.due(t, { ...still, viewMoved: true })).toBe(true); // a flight a dev event started
  });

  it('perf.idle: a resize draws at once', () => {
    const p = new FramePacer();
    expect(p.due(10_000, still)).toBe(true);
    p.redraw();
    expect(p.due(10_008, still)).toBe(true);
  });

  it('perf.idle: input brings the full rate back at once and holds it a moment', () => {
    const p = new FramePacer();
    expect(p.due(10_000, still)).toBe(true);
    expect(p.due(10_008, still)).toBe(false); // idle: next frame in a quarter second
    p.wake(10_016);
    expect(p.due(10_017, still)).toBe(true); // the refresh right after the input draws
    expect(p.rate(10_017, still)).toBe(FULL_FPS);
    expect(p.rate(10_016 + WAKE_TIME * 1000 - 1, still)).toBe(FULL_FPS);
    expect(p.rate(10_016 + WAKE_TIME * 1000 + 1, still)).toBe(IDLE_FPS);
  });

  it('perf.idle: a paused office idles at 4 frames a second, so a frame never adds more than a quarter second', () => {
    expect(drawn(new FramePacer(), 120, 10, still)).toBeCloseTo(IDLE_FPS * 10, -1);
    expect(1 / IDLE_FPS).toBeLessThanOrEqual(MAX_FRAME); // game time stays correct even at the idle rate
  });
});
