import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { installHeadlessDom } from '../test/headlessDom';
import { buildCharacter } from './characterBuilder';
import { inHead } from './homeOffice';
import { MOUTH, cigaretteAt, smokeArmPose, smokePoses, umbrellaOf } from './smokeProps';

installHeadlessDom();

const smokers = team.filter((m) => m.smoke);
const heightOf = (look: (typeof team)[number]['look']) => look.heightM ?? (look.height ?? 1) * 1.75;

describe('place.smoke: the cigarette meets the mouth', () => {
  it('place.smoke: for every smoker, shortest to tallest, the drag puts the filter on the lips, with the hand in front of the face, not inside the head', () => {
    const heights = smokers.map((m) => heightOf(m.look));
    // the check covers both ends of the team's heights
    expect(Math.min(...heights)).toBeLessThan(1.6);
    expect(Math.max(...heights)).toBeGreaterThanOrEqual(2);
    for (const m of smokers) {
      const rig = buildCharacter(m.look);
      const poses = smokePoses(rig);
      const at = cigaretteAt(rig, poses.drag);
      // the body is scaled as a whole: in its own frame the mouth is the same for everybody, so this holds for every height
      expect(at.tool.distanceTo(MOUTH), m.id).toBeLessThan(0.02);
      expect(at.hand.distanceTo(MOUTH), m.id).toBeLessThan(0.1); // close to the face, not floating in front of it
      for (const part of [at.hand, at.mid, at.elbow]) expect(inHead(part), m.id).toBe(0);
      // between drags: a little lower, still in front of the body (and the cigarette in sight)
      const low = cigaretteAt(rig, poses.low);
      expect(low.tool.y, m.id).toBeLessThan(MOUTH.y - 0.15);
      expect(low.tool.z, m.id).toBeGreaterThan(0.2);
      for (const part of [low.hand, low.mid, low.elbow]) expect(inHead(part), m.id).toBe(0);
      // and on the way up and down (the view blends the two poses)
      for (let k = 0; k <= 1.0001; k += 0.025) {
        const mid = cigaretteAt(rig, smokeArmPose(poses, k));
        for (const part of [mid.hand, mid.mid, mid.elbow, mid.tool]) expect(inHead(part), `${m.id} at ${k.toFixed(3)}`).toBe(0);
      }
      expect(cigaretteAt(rig, smokeArmPose(poses, 1)).tool.distanceTo(MOUTH)).toBeLessThan(0.02);
      // the cigarette points away from the face
      const dir = new THREE.Vector3().copy(poses.dir);
      expect(dir.length()).toBeCloseTo(1, 5);
    }
  });
});

describe('weather.umbrella: whose umbrella', () => {
  it('weather.umbrella: everybody keeps their own umbrella; only Delya has the dog head', () => {
    for (const m of team) {
      const u = umbrellaOf(m.id);
      expect(umbrellaOf(m.id)).toEqual(u); // the same every day
      expect(u.shape === 'dog').toBe(m.id === 'delya-kohler');
    }
    const shapes = new Set(team.map((m) => umbrellaOf(m.id).shape));
    expect([...shapes].sort()).toEqual(['bubble', 'dog', 'dome', 'pagoda']);
    expect(team.some((m) => umbrellaOf(m.id).colour === 'pattern')).toBe(true);
  });
});
