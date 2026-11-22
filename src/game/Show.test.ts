import { describe, expect, it } from 'vitest';
import { samplePath, type PathKey } from '../render/cameraFly';
import { expand, holdFor, ShowRunner, type Cue, type Film, type ShowHost } from './Show';

/** a host that only writes down what it is asked to do */
function recorder(eventsOk: (id: string, n: number) => boolean = () => true) {
  const log: string[] = [];
  const tries = new Map<string, number>();
  const host: ShowHost = {
    stage: (s) => log.push(`stage ${(s.groups ?? []).length}/${(s.outside ?? []).length}`),
    event: (id, cast, free) => {
      const n = (tries.get(id) ?? 0) + 1;
      tries.set(id, n);
      log.push(`event ${id}#${n}${cast ? ` [${cast.join()}]` : ''}${free ? ' free' : ''}`);
      return eventsOk(id, n);
    },
    arrive: (id) => log.push(`arrive ${id}`),
    sky: (from, to, over, elapsed) => log.push(`sky ${from}-${to} ${over} ${elapsed}`),
    feed: (id) => log.push(`feed ${id}`),
    say: (text) => log.push(`say ${text}`),
    title: (head) => log.push(`title ${head}`),
    fade: (black) => log.push(`fade ${black ? 'out' : 'in'}`),
    camera: (t) => log.push(`camera ${t.toFixed(1)}`),
    end: () => log.push('end'),
  };
  return { host, log };
}

const film = (length: number, cues: Cue[]): Film => ({ length, camera: [], cues });
const play = (runner: ShowRunner, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) runner.update(dt);
};
const quiet = (log: string[]) => log.filter((l) => !l.startsWith('camera') && l !== 'say null' && l !== 'title null' && l !== 'feed null');

describe('show.play', () => {
  it('show.play: fires each cue when its second comes, in order of its second', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(film(10, [{ t: 3, say: 'drei' }, { t: 1, event: 'e', cast: ['a'] }, { t: 1, say: 'eins' }]), host);
    runner.start();
    expect(quiet(log)).toEqual([]);
    play(runner, 1.5);
    expect(quiet(log)).toEqual(['event e#1 [a]', 'say eins']);
    play(runner, 2);
    expect(quiet(log).at(-1)).toBe('say drei');
  });

  it('show.play: the camera is asked for its place on every step', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(film(5, []), host);
    runner.start();
    play(runner, 1);
    expect(log.filter((l) => l.startsWith('camera')).length).toBeGreaterThanOrEqual(10);
  });

  it('show.play: a subtitle goes away after its hold, longer text stays longer', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(film(20, [{ t: 0, say: 'kurz', hold: 2 }]), host);
    runner.start();
    play(runner, 1.5);
    expect(log.at(-1)).not.toBe('say null');
    play(runner, 1);
    expect(log.filter((l) => l === 'say null')).toHaveLength(2); // once at the start, once when the line is over
    expect(holdFor('x'.repeat(80))).toBeGreaterThan(holdFor('x'.repeat(10)));
    expect(holdFor('x'.repeat(2000))).toBeLessThanOrEqual(7);
  });

  it('show.play: an event that cannot run yet is tried again, for a few seconds only', () => {
    const { host, log } = recorder((_, n) => n >= 3);
    const runner = new ShowRunner(film(20, [{ t: 0, event: 'late' }]), host);
    runner.start();
    play(runner, 5);
    expect(log.filter((l) => l.startsWith('event late'))).toHaveLength(3);
    const never = recorder(() => false);
    const r2 = new ShowRunner(film(30, [{ t: 0, event: 'never', free: true }]), never.host);
    r2.start();
    play(r2, 25);
    const tried = never.log.filter((l) => l.startsWith('event never')).length;
    expect(tried).toBeGreaterThan(5);
    expect(tried).toBeLessThan(20);
    expect(never.log.find((l) => l.startsWith('event never'))).toContain('free');
  });

  it('show.play: an arrive cue sends its people one after the other', () => {
    expect(expand([{ t: 2, arrive: ['a', 'b', 'c'], gap: 1.5 }]).map((c) => c.t)).toEqual([2, 3.5, 5]);
    const { host, log } = recorder();
    const runner = new ShowRunner(film(10, [{ t: 2, arrive: ['a', 'b'], gap: 2 }]), host);
    runner.start();
    play(runner, 3);
    expect(log.filter((l) => l.startsWith('arrive'))).toEqual(['arrive a']);
    play(runner, 2);
    expect(log.filter((l) => l.startsWith('arrive'))).toEqual(['arrive a', 'arrive b']);
  });

  it('show.play: the film ends once, at its length', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(film(4, []), host);
    runner.start();
    play(runner, 5);
    expect(log.at(-1)).toBe('end');
    expect(runner.finished).toBe(true);
    runner.update(1);
    expect(log.filter((l) => l === 'end')).toHaveLength(1);
  });
});

