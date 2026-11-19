import { describe, expect, it } from 'vitest';
import { HALLWAY_WALK } from '../render/officeModel';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, STEP, office, run } from '../test/office';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** Phone calls on foot (#139): how long, which path, the hallway, giving way, gestures and bubbles. */

const PHONE = 'jan-hasler';
const [WEST, EAST] = HALLWAY_WALK;
const HALL_Z = WEST.z;

/** The office holds only these people, standing in the hallway (`at`, by index); everybody else is out. */
function only(sim: Sim, ids: readonly string[], at: ReadonlyArray<{ x: number; z: number }>): Person[] {
  for (const p of sim.people) if (!ids.includes(p.id)) sim.scenario.put(p.id, 'errand');
  return ids.map((id, i) => {
    sim.scenario.put(id, at[i], 'stay');
    return sim.person(id);
  });
}

const near = (p: Person, q: { x: number; z: number }, r = 0.6) => Math.hypot(p.pos.x - q.x, p.pos.z - q.z) < r;

describe('place.phone-walk', () => {
  it('place.phone-walk: every call on foot lasts 90–180 s, half of the natural calls pace, about 70% of those walk the hallway', () => {
    const sim = office();
    const [jan] = only(sim, [PHONE], [{ x: 20, z: HALL_Z }]);
    const n = 600;
    let pace = 0;
    let hall = 0;
    for (let i = 0; i < n; i++) {
      jan.endPhone();
      jan.startPhone(sim.nav);
      const j = jan.phoneJob!;
      expect(j.remaining).toBeGreaterThanOrEqual(90);
      expect(j.remaining).toBeLessThanOrEqual(180);
      expect(j.mode).not.toBe('sit');
      if (j.mode === 'pace') {
        pace++;
        if (j.hall) hall++;
      } else expect(j.hall).toBe(false);
    }
    expect(pace / n).toBeGreaterThan(0.42);
    expect(pace / n).toBeLessThan(0.58);
    expect(hall / pace).toBeGreaterThan(0.62);
    expect(hall / pace).toBeLessThan(0.78);
  });

  it('place.phone-walk (phone-jan-hasler): the event paces the hallway end to end, talking with his free hand and in bubbles, for 90–180 s', () => {
    const sim = office();
    const [jan] = only(sim, [PHONE], [{ x: 20, z: HALL_Z }]);
    sim.events.trigger(`phone-${PHONE}`);
    const j = jan.phoneJob!;
    expect(j.mode).toBe('pace');
    expect(j.hall).toBe(true);
    expect([j.a, j.b].map((v) => v.x).sort((x, y) => x - y)).toEqual([WEST.x, EAST.x]);
    const ends = new Set<string>();
    const gestures = new Set<string>();
    const bubbles = new Set<string>();
    let t = 0;
    let offLine = 0;
    expect(
      run(sim, 200, () => !jan.phoneJob, () => {
        t += STEP;
        if (near(jan, WEST)) ends.add('west');
        if (near(jan, EAST)) ends.add('east');
        if (jan.pos.x > WEST.x && jan.pos.x < EAST.x) offLine = Math.max(offLine, Math.abs(jan.pos.z - HALL_Z));
        if (jan.callGesture) gestures.add(jan.callGesture.kind);
        if (jan.callText) bubbles.add(jan.callText);
      }),
    ).toBe(true);
    expect(t).toBeGreaterThanOrEqual(90 - 0.1);
    expect(t).toBeLessThanOrEqual(180 + 0.1);
    expect(ends).toEqual(new Set(['west', 'east']));
    expect(offLine).toBeLessThan(0.5); // in the hallway the whole time, not off into a room
    expect(gestures.size).toBeGreaterThanOrEqual(2);
    expect(bubbles.size).toBeGreaterThanOrEqual(2);
    // the call is over: hand down, no bubble
    expect(jan.callGesture).toBeNull();
    expect(jan.callText).toBeNull();
    run(sim, 1);
    expect(jan.callGestureAmt).toBe(0);
  });

  it('place.phone-walk: picked up mid-call, the call ends and so do the gestures and bubbles', () => {
    const sim = office();
    const [jan] = only(sim, [PHONE], [{ x: 20, z: HALL_Z }]);
    sim.events.trigger(`phone-${PHONE}`);
    expect(run(sim, 30, () => jan.callGesture && jan.callText)).toBe(true);
    jan.pickUp();
    run(sim, 1);
    expect(jan.phoneJob).toBeNull();
    expect(jan.callGesture).toBeNull();
    expect(jan.callText).toBeNull();
    expect(jan.callGestureAmt).toBe(0);
  });

  it('place.phone-walk: with the hallway blocked (an end, or across the middle) the call paces a random path', () => {
    for (const at of [EAST, { x: (WEST.x + EAST.x) / 2, z: HALL_Z }]) {
      const sim = office();
      const [jan] = only(sim, [PHONE], [{ x: 20, z: HALL_Z }]);
      const { cx, cz } = sim.nav.toCell(at);
      sim.scenario.block(cx, cz);
      sim.events.trigger(`phone-${PHONE}`);
      expect(jan.phoneJob?.mode).toBe('pace');
      expect(jan.phoneJob?.hall).toBe(false);
    }
  });

  it('place.phone-walk: a walker coming at pacing Jan in the hallway steps aside, Jan keeps his line and nobody touches', () => {
    /** Jan paces off east along the hallway, with somebody coming the other way (or nobody); his track step by step */
    const encounter = (oncoming: boolean) => {
      const sim = office();
      const ids = oncoming ? [PHONE, GROUP[0]] : [PHONE];
      const [jan, other] = only(sim, ids, [{ x: WEST.x + 1, z: HALL_Z }, { x: EAST.x - 4, z: HALL_Z }]);
      sim.events.trigger(`phone-${PHONE}`);
      expect(jan.phoneJob!.b.x).toBe(EAST.x);
      other?.walkTo(sim.nav, { x: WEST.x, z: HALL_Z });
      const track: number[] = [];
      const close: boolean[] = [];
      let otherOff = 0;
      let closest = Infinity;
      run(sim, 12, () => false, () => {
        track.push(jan.pos.z);
        if (!other) return;
        const d = Math.hypot(jan.pos.x - other.pos.x, jan.pos.z - other.pos.z);
        closest = Math.min(closest, d);
        close.push(d < 3);
        if (d < 3) otherOff = Math.max(otherOff, Math.abs(other.pos.z - jan.pos.z));
      });
      return { track, close, otherOff, closest, radii: jan.radius + (other?.radius ?? 0), passed: !!other && jan.pos.x > other.pos.x + 1 };
    };
    const alone = encounter(false);
    const met = encounter(true);
    expect(met.passed).toBe(true);
    expect(met.close.some(Boolean)).toBe(true);
    // Jan walks the very line he walks alone, the other one goes round him
    const swerve = Math.max(...met.track.map((z, i) => (met.close[i] ? Math.abs(z - alone.track[i]) : 0)));
    expect(swerve).toBeLessThan(0.03);
    expect(met.otherOff).toBeGreaterThan(met.radii - 0.05);
    expect(met.closest).toBeGreaterThan(met.radii * 0.95);
  });
});
