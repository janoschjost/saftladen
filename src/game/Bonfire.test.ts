import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { BURN_MAX, ELIA } from './Bonfire';
import { makePossible } from './makePossible';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

installHeadlessDom();

/**
 * Elia's bonfire (`Bonfire.ts`, #251) on the whole office: when it starts, who comes with the extinguisher, that the
 * floor under the fire is blocked while it burns and free afterwards, and how it ends when somebody is taken away
 * mid-scene. The look (flames, foam, poses, the neckerchief) is checked by eye.
 */

const HELPER = 'donata-manser';
const OTHER = 'oscar-grob';

interface Stage {
  sim: Sim;
  elia: Person;
  helper: Person;
}

/** Elia on a break at the corridor, Donata at her desk, everybody else out for good (`others`: more people at their desks). */
function stage(others: string[] = []): Stage {
  const sim = office();
  for (const p of sim.people) if (![ELIA, HELPER, ...others].includes(p.id)) sim.scenario.put(p.id, 'errand', 'stay');
  sim.scenario.put(HELPER, 'desk', 'stay');
  for (const id of others) sim.scenario.put(id, 'desk', 'stay');
  sim.scenario.put(ELIA, { x: 12, z: 6 }, 'free');
  return { sim, elia: sim.person(ELIA), helper: sim.person(HELPER) };
}

/**
 * Steps until `stage` (false: not reached within `seconds`). Left to themselves the two at their desks would be off to a
 * meeting while the fire burns, so they sit down again at every step of it.
 */
const until = (s: Stage, stage: string | null, seconds = 60) => run(s.sim, seconds, () => s.sim.bonfire.stage === stage, () => ['build', 'burn'].includes(s.sim.bonfire.stage ?? '') && reseat(s));
const reseat = (s: Stage) => {
  for (const p of s.sim.people) if (p.id !== ELIA && p.inOffice && !p.held && p.task?.phase !== 'work' && (p.id === HELPER || p.id === OTHER)) s.sim.scenario.put(p.id, 'desk', 'stay');
};
const walkableAt = (sim: Sim, at: { x: number; z: number }) => sim.nav.walkable(sim.nav.toCell(at).cx, sim.nav.toCell(at).cz);

/** Nobody is stuck in the scene: no pose, no extinguisher, no pin, the floor free. */
function released(s: Stage, at: { x: number; z: number }): void {
  expect(s.sim.bonfire.active).toBe(false);
  for (const p of [s.elia, s.helper]) {
    expect(p.fireRole).toBeNull();
    expect(p.fireCarry).toBe(false);
    expect(p.rush).toBe(false);
    expect(p.scripted).toBeNull();
  }
  expect(s.sim.bonfire.extinguisher.visible).toBe(false);
  expect(walkableAt(s.sim, at)).toBe(true);
}

