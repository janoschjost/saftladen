import { describe, expect, it } from 'vitest';
import { expand, holdFor, SHOW_FADE, ShowRunner, showLength, type Cue, type Scene, type ShowHost } from './Show';

/** a host that only writes down what it is asked to do */
function recorder(eventsOk: (id: string, n: number) => boolean = () => true) {
  const log: string[] = [];
  const tries = new Map<string, number>();
  const host: ShowHost = {
    beginScene: (s, continuous) => log.push(`begin ${s.id}${continuous ? ' (on)' : ''}`),
    shot: (spec, over) => log.push(`shot ${spec.action ?? 'x'} ${over}`),
    event: (id) => {
      const n = (tries.get(id) ?? 0) + 1;
      tries.set(id, n);
      log.push(`event ${id}#${n}`);
      return eventsOk(id, n);
    },
    arrive: (id) => log.push(`arrive ${id}`),
    sky: (hour, over) => log.push(`sky ${hour} ${over}`),
    feed: (id) => log.push(`feed ${id}`),
    say: (text) => log.push(`say ${text}`),
    title: (head) => log.push(`title ${head}`),
    fade: (black) => log.push(`fade ${black ? 'out' : 'in'}`),
    end: () => log.push('end'),
  };
  return { host, log };
}

const scene = (id: string, length: number, cues: Cue[], more: Partial<Scene> = {}): Scene => ({ id, length, hour: 10, cues, ...more });
const play = (runner: ShowRunner, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) runner.update(dt);
};

describe('show.play', () => {
  it('show.play: fires each cue when its second comes, in order', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 10, [{ t: 3, say: 'drei' }, { t: 1, event: 'e' }, { t: 1, shot: { action: 'printer' }, over: 2 }])], host);
    runner.start();
    expect(log).toEqual(['begin a']);
    play(runner, 1.5);
    expect(log).toEqual(['begin a', 'event e#1', 'shot printer 2']);
    play(runner, 2);
    expect(log.at(-1)).toBe('say drei');
  });

  it('show.play: a subtitle goes away after its hold, longer text stays longer', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 20, [{ t: 0, say: 'kurz', hold: 2 }])], host);
    runner.start();
    play(runner, 1.5);
    expect(log).not.toContain('say null');
    play(runner, 1);
    expect(log.at(-1)).toBe('say null');
    expect(holdFor('x'.repeat(80))).toBeGreaterThan(holdFor('x'.repeat(10)));
    expect(holdFor('x'.repeat(2000))).toBeLessThanOrEqual(7);
  });

  it('show.play: an event that cannot run yet is tried again, for a few seconds only', () => {
    const { host, log } = recorder((_, n) => n >= 3);
    const runner = new ShowRunner([scene('a', 20, [{ t: 0, event: 'late' }])], host);
    runner.start();
    play(runner, 5);
    expect(log.filter((l) => l.startsWith('event late'))).toHaveLength(3);
    const never = recorder(() => false);
    const r2 = new ShowRunner([scene('a', 30, [{ t: 0, event: 'never' }])], never.host);
    r2.start();
    play(r2, 25);
    const tried = never.log.filter((l) => l.startsWith('event never')).length;
    expect(tried).toBeGreaterThan(5);
    expect(tried).toBeLessThan(20);
  });

  it('show.play: an arrive cue sends its people one after the other', () => {
    const cues = expand([{ t: 2, arrive: ['a', 'b', 'c'], gap: 1.5 }]);
    expect(cues.map((c) => c.t)).toEqual([2, 3.5, 5]);
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 10, [{ t: 2, arrive: ['a', 'b'], gap: 2 }])], host);
    runner.start();
    play(runner, 3);
    expect(log.filter((l) => l.startsWith('arrive'))).toEqual(['arrive a']);
    play(runner, 2);
    expect(log.filter((l) => l.startsWith('arrive'))).toEqual(['arrive a', 'arrive b']);
  });

  it('show.play: scenes follow each other with a dip to black, the last one ends the show', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 4, []), scene('b', 4, [])], host);
    runner.start();
    play(runner, 4 - SHOW_FADE - 0.2);
    expect(log).toEqual(['begin a']);
    play(runner, 0.4);
    expect(log).toEqual(['begin a', 'fade out']);
    play(runner, 0.5);
    expect(log.slice(-1)).toEqual(['begin b']);
    expect(runner.index).toBe(1);
    play(runner, 5);
    expect(log.at(-1)).toBe('end');
    expect(runner.finished).toBe(true);
    runner.update(1);
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
  });

  it('show.play: a scene with cut: false runs on without a dip', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 3, []), scene('b', 3, [], { cut: false })], host);
    runner.start();
    play(runner, 3.2);
    expect(log).toEqual(['begin a', 'begin b (on)']);
  });

  it('show.keys: skipping jumps a scene back or on, the first and the last stay in range', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner([scene('a', 9, []), scene('b', 9, []), scene('c', 9, [])], host);
    runner.start(1);
    expect(runner.index).toBe(1);
    runner.skip(-1);
    runner.skip(-1);
    expect(runner.index).toBe(0);
    runner.skip(2);
    expect(runner.index).toBe(2);
    runner.skip(1);
    expect(log.at(-1)).toBe('end');
    expect(showLength(runner.scenes)).toBe(27);
    // a jump never counts as running on
    expect(log).not.toContain('begin c (on)');
  });
});
