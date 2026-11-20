import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { christianLook } from '../data/christian';
import { team } from '../data/team';
import { buildCharacter } from '../render/characterBuilder';
import { installHeadlessDom } from '../test/headlessDom';
import { ChristianModel, longestRun } from './ChristianModel';
import { Sim } from './Sim';

installHeadlessDom();

describe('christian.model', () => {
  it('christian.model: 2.1 m tall with a police cap, and not part of the team lists', () => {
    expect(christianLook.heightM).toBe(2.1);
    expect(christianLook.policeCap).toBe(true);
    expect(team.some((m) => /christian|davatz/i.test(m.id) || /davatz/i.test(m.name))).toBe(false);
    const rig = buildCharacter(christianLook);
    expect(rig.root.scale.y).toBeCloseTo(2.1 / 1.75, 5);
    // the cap is part of the body mesh: it stays on in every pose
    expect(rig.skin.length).toBeGreaterThan(0);
  });

  it('christian.model: stands in the scene on start, walks on the spot, then along a free line; stop removes him', () => {
    const sim = new Sim();
    const scene = new THREE.Scene();
    const model = new ChristianModel(scene, sim.nav);
    const run = longestRun(sim.nav);
    expect(run.x1 - run.x0).toBeGreaterThan(3);
    for (let x = run.x0; x <= run.x1; x += 0.5) expect(sim.nav.walkable(...(Object.values(sim.nav.toCell({ x, z: run.z })) as [number, number]))).toBe(true);
    model.start();
    expect(model.active).toBe(true);
    expect(scene.children).toContain(model.root);
    const x0 = model.root!.position.x;
    model.update(2);
    expect(model.root!.position.x).toBe(x0); // on the spot
    model.update(4);
    expect(model.root!.position.x).toBeGreaterThan(x0); // then along the line
    model.stop();
    expect(model.active).toBe(false);
    expect(scene.children).not.toContain(model.root);
    expect(sim.people.length).toBe(team.length); // not one of the people
  });

  it('christian.model: his legs swing at the pace of the other people (4.2 rad per metre walked), not faster', () => {
    const model = new ChristianModel(new THREE.Scene(), new Sim().nav);
    model.start();
    // after 1 s the phase is SPEED * 4.2 rad; the swing is ±0.42 rad like in Game.ts
    model.update(1);
    const rig = model.rig!;
    const ph = 1.3 * 4.2;
    expect(rig.legL.rotation.x).toBeCloseTo(Math.sin(ph) * 0.42, 5);
    expect(rig.legR.rotation.x).toBeCloseTo(-Math.sin(ph) * 0.42, 5);
  });
});