describe('show.keys', () => {
  const chapters = film(30, [
    { t: 0, mark: 'a' },
    { t: 0, stage: { groups: [{ who: ['x'] }] } },
    { t: 10, mark: 'b' },
    { t: 10, sky: [8, 9], over: 20 },
    { t: 11, arrive: ['q'] },
    { t: 12, feed: 'm' },
    { t: 20, mark: 'c' },
    { t: 21, say: 'später' },
  ]);

  it('show.keys: a chapter starts the film there, with the cast, the sun and the dock as the cues before it left them', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(chapters, host);
    runner.start('c');
    expect(runner.t).toBe(20);
    expect(log.filter((l) => !l.startsWith('camera'))).toEqual(['say null', 'title null', 'stage 1/0', 'arrive q', 'sky 8-9 20 10', 'feed m']);
    const b = new ShowRunner(chapters, recorder().host);
    b.start('1');
    expect(b.t).toBe(10);
    b.start('nope');
    expect(b.t).toBe(0);
  });

  it('show.keys: skipping jumps a chapter back or on, the first stays in range, past the last the film ends', () => {
    const { host, log } = recorder();
    const runner = new ShowRunner(chapters, host);
    runner.start('b');
    runner.skip(-1);
    expect(runner.t).toBe(0);
    runner.skip(-1);
    expect(runner.t).toBe(0);
    runner.skip(2);
    expect(runner.t).toBe(20);
    runner.skip(1);
    expect(log.at(-1)).toBe('end');
    expect(runner.finished).toBe(true);
  });
});

describe('show.camera', () => {
  const key = (t: number, x: number, azimuth = 0, dist = 10): PathKey => ({ t, x, y: 0.8, z: 0, azimuth, polar: 0.7, dist });

  it('show.camera: the path passes every key exactly and stands still before the first and after the last', () => {
    const keys = [key(0, 0), key(4, 10), key(9, 30), key(12, 31)];
    for (const k of keys) expect(samplePath(keys, k.t).x).toBeCloseTo(k.x, 6);
    expect(samplePath(keys, -5).x).toBe(0);
    expect(samplePath(keys, 99).x).toBe(31);
  });

  it('show.camera: it moves smoothly: no jump between two steps, and the speed does not break at a key', () => {
    const keys = [key(0, 0), key(4, 10), key(9, 30), key(12, 31)];
    let prev = samplePath(keys, 0).x;
    let prevStep = 0;
    for (let t = 0.05; t <= 12; t += 0.05) {
      const x = samplePath(keys, t).x;
      const step = x - prev;
      expect(Math.abs(step)).toBeLessThan(0.6);
      if (t > 0.2) expect(Math.abs(step - prevStep)).toBeLessThan(0.1);
      prev = x;
      prevStep = step;
    }
  });

  it('show.camera: the azimuth takes the short way round and the distance blends between keys', () => {
    const keys = [key(0, 0, 3.0, 4), key(4, 0, -3.0, 16)];
    const mid = samplePath(keys, 2);
    // 3.0 -> -3.0 round the back is a quarter turn of 0.28, not 6 radians the other way
    expect(Math.abs(Math.sin(mid.azimuth))).toBeLessThan(0.3);
    expect(mid.dist).toBeGreaterThan(4);
    expect(mid.dist).toBeLessThan(16);
  });
});
