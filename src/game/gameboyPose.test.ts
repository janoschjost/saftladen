import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SIT_DROP } from '../render/officeBuilder';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { poseGameboy } from './gameboyPose';
import type { Person } from './Person';
import { HIP_HEIGHT, poseFrame } from './petPose';

installHeadlessDom();

/**
 * Poses `p`'s rig the way `Game.pose` does each frame for what matters here: the sitting legs and lowered body
 * (a stand-in for the walk/sit block of `Game.pose`), then the console on top, then the hip hinge (`poseFrame`).
 */
function pose(p: Person, now: number): void {
  const r = p.rig;
  poseFrame(p, r, now, () => {
    const sit = p.sit;
    r.legL.rotation.x = r.legR.rotation.x = -1.5 * sit;
    r.kneeL.rotation.x = r.kneeR.rotation.x = 1.5 * sit;
    r.legL.position.y = r.legR.position.y = HIP_HEIGHT - SIT_DROP * sit;
    r.body.position.y = -SIT_DROP * sit;
    r.armL.rotation.x += -1.2 * sit;
    r.armR.rotation.x += -1.2 * sit;
  }, () => poseGameboy(r, p.gameboy, p.gameboyOnWc ? p.sit : 0, now));
  r.root.position.set(0, 0, 0); // measured in the person's own frame: same for every cabin
  r.root.rotation.set(0, 0, 0);
  r.root.updateMatrixWorld(true);
}

/** What the test looks at on a posed rig, in the person's own frame (rig units × height). */
function measure(p: Person) {
  const r = p.rig;
  const fist = (elbow: THREE.Object3D) => elbow.localToWorld(new THREE.Vector3(0, -0.26, 0)); // forearm ends 0.3 below the elbow
  // the thighs as boxes in the legs' own frame, so a bent leg is not one big axis-aligned box
  const inThigh = (leg: THREE.Object3D, point: THREE.Vector3) => {
    const q = leg.worldToLocal(point.clone());
    return Math.abs(q.x) < 0.1 && q.y < 0.02 && q.y > -0.46 && Math.abs(q.z) < 0.11;
  };
  const corners: THREE.Vector3[] = [];
  for (const x of [-0.11, 0.11]) for (const y of [-0.17, 0.17]) for (const z of [-0.035, 0.035]) corners.push(r.gameboy.localToWorld(new THREE.Vector3(x, y, z)));
  return {
    box: new THREE.Box3().setFromPoints(corners),
    centre: r.gameboy.localToWorld(new THREE.Vector3()),
    fists: [fist(r.elbowL), fist(r.elbowR)],
    kneeTop: Math.max(...[r.kneeL, r.kneeR].map((k) => k.localToWorld(new THREE.Vector3()).y)) + 0.11 * r.root.scale.y,
    shoulder: r.armL.localToWorld(new THREE.Vector3()).y,
    inLegs: corners.some((c) => inThigh(r.legL, c) || inThigh(r.legR, c)),
  };
}

/** Two people go to the WC (one per cabin); each frame of their visit is posed and handed to `each`. */
function visit(each: (p: Person, m: ReturnType<typeof measure>) => void): Person[] {
  const sim = office();
  sim.scenario.clear('wc');
  const two = GROUP.slice(0, 2).map((id) => {
    sim.scenario.put(id, 'desk', 'free');
    return sim.person(id);
  });
  for (const p of two) sim.drop(p);
  expect(two.map((p) => sim.toilets.go(p, sim.nav))).toEqual(['cabin', 'cabin']);
  let now = 0;
  const seated = new Set<Person>();
  const left = () => seated.size === 2 && two.every((p) => !p.inMeeting && p.gameboy === 0);
  expect(
    run(sim, 200, left, () => {
      now += STEP;
      for (const p of two) {
        if (p.gameboy >= 1 - 1e-3) seated.add(p);
        pose(p, now);
        if (p.rig.gameboy.visible) each(p, measure(p));
      }
    }),
  ).toBe(true);
  return two;
}

describe('gameboyPose', () => {
  it('place.toilet: seated on the WC the console is in both hands in front of the chest, above the knees, screen up to the face (both cabins)', () => {
    const held: Person[] = [];
    visit((p, m) => {
      if (p.gameboy < 1 - 1e-3 || p.sit < 1) return;
      if (!held.includes(p)) held.push(p);
      const h = p.rig.root.scale.y;
      expect(m.box.min.y).toBeGreaterThan(m.kneeTop + 0.08 * h); // clear above the knees, not in the lap
      expect(m.centre.y).toBeLessThan(m.shoulder); // chest / belly height
      expect(m.centre.z).toBeGreaterThan(0.3 * h); // in front of the body
      for (const f of m.fists) expect(m.box.clone().expandByScalar(0.08 * h).containsPoint(f)).toBe(true);
      expect(m.fists[0].x * m.fists[1].x).toBeLessThan(0); // one hand either side
      // the screen (−z on the console) faces up and back, towards the face
      const screen = new THREE.Vector3(0, 0, -1).transformDirection(p.rig.gameboy.matrixWorld);
      expect(screen.y).toBeGreaterThan(0.3);
      expect(screen.z).toBeLessThan(0);
    });
    expect(held.length).toBe(2);
  });

  it('place.toilet: sitting down and standing up, the console never passes through the legs or the floor', () => {
    const seen = new Set<Person>();
    visit((p, m) => {
      seen.add(p);
      expect(m.inLegs).toBe(false);
      expect(m.box.min.y).toBeGreaterThan(0.1);
    });
    expect(seen.size).toBe(2);
  });

  it('day.gameboy: off the WC the pose is the old one (console low in front, arms at -1.05, elbows at -1.35)', () => {
    const sim = office();
    const p = sim.person(GROUP[0]);
    const r = p.rig;
    poseFrame(p, r, 0, () => {}, () => poseGameboy(r, 1, 0, 0));
    expect(r.gameboy.visible).toBe(true);
    expect(r.gameboy.position.toArray()).toEqual([0, 1.0, 0.3]);
    expect(r.armL.rotation.x).toBeCloseTo(-1.05);
    expect(r.armL.rotation.z).toBeCloseTo(0.3);
    expect(r.armR.rotation.z).toBeCloseTo(-0.3);
    expect(r.elbowL.rotation.x).toBeCloseTo(-1.35, 1);
  });
});
