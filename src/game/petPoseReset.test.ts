import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, STEP } from '../test/office';
import type { Person } from './Person';
import { applyPetPose, CROUCH_SECONDS, petPose, PET_HEIGHT, resetRig } from './petPose';

installHeadlessDom();

const OWNER = 'ramon-lenherr'; // owns a dog
const OTHER = 'oscar-grob';

/**
 * The owner strokes their dog (the `pet-dog` event) in an otherwise empty office. `frame(s)` runs `s` seconds of
 * simulation and poses the owner's rig after every step in the order `Game.pose` does: reset, then the pet pose.
 */
function stroke() {
  const sim = office();
  for (const p of sim.people) if (p.id !== OWNER && p.id !== OTHER) sim.scenario.put(p.id, 'errand');
  sim.scenario.put(OWNER, 'desk', 'stay');
  sim.scenario.put(OTHER, 'desk', 'stay');
  const owner = sim.person(OWNER);
  expect(sim.events.trigger('pet-dog')).toMatch(/streichelt/);
  const rig = owner.rig;
  let now = 0;
  const frame = (seconds: number) => {
    for (let t = 0; t < seconds; t += STEP) {
      sim.step(STEP);
      now += STEP;
      resetRig(rig);
      applyPetPose(owner, rig, now);
    }
  };
  return { sim, owner, rig, frame };
}

/** Every part `applyPetPose` writes is as `resetRig` leaves it. */
function expectNeutral(r: Person['rig']): void {
  for (const part of [r.body, r.armL, r.armR, r.legL, r.legR, r.kneeL, r.kneeR]) {
    expect(part.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
  }
  expect(r.body.position.toArray()).toEqual([0, 0, 0]);
  expect(r.legL.position.y).toBe(0.8);
  expect(r.legR.position.y).toBe(0.8);
}

describe('pet.pose-reset', () => {
  it('pet.pose-reset: the rig does not pile up: after a long stroke the bend is that of one frame, not of all of them', () => {
    const { owner, rig, frame } = stroke();
    frame(3);
    expect(owner.petAmt).toBe(1);
    expect(rig.body.rotation.x).toBeCloseTo(petPose(1, PET_HEIGHT.dog, 0).spine);
    expect(rig.legL.position.y).toBeLessThan(0.8); // really kneeling
    frame(2);
    expect(rig.body.rotation.x).toBeCloseTo(petPose(1, PET_HEIGHT.dog, 0).spine);
  });

  const endings: Array<[string, (s: ReturnType<typeof stroke>) => void, (s: ReturnType<typeof stroke>) => void]> = [
    ['the stroke runs out', () => {}, () => {}],
    ['the person is picked up and dragged', ({ owner }) => void (owner.held = true), () => {}],
    [
      'the person is pulled into a chat',
      ({ sim, owner }) => void sim.social.start([owner, sim.person(OTHER)], { x: owner.pos.x + 1, z: owner.pos.z }, sim.nav),
      ({ owner }) => expect(owner.petting).toBe(false), // the chat ends the stroke at once, while they still stand
    ],
  ];
  for (const [how, end, check] of endings) {
    it(`pet.pose-reset: the rig is back to neutral when ${how}`, () => {
      const s = stroke();
      s.frame(3);
      expect(s.owner.petAmt).toBe(1);
      end(s);
      s.frame(STEP * 2);
      check(s);
      s.frame(how === 'the stroke runs out' ? 40 : CROUCH_SECONDS + 0.5);
      expect(s.owner.petAmt).toBe(0);
      expectNeutral(s.rig);
    });
  }
});
