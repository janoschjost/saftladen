import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { WORLD } from '../render/World';
import { STARTLE_TIME, byOutsideWall, thunderClap } from './Thunder';

installHeadlessDom();

describe('weather.thunder: a clap of thunder makes people by a window or outdoors flinch', () => {
  it('weather.thunder: who stands by an outside wall flinches and says something, who stands in the middle does not', () => {
    const sim = office();
    const [window, middle] = GROUP.map((id) => sim.person(id));
    sim.scenario.put(window.id, { x: 1.5, z: 8 });
    sim.scenario.put(middle.id, { x: WORLD.width / 2, z: WORLD.depth / 2 });
    expect(byOutsideWall(1.5, 8)).toBe(true);
    expect(byOutsideWall(WORLD.width / 2, WORLD.depth / 2)).toBe(false);
    const hit = thunderClap(sim.people);
    expect(hit).toContain(window);
    expect(window.startle).toBe(STARTLE_TIME);
    expect(window.startleText).not.toBe('');
    expect(hit).not.toContain(middle);
    expect(middle.startle).toBe(0);
    run(sim, STARTLE_TIME + 0.1);
    expect(window.startle).toBe(0);
  });

  it('weather.thunder: the thunder of a storm reaches the office once per clap', () => {
    const sim = office();
    sim.scenario.put(GROUP[0], { x: 1.5, z: 8 });
    sim.weather.mode = 'storm';
    let flinches = 0;
    let was = 0;
    run(
      sim,
      90,
      () => false,
      () => {
        sim.weather.update(STEP);
        const now = sim.person(GROUP[0]).startle;
        if (now > was) flinches++;
        was = now;
      },
    );
    expect(flinches).toBeGreaterThanOrEqual(1);
  });
});
