import { describe, expect, it } from 'vitest';
import { CROUCH_SECONDS, PET_HEIGHT, crouchDrop, petPose, smooth } from './petPose';

describe('pet.crouch', () => {
  it('pet.crouch scales with the animal: cat deeper than dog', () => {
    expect(crouchDrop(PET_HEIGHT.cat)).toBeGreaterThan(crouchDrop(PET_HEIGHT.dog));
    expect(crouchDrop(PET_HEIGHT.dog)).toBeGreaterThan(0.1);
  });

  it('pet.crouch uses legs and hips, not only the spine', () => {
    const p = petPose(1, PET_HEIGHT.cat, 0);
    expect(p.drop).toBeGreaterThan(0.3);
    expect(p.thigh).toBeGreaterThan(0.5);
    expect(p.knee).toBeCloseTo(2 * p.thigh);
    expect(p.spine).toBeLessThan(0.4); // less than the old torso-only 0.45 bow
  });

  it('pet.crouch is neutral at zero and eases smoothly', () => {
    const p = petPose(0, PET_HEIGHT.dog, 1);
    expect(p).toMatchObject({ drop: 0, thigh: 0, knee: 0, spine: 0, armStroke: 0 });
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(0.1)).toBeLessThan(0.1); // slow start
    expect(CROUCH_SECONDS).toBeCloseTo(0.4);
  });

  it('pet.crouch keeps feet under the hips (hip height matches leg bend)', () => {
    const p = petPose(1, PET_HEIGHT.cat, 0);
    expect(0.8 * Math.cos(p.thigh)).toBeCloseTo(0.8 - p.drop);
  });
});
