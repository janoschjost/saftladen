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
    setSeed(3);
    const sim = new Sim({ cycle: cycleOf(11) });
    Walker.animate = true;
    const cat = sim.pets.find((d) => d.isCat)!;
    const owner = cat.owner;
    sim.presence.callBack(owner);
    for (let i = 0; i < 60 * 60 && !(owner.presence === 'in' && !cat.away && !cat.fixed); i++) sim.step(STEP);
    expect(owner.presence).toBe('in');
    expect(cat.away || cat.fixed).toBe(false);

    expect(owner.petDog(cat.pos, 20, PET_HEIGHT.cat)).toBe(true);
    cat.petBy(owner, 20, sim.nav);
    for (let i = 0; i < 60 * 3; i++) sim.step(STEP); // the cat trots over
    expect(cat.petted && cat.state).toBe('idle');
    const catAt = { ...cat.pos };
    const ownerAt = { ...owner.pos };

    // a passer-by walks right into them, again and again
    const other = sim.people.find((p) => p !== owner && p.inOffice && !p.fixed)!;
    const moved = { cat: 0, owner: 0 };
    let bumps = 0; // steps in which the passer-by really overlaps one of them
    for (let i = 0; i < 60 * 15; i++) {
      if (i % 30 === 0) {
        const target = (i / 30) % 2 ? cat : owner; // drops the passer-by right onto one of them
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
