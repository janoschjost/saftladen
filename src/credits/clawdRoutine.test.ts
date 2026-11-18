import { describe, expect, it } from 'vitest';
import { BUBBLES, BUBBLE_SECONDS, ClawdRoutine, Path, type ClawdPhase, type ClawdPlan } from './clawdRoutine';

const plan: ClawdPlan = {
  seat: { x: 3, y: 0.2, z: 3, yaw: -0.7 },
  path: new Path([[2.6, 3], [2.4, 2], [1, 1.8]]),
  talkYaw: 0,
};
const run = (r: ClawdRoutine, seconds: number, each?: (s: ReturnType<ClawdRoutine['step']>) => void) => {
  let last = r.step(0);
  for (let i = 0; i < seconds * 30; i++) {
    last = r.step(1 / 30);
    each?.(last);
  }
  return last;
};

describe('credits.clawd: Clawd works, now and then walks round the blueprint to tell code bubbles, and goes back', () => {
  it('credits.clawd: he sits at his laptop until it is time, and starts there', () => {
    const r = new ClawdRoutine(plan, 10, () => 0);
    const s = run(r, 9);
    expect(s).toMatchObject({ phase: 'work', x: 3, y: 0.2, z: 3, look: 'sit', yaw: -0.7 });
  });

  it('credits.clawd: a whole trip: stand, walk, talk, walk back, sit, work', () => {
    const r = new ClawdRoutine(plan, 1, () => 0);
    const seen: ClawdPhase[] = [];
    run(r, 60, (s) => seen[seen.length - 1] !== s.phase && seen.push(s.phase));
    expect(seen.slice(0, 7)).toEqual(['work', 'stand', 'walk', 'talk', 'back', 'sit', 'work']);
  });

  it('credits.clawd: he gets up where the path starts, stays on the floor and walks all of it', () => {
    const r = new ClawdRoutine(plan, 1, () => 0);
    let walked = 0;
    run(r, 25, (s) => {
      if (s.phase === 'walk' || s.phase === 'back') {
        expect(s.moving).toBe(true);
        expect(s.y).toBe(0);
        walked++;
      }
      if (s.phase === 'stand') expect(s.y).toBeLessThanOrEqual(0.2);
    });
    expect(walked).toBeGreaterThan(30 * 3);
  });

  it('credits.clawd: at the end of the path he faces the room and tells three code bubbles, then the next trip starts with the next ones', () => {
    const r = new ClawdRoutine(plan, 1, () => 0);
    const seen: number[] = [];
    let at: { x: number; z: number } | null = null;
    run(r, 30, (s) => {
      if (s.phase === 'talk') {
        at = s;
        if (s.bubble && seen[seen.length - 1] !== s.bubble.index) seen.push(s.bubble.index);
      }
    });
    expect(at).toMatchObject({ x: 1, z: 1.8 });
    expect(seen).toEqual(Array.from({ length: BUBBLES }, (_, i) => i));
    run(r, 60, (s) => s.phase === 'talk' && s.bubble && seen[seen.length - 1] !== s.bubble.index && seen.push(s.bubble.index));
    expect(seen.slice(BUBBLES, BUBBLES * 2)).toEqual([3, 4, 5]);
    expect(BUBBLE_SECONDS * BUBBLES).toBeGreaterThan(5);
  });

  it('credits.clawd: after the trip he is back in his seat and waits a good while before the next one', () => {
    const r = new ClawdRoutine(plan, 1, () => 0);
    run(r, 25);
    expect(r.phase).toBe('work');
    const s = run(r, 10);
    expect(s).toMatchObject({ phase: 'work', x: 3, y: 0.2, z: 3 });
  });
});
