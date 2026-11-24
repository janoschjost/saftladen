import { describe, expect, it } from 'vitest';
import { OSCAR_LINES } from '../data/oscarLines';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run, STEP } from '../test/office';
import { makePossible } from './makePossible';
import { MESS_CHANCE, type MessChance, type MessItem } from './Mess';
import { MESS_BOOST, MIN_BUBBLE, RETRY, TIDIER, TIDY_GAP } from './OscarTidy';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

installHeadlessDom();

/**
 * Oscar's tidy outings (`OscarTidy.ts`, #296): the mess boost while he is in, the outing (nearest first, 2–3 pieces,
 * the police cap on and off, interruptions), the schedule and his lines. The poses are checked by eye.
 */

/** The office at 11:00, Oscar at his desk (nothing holds him), the office full of mess. */
function stage(): Sim {
  const sim = office();
  sim.scenario.put(TIDIER, 'desk', 'free');
  sim.mess.fill();
  return sim;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** The cap he wears now: 'police' or his own navy one. */
function cap(sim: Sim): 'police' | 'own' {
  const rig = sim.person(TIDIER).rig;
  expect(rig.policeCap!.visible).toBe(!rig.cap!.visible); // never both, never none
  return rig.policeCap!.visible ? 'police' : 'own';
}

describe('office.mess', () => {
  it('office.mess: while Oscar is in the office every chance is doubled (at most 1), without him they are as they are', () => {
    const sim = office();
    const keys = Object.keys(MESS_CHANCE) as MessChance[];
    sim.scenario.put(TIDIER, 'desk');
    for (const k of keys) expect(sim.mess.chance(k)).toBeCloseTo(Math.min(1, MESS_CHANCE[k] * MESS_BOOST));
    expect(sim.mess.chance('cup')).toBe(1); // 0.6 doubled: capped
    for (const where of ['errand', 'home'] as const) {
      sim.scenario.put(TIDIER, where);
      for (const k of keys) expect(sim.mess.chance(k)).toBe(MESS_CHANCE[k]);
    }
  });
});

describe('oscar.tidy', () => {
  it('oscar.tidy: an outing takes 2 or 3 pieces, nearest first, in the police cap; back at his desk the own cap is on again', () => {
    const sim = stage();
    const oscar = sim.person(TIDIER);
    expect(cap(sim)).toBe('own');
    expect(sim.tidy.start()).toBe(true);
    expect(cap(sim)).toBe('police');
    const taken: MessItem[] = [];
    let target: MessItem | null = null;
    let back = false;
    const done = run(
      sim,
      300,
      () => !sim.tidy.active,
      () => {
        const t = sim.tidy.target;
        if (t && t !== target) {
          // a new piece: the nearest one from where he stands
          const nearest = Math.min(...sim.mess.list().map((i) => dist(sim.mess.where(i), oscar.pos)));
          expect(dist(sim.mess.where(t), oscar.pos)).toBeLessThan(nearest + 0.1);
        }
        target = t;
        if (sim.tidy.stage === 'pick' && t && !taken.includes(t)) taken.push(t);
        if (sim.tidy.stage === 'back' && oscar.task?.phase === 'approach') back = true;
        if (sim.tidy.active) expect(cap(sim)).toBe('police');
      },
    );
    expect(done).toBe(true);
    expect(taken.length).toBeGreaterThanOrEqual(2);
    expect(taken.length).toBeLessThanOrEqual(3);
    for (const item of taken) expect(sim.mess.list()).not.toContain(item);
    expect(back).toBe(true); // he walked back to his desk (a meeting may call him in on the way: then the outing ends there)
    expect(cap(sim)).toBe('own');
    expect(oscar.scripted).toBeNull();
    expect(oscar.tidyPose).toBeNull();
  });

  it('oscar.tidy: the first piece is the nearest one from his desk', () => {
    const sim = stage();
    const oscar = sim.person(TIDIER);
    sim.tidy.start();
    const nearest = Math.min(...sim.mess.list().map((i) => dist(sim.mess.where(i), oscar.pos)));
    expect(dist(sim.mess.where(sim.tidy.target!), oscar.pos)).toBeCloseTo(nearest);
  });

  it('oscar.tidy: picked up, steered, sent home or into a new working day, the outing ends at once and the cap goes back', () => {
    const cases: Array<[string, (sim: Sim) => void]> = [
      ['held', (sim) => void (sim.person(TIDIER).held = true)],
      ['steered', (sim) => { const p = sim.person(TIDIER); p.unpin(); p.controlled = true; }], // what Game.toggleSteer does
      ['sent home', (sim) => sim.scenario.put(TIDIER, 'home')],
      ['new day', (sim) => void sim.presence.days++],
    ];
    for (const [, interrupt] of cases) {
      const sim = stage();
      const oscar = sim.person(TIDIER);
      expect(sim.tidy.start()).toBe(true);
      run(sim, 1);
      interrupt(sim);
      sim.tidy.update(STEP);
      expect(sim.tidy.active).toBe(false);
      expect(cap(sim)).toBe('own');
      expect(oscar.tidyPose).toBeNull();
    }
  });

  it('oscar.tidy: a new working day starts the schedule over: the first outing 1 to 2 hours after he is in', () => {
    const sim = stage();
    sim.tidy.update(STEP);
    sim.presence.days++;
    sim.tidy.update(STEP);
    sim.tidy.update(STEP);
    expect(sim.tidy.nextIn).toBeGreaterThan(TIDY_GAP.min * GAME_HOUR - 1);
    expect(sim.tidy.nextIn).toBeLessThan((TIDY_GAP.min + TIDY_GAP.extra) * GAME_HOUR);
  });

  it('oscar.tidy: with nothing lying around he stays at his desk and looks again later', () => {
    const sim = stage();
    sim.mess.clear();
    expect(sim.tidy.start()).toBe(false);
    sim.tidy.update(STEP);
    sim.tidy.nextIn = 0;
    sim.tidy.update(STEP);
    expect(sim.tidy.active).toBe(false);
    expect(sim.tidy.nextIn).toBe(RETRY);
    expect(cap(sim)).toBe('own');
  });

  it('oscar.tidy: by himself he goes 1 to 2 clock hours after he came in, and after an outing 1 to 2 hours later again', () => {
    const sim = stage();
    sim.tidy.update(STEP);
    const first = sim.tidy.nextIn!;
    expect(first).toBeGreaterThanOrEqual(TIDY_GAP.min * GAME_HOUR - 1);
    expect(first).toBeLessThanOrEqual((TIDY_GAP.min + TIDY_GAP.extra) * GAME_HOUR);
    sim.tidy.nextIn = STEP / 2; // the hour is up
    expect(run(sim, 5, () => sim.tidy.active)).toBe(true);
    expect(run(sim, 300, () => !sim.tidy.active)).toBe(true);
    expect(sim.tidy.nextIn).toBeGreaterThanOrEqual(TIDY_GAP.min * GAME_HOUR - 1);
  });

  it('oscar.tidy: not while somebody holds him (picked up)', () => {
    const sim = stage();
    sim.person(TIDIER).held = true;
    expect(sim.tidy.start()).toBe(false);
    expect(sim.tidy.start(true)).toBe(false);
  });
});

describe('oscar.lines', () => {
  it('oscar.lines: he starts with a Chrigi line, one bubble at a time, each up at least 3 s, never the same line twice in a row', () => {
    const sim = stage();
    const said: Array<{ text: string; from: number; to: number }> = [];
    let t = 0;
    let first: string | null = null;
    for (let outing = 0; outing < 4; outing++) {
      sim.scenario.put(TIDIER, 'desk', 'free');
      sim.mess.fill();
      expect(sim.tidy.start()).toBe(true);
      if (outing === 0) first = sim.tidy.text;
      // until he is done and quiet again
      run(sim, 300, () => !sim.tidy.active && sim.tidy.text === null, () => {
        t += STEP;
        const text = sim.tidy.text;
        const last = said.at(-1);
        if (text && (!last || last.to < t - STEP * 1.5)) said.push({ text, from: t, to: t });
        else if (text && last) {
          expect(text).toBe(last.text); // one bubble at a time: a line stays until it is gone
          last.to = t;
        }
      });
    }
    expect(OSCAR_LINES.start).toContain(first);
    expect(said.length).toBeGreaterThan(4);
    for (const s of said) expect(s.to - s.from).toBeGreaterThanOrEqual(MIN_BUBBLE - 2 * STEP);
    for (let i = 1; i < said.length; i++) expect(said[i].text).not.toBe(said[i - 1].text);
  });
});

describe('oscar.event', () => {
  it('oscar.event: oscar-tidy calls him back and makes a mess first; oscar-tidy-end ends it, "nicht möglich" when he does not tidy', () => {
    const sim = office();
    sim.scenario.put(TIDIER, 'home', 'free');
    sim.mess.clear();
    expect(sim.events.trigger('oscar-tidy-end')).toMatch(/nicht möglich/);
    expect(sim.events.trigger('oscar-tidy')).toMatch(/räumt auf/);
    expect(sim.tidy.active).toBe(true);
    expect(sim.person(TIDIER).inOffice).toBe(true);
    expect(sim.mess.count()).toBeGreaterThan(0);
    expect(sim.events.trigger('oscar-tidy-end')).not.toMatch(/nicht möglich/);
    expect(sim.tidy.active).toBe(false);
    expect(cap(sim)).toBe('own');
  });

  it('oscar.event: an action that needs Oscar clears his outing (makePossible)', () => {
    const sim = stage();
    sim.tidy.start();
    expect(makePossible(sim, () => (sim.tidy.active ? null : 'ok'))).toBe('ok');
    expect(cap(sim)).toBe('own');
  });
});
