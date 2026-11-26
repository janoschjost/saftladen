import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { PET_HEIGHT } from './petPose';
import { setSeed } from './rng';
import { Sim } from './Sim';
import { cycleOf } from './TimeOfDay';
import { Walker } from './Walker';

installHeadlessDom();

const STEP = 1 / 60;

describe('pet.petting', () => {
  it('pet.petting the cat and the person stay put for the whole stroke, even when somebody bumps into them (#125)', () => {
    setSeed(1);
    const sim = new Sim({ cycle: cycleOf(11) });
    Walker.animate = true;
    sim.scenario.put('donata-manser', 'desk', 'stay');
    sim.scenario.put('oscar-grob', 'desk', 'stay');
    const owner = sim.people.find((p) => p.id === 'donata-manser')!;
    const other = sim.people.find((p) => p.id === 'oscar-grob')!;
    sim.drop(owner);
    sim.drop(other);
    const cat = sim.pets.find((d) => d.owner === owner && d.isCat)!;
    expect(cat.away || cat.fixed).toBe(false);

    expect(owner.petDog(cat.pos, 20, PET_HEIGHT.cat)).toBe(true);
    cat.petBy(owner, 20, sim.nav);
    for (let i = 0; i < 60 * 10 && cat.state === 'walk'; i++) sim.step(STEP); // the cat trots over
    expect(cat.petted && cat.state).toBe('idle');
    expect(Math.hypot(cat.pos.x - owner.pos.x, cat.pos.z - owner.pos.z)).toBeLessThan(1); // in front of the person, not walked off (#100)
    const catAt = { ...cat.pos };
    const ownerAt = { ...owner.pos };

    // a passer-by walks right into them, again and again
    const moved = { cat: 0, owner: 0 };
    let bumps = 0; // steps in which the passer-by really overlaps one of them
    for (let i = 0; i < 60 * 15; i++) {
      if (i % 30 === 0) {
        const target = (i / 30) % 2 ? cat : owner; // drops the passer-by right onto one of them
        sim.drop(other); // a passer-by, not somebody who sits down at a desk next to them meanwhile
        other.pos = { x: target.pos.x + 0.05, z: target.pos.z };
      }
      const near = Math.min(Math.hypot(other.pos.x - cat.pos.x, other.pos.z - cat.pos.z), Math.hypot(other.pos.x - owner.pos.x, other.pos.z - owner.pos.z));
      if (!other.fixed && !other.away && near < 0.3) bumps++;
      sim.step(STEP);
      moved.cat = Math.max(moved.cat, Math.hypot(cat.pos.x - catAt.x, cat.pos.z - catAt.z));
      moved.owner = Math.max(moved.owner, Math.hypot(owner.pos.x - ownerAt.x, owner.pos.z - ownerAt.z));
    }
    expect(bumps).toBeGreaterThan(20);
    expect(cat.petted?.by).toBe(owner);
    expect(owner.petting).toBe(true);
    expect(moved.cat).toBeLessThan(0.01);
    expect(moved.owner).toBeLessThan(0.01);
  });
});
