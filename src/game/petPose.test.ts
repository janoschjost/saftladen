import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { buildCharacter } from '../render/characterBuilder';
import { DOOR_LANES } from './Door';
import type { NavGrid } from './NavGrid';
import { Person } from './Person';
import { setSeed } from './rng';
import { CROUCH_SECONDS, KNEE_PAD, PET_HEIGHT, applyPetPose, legDepth, legPoints, petPose, resetRig, smooth } from './petPose';

/** Height above the floor (rig units) of a leg's knee pivot and sole in pose `p`. */
const heights = (p: ReturnType<typeof petPose>, leg: 'legL' | 'legR') => {
  const hip = 0.8 - p.drop;
  const { knee, foot } = legPoints(p[leg]);
  return { knee: hip + knee[1], foot: hip + foot[1], kneeZ: knee[2], footZ: foot[2] };
};

describe('pet.crouch', () => {
  it('pet.crouch kneels on one knee for a dog: knee on the floor, other foot planted', () => {
    const p = petPose(1, PET_HEIGHT.dog, 0);
    expect(p.both).toBe(false);
    expect(heights(p, 'legR').knee).toBeCloseTo(KNEE_PAD); // kneeling knee rests on the floor
    expect(heights(p, 'legR').foot).toBeGreaterThan(KNEE_PAD - 0.05); // shin lies flat behind, not into the floor
    expect(heights(p, 'legL').foot).toBeCloseTo(0, 1); // front sole on the floor
    expect(heights(p, 'legL').knee).toBeGreaterThan(0.3); // front knee up
    expect(p.legL.rx).toBeLessThan(-0.4);
  });

  it('pet.crouch-cat kneels on both knees, lower than for a dog', () => {
    const p = petPose(1, PET_HEIGHT.cat, 0);
    expect(p.both).toBe(true);
    for (const leg of ['legL', 'legR'] as const) expect(heights(p, leg).knee).toBeCloseTo(KNEE_PAD);
    expect(p.drop).toBeGreaterThan(petPose(1, PET_HEIGHT.dog, 0).drop);
    expect(p.legL.rx).toBeLessThan(-0.4);
  });

  it('pet.crouch does not kneel into the pet: nothing reaches far forward', () => {
    // the pet stands 0.65 m in front (Dog.petBy); knees and feet stay well behind it, the forward foot also off to the side
    for (const h of [PET_HEIGHT.dog, PET_HEIGHT.cat]) {
      const p = petPose(1, h, 0);
      for (const leg of ['legL', 'legR'] as const) {
        const { kneeZ, footZ } = heights(p, leg);
        expect(Math.max(kneeZ, footZ)).toBeLessThan(0.42);
      }
    }
    const front = legPoints(petPose(1, PET_HEIGHT.dog, 0).legL).foot;
    expect(front[0]).toBeLessThan(-0.1); // legL sits at -x: its foot goes further out
  });

  it('pet.crouch eases: neutral at zero, a foot or knee always on the floor', () => {
    const p = petPose(0, PET_HEIGHT.dog, 1);
    expect(p).toMatchObject({ drop: 0, spine: 0, armStroke: 0 });
    for (const v of [p.legL.rx, p.legL.ry, p.legL.knee, p.legR.rx, p.legR.ry, p.legR.knee]) expect(Math.abs(v)).toBe(0);
    for (const h of [PET_HEIGHT.dog, PET_HEIGHT.cat])
      for (let a = 0; a <= 1; a += 0.1) {
        const q = petPose(a, h, 0);
        expect(Math.max(legDepth(q.legL), legDepth(q.legR))).toBeCloseTo(0.8 - q.drop);
        expect(q.drop).toBeGreaterThanOrEqual(-1e-9);
      }
    expect(smooth(0)).toBe(0);
    expect(smooth(1)).toBe(1);
    expect(smooth(0.5)).toBe(0.5);
    expect(smooth(0.1)).toBeLessThan(0.1); // slow start
    expect(CROUCH_SECONDS).toBeCloseTo(0.4);
  });

  it('pet.crouch leans the spine only a little', () => {
    expect(petPose(1, PET_HEIGHT.dog, 0).spine).toBeLessThan(0.45);
    expect(petPose(1, PET_HEIGHT.cat, 0).spine).toBeLessThan(0.45);
  });
});

describe('pet.pose-reset', () => {
  const STEP = 1 / 60;
  const nav = { findPath: () => [] } as unknown as NavGrid;

  /** A person at the door, stroking a pet; `frame()` poses their rig the way `Game.pose` does: reset, then the pet pose. */
  function stroker() {
    setSeed(1);
    const m = team.find((t) => t.id === 'marco-rieser')!;
    const rig = buildCharacter(m.look);
    const p = new Person(m, rig, { ...DOOR_LANES[0].in });
    expect(p.petDog({ x: p.pos.x, z: p.pos.z + 0.65 }, 60, PET_HEIGHT.dog)).toBe(true);
    let now = 0;
    const frame = (seconds: number) => {
      for (let t = 0; t < seconds; t += STEP) {
        p.update(STEP, nav, []);
        now += STEP;
        resetRig(rig);
        applyPetPose(p, rig, now);
      }
    };
    return { p, rig, frame };
  }

  const neutral = (r: Person['rig']) => {
    for (const part of [r.body, r.armL, r.armR, r.legL, r.legR]) {
      expect(part.rotation.toArray().slice(0, 3)).toEqual([0, 0, 0]);
    }
    expect(r.body.position.toArray()).toEqual([0, 0, 0]);
  };

  it('pet.pose-reset: the rig does not pile up: after a long stroke the bend is that of one frame, not of all of them', () => {
    const { p, rig, frame } = stroker();
    frame(0.2);
    frame(5);
    expect(p.petAmt).toBe(1);
    expect(rig.body.rotation.x).toBeCloseTo(petPose(1, PET_HEIGHT.dog, 0).spine);
  });

  for (const [how, end] of [
    ['it ends', (p: Person) => void (p.petting = false)],
    ['the pet is picked up', (p: Person) => void (p.held = true)],
    ['the person is pulled into a chat', (p: Person) => void p.talkTo({ x: p.pos.x + 1, z: p.pos.z }, 3, false)],
    ['a conversation takes the person', (p: Person) => void (p.talk = { speaker: null, center: { x: p.pos.x + 1, z: p.pos.z } } as unknown as Person['talk'])],
  ] as const) {
    it(`pet.pose-reset: the rig is back to neutral when ${how}`, () => {
      const { p, rig, frame } = stroker();
      frame(1);
      expect(p.petAmt).toBe(1);
      expect(rig.body.rotation.x).toBeGreaterThan(0.1); // really bent
      end(p);
      frame(CROUCH_SECONDS + 0.2);
      expect(p.petAmt).toBe(0);
      neutral(rig);
    });
  }
});
