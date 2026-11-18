import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, STEP, office, run } from '../test/office';

installHeadlessDom();

describe('drag.person', () => {
  it('drag.person: somebody lifted mid-walk stops walking at once and hangs still, and walks on after the drop', () => {
    const sim = office();
    const p = sim.person(GROUP[0]);
    sim.scenario.put(p.id, { x: 6, z: 6 }, 'free');
    p.walkTo(sim.nav, { x: 14, z: 8 });
    run(sim, 1);
    expect(p.state).toBe('walk');
    expect(p.moving).toBeGreaterThan(0.5);

    // the lift, as the game does it once the pointer moves past the click slop
    p.pickUp();
    const phase = p.phase;
    for (let i = 0; i < 60; i++) {
      // no step of the walk cycle left: not on the lift's frame, not on any later one
      expect({ moving: p.moving, path: p.path.length, state: p.state, phase: p.phase, prevPhase: p.prevPhase }).toEqual({ moving: 0, path: 0, state: 'idle', phase, prevPhase: phase });
      sim.step(STEP);
    }

    // dropped: the simulation takes over again and they walk off
    p.held = false;
    expect(run(sim, 30, () => p.state === 'walk' && p.moving > 0.5)).toBe(true);
  });
});
