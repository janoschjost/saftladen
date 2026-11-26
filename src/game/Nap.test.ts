import { describe, expect, it } from 'vitest';
import { team as TEAM } from '../data/team';
import { installHeadlessDom } from '../test/headlessDom';
import { STEP, office, only, run } from '../test/office';

installHeadlessDom();

const NAPPER = 'jeerapat-wang';

describe('char.nap: Jeerapat walks slowest and now and then dozes off on the spot', () => {
  it('char.slow: she walks slower than everybody else', () => {
    const sim = office();
    const slowest = Math.min(...sim.people.filter((p) => p.id !== NAPPER).map((p) => p.speed));
    expect(sim.person(NAPPER).speed).toBeLessThan(slowest);
    expect(TEAM.find((m) => m.id === NAPPER)?.speed).toBe(sim.person(NAPPER).speed);
  });

  it('char.nap: while walking she stops for a few seconds without moving, then walks on; nobody else naps', () => {
    const sim = office();
    only(sim, [NAPPER, 'oscar-grob']);
    const jee = sim.person(NAPPER);
    let naps = 0;
    let was = 0;
    let at = { ...jee.pos };
    let moved = 0;
    let longest = 0;
    let len = 0;
    run(
      sim,
      1800,
      () => false,
      () => {
        expect(sim.person('oscar-grob').nap).toBe(0);
        if (jee.nap > 0) {
          if (was === 0) {
            naps++;
            at = { ...jee.pos };
            len = 0;
          }
          len += STEP;
          longest = Math.max(longest, len);
          moved = Math.max(moved, Math.hypot(jee.pos.x - at.x, jee.pos.z - at.z));
        }
        was = jee.nap;
      },
    );
    expect(naps).toBeGreaterThanOrEqual(2);
    expect(moved).toBeLessThan(0.05);
    expect(longest).toBeGreaterThan(2.5);
    expect(longest).toBeLessThan(7);
  });
});