describe('play.bonfire: the scene', () => {
  it('play.bonfire: Elia walks to a free spot and lights the fire, it burns, the nearest free person comes with the extinguisher and puts it out; the charred spot stays', () => {
    const s = stage([OTHER]);
    const b = s.sim.bonfire;
    expect(b.start(s.elia, s.sim.people)).toBe(true);
    const at = b.at!;
    expect(b.stage).toBe('walk');
    expect(walkableAt(s.sim, at)).toBe(true); // nothing burns yet
    expect(until(s, 'build')).toBe(true);
    expect(b.fire.shown).toBe(true);
    expect(walkableAt(s.sim, at)).toBe(false); // nobody walks through the fire
    expect(Math.hypot(s.elia.pos.x - at.x, s.elia.pos.z - at.z)).toBeLessThan(2);
    expect(s.elia.fireRole).toBe('build');
    expect(until(s, 'burn')).toBe(true);
    expect(s.elia.fireRole).toBe('warm');
    expect(b.fire.level).toBe(1);
    expect(b.bubbles.map((x) => x.who.id)).toEqual([ELIA]);
    // the nearest of the two free people comes
    expect(until(s, 'look')).toBe(true);
    const near = b.helper!;
    const other = [s.helper, s.sim.person(OTHER)].find((p) => p !== near)!;
    expect(Math.hypot(near.pos.x - at.x, near.pos.z - at.z)).toBeLessThanOrEqual(Math.hypot(other.pos.x - at.x, other.pos.z - at.z));
    expect(b.bubbles.find((x) => x.who === near)?.text).toBe('❗');
    expect(until(s, 'run')).toBe(true);
    expect(near.fireCarry).toBe(true);
    expect(b.extinguisher.visible).toBe(true);
    expect(until(s, 'spray')).toBe(true);
    expect(near.fireRole).toBe('spray');
    expect(s.elia.fireRole).toBe('protest');
    expect(b.fire.foaming).toBe(true);
    expect(until(s, null)).toBe(true);
    expect(b.fire.charred).toBe(true);
    expect(b.fire.level).toBe(0);
    for (const p of [s.elia, near]) expect(p.fireRole).toBeNull();
    expect(near.fireCarry).toBe(false);
    expect(b.extinguisher.visible).toBe(false);
    expect(walkableAt(s.sim, at)).toBe(true);
    // the charred spot fades by itself
    run(s.sim, 25, () => false);
    expect(b.fire.charred).toBe(false);
    expect(b.fire.shown).toBe(false);
  });

  it('play.bonfire: nobody else free: no fire; held, away or steered Elia: nobody looks for him', () => {
    const s = stage();
    s.sim.scenario.put(HELPER, 'errand', 'stay');
    expect(s.sim.bonfire.start(s.elia, s.sim.people)).toBe(false);
    expect(s.sim.bonfire.active).toBe(false);
    expect(s.elia.scripted).toBeNull();
    const t = stage();
    expect(t.sim.bonfire.find(t.sim.people)).toBe(t.elia);
    t.elia.controlled = true; // steered
    expect(t.sim.bonfire.find(t.sim.people)).toBeNull();
    t.elia.controlled = false;
    t.sim.scenario.put(ELIA, 'errand', 'stay'); // away
    expect(t.sim.bonfire.find(t.sim.people)).toBeNull();
  });

  it('play.bonfire: by itself about once an hour, by day only', () => {
    const night = stage();
    expect(night.sim.bonfire.timer).toBeGreaterThanOrEqual(0.75 * GAME_HOUR);
    night.sim.bonfire.timer = 0;
    night.sim.tod.night = true;
    night.sim.step(1 / 60);
    expect(night.sim.bonfire.active).toBe(false); // not at night
    const day = stage();
    day.sim.bonfire.timer = 0;
    day.sim.step(1 / 60);
    expect(day.sim.bonfire.active).toBe(true);
    expect(day.sim.bonfire.timer).toBeGreaterThanOrEqual(0.75 * GAME_HOUR); // the next one only after the gap
    expect(day.sim.bonfire.timer).toBeLessThanOrEqual(1.25 * GAME_HOUR);
  });

  it('play.bonfire: the helper is taken away on the run: the next free person takes over', () => {
    const s = stage([OTHER]);
    const b = s.sim.bonfire;
    b.start(s.elia, s.sim.people);
    const at = b.at!;
    expect(until(s, 'run')).toBe(true);
    const first = b.helper!;
    first.held = true; // picked up
    reseat(s);
    s.sim.step(1 / 60);
    expect(b.stage).toBe('burn');
    expect(first.fireRole).toBeNull();
    expect(first.fireCarry).toBe(false);
    expect(until(s, 'run', 30)).toBe(true);
    expect(b.helper).not.toBe(first);
    expect(until(s, null)).toBe(true);
    expect(b.fire.charred).toBe(true);
    first.held = false;
    expect(walkableAt(s.sim, at)).toBe(true);
  });

  it('play.bonfire: nobody can come: the fire dies down by itself, it never burns forever', () => {
    const s = stage();
    const b = s.sim.bonfire;
    b.start(s.elia, s.sim.people);
    const at = b.at!;
    expect(until(s, 'burn')).toBe(true);
    s.sim.scenario.put(HELPER, 'errand', 'stay'); // she is gone
    expect(until(s, 'fizzle', BURN_MAX + 10)).toBe(true);
    expect(until(s, null)).toBe(true);
    released(s, at);
  });

  it('play.bonfire: an action that needs the people ends the scene at once (makePossible), nobody keeps a pose or a pin', () => {
    const s = stage();
    const b = s.sim.bonfire;
    b.start(s.elia, s.sim.people);
    const at = b.at!;
    expect(until(s, 'burn')).toBe(true);
    expect(makePossible(s.sim, () => (b.active ? null : 'ok'))).toBe('ok');
    released(s, at);
    expect(b.fire.shown).toBe(false);
    expect(b.fire.charred).toBe(false);
  });
});

describe('person.neckerchief', () => {
  it("person.neckerchief: Elia's look carries the scout neckerchief, nobody else's", () => {
    const looks = team.filter((m) => m.look.neckerchief);
    expect(looks.map((m) => m.id)).toEqual([ELIA]);
    expect(looks[0].look.neckerchief).toEqual({ body: expect.any(String), edge: expect.any(String) });
  });
});
