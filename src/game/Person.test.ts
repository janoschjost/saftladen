import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { buildCharacter } from '../render/characterBuilder';
import { addKurt } from '../render/kurtBuilder';
import { KURT } from './AlterEgo';
import { DOOR_LANES } from './Door';
import type { NavGrid } from './NavGrid';
import { Person } from './Person';
import { setSeed } from './rng';

const STEP = 1 / 60;
/** No paths needed: the person starts right at the door. */
const nav = { findPath: () => [] } as unknown as NavGrid;

function marcoAtDoor(): Person {
  setSeed(1);
  const m = team.find((t) => t.id === 'marco-rieser')!;
  const rig = buildCharacter(m.look);
  addKurt(rig);
  const lane = DOOR_LANES[0];
  return new Person(m, rig, { ...lane.in });
}

const run = (p: Person, seconds: number, until?: () => boolean) => {
  for (let t = 0; t < seconds; t += STEP) {
    p.update(STEP, nav, []);
    if (until?.()) return true;
  }
  return false;
};

describe('kurt.behavior: Person', () => {
  it('kurt.behavior: going home spins him into Kurt (poof), out of the door he is Marco again, back in as Marco', () => {
    const p = marcoAtDoor();
    p.leaveOffice(nav, 'off', 3);
    expect(p.spin).toBe(KURT.spin);
    const skin = () => p.rig.skin.every((s) => !s.visible);
    run(p, KURT.spin * 0.4);
    expect(p.alter).toBe(false); // first half of the spin: still Marco
    run(p, KURT.spin * 0.2);
    expect(p.alter && p.poof && skin()).toBe(true);
    expect(p.displayName).toBe('Kurt');
    // walks out of the door as Kurt, gone: Marco again
    expect(run(p, 20, () => p.presence === 'out' && !p.alter)).toBe(true);
    expect(p.displayName).toBe(p.member.name);
    expect(p.rig.skin.every((s) => s.visible)).toBe(true);
    // comes back in as Marco
    expect(run(p, 10, () => p.presence === 'returning')).toBe(true);
    expect(p.alter).toBe(false);
  });

  it('kurt.behavior: an errand (no transform) keeps him Marco; being called back mid-spin turns him back', () => {
    const p = marcoAtDoor();
    p.leaveOffice(nav, 'errand', 3);
    expect(run(p, 5, () => p.alter)).toBe(false);
    const q = marcoAtDoor();
    q.leaveOffice(nav, 'home', 60);
    run(q, KURT.spin * 0.7);
    expect(q.alter).toBe(true);
    q.cancelLeave();
    expect(q.alter).toBe(false);
    expect(q.presence).toBe('in');
  });

  it('kurt.behavior: lunch turns into the end of the day on the way out: he still spins into Kurt', () => {
    const p = marcoAtDoor();
    p.leaveOffice(nav, 'errand', 3);
    expect(p.spin).toBe(0);
    p.leaveAs('off');
    expect(p.spin).toBe(KURT.spin);
    expect(run(p, KURT.spin, () => p.alter)).toBe(true);
    // sent out by hand: stays Marco, also when it becomes the end of the day
    const q = marcoAtDoor();
    q.leaveOffice(nav, 'home', 600, true);
    q.leaveAs('off');
    expect(q.spin).toBe(0);
    // already in the doorway: too late to spin
    const r = marcoAtDoor();
    r.leaveOffice(nav, 'errand', 3);
    expect(run(r, 2, () => (r as unknown as { script: unknown }).script !== null)).toBe(true);
    r.leaveAs('off');
    expect(r.spin).toBe(0);
  });
});
