import { describe, expect, it } from 'vitest';
import { ENVELOPES, PARCELS, sizeOf } from '../render/mailProps';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run, STEP } from '../test/office';
import { COURIERS, DOVE, DRONE, MAIL_STAY, PUT } from './Mail';
import { makePossible } from './makePossible';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/**
 * The post (`Mail.ts`, #202) on the whole office: the dove and the drone bring it, an apprentice fetches it from the
 * porch and puts it on the desk it is addressed to. How it looks (meshes, flight, poses) is checked by eye.
 */

const TO = 'linda-peter';
const COURIER = 'alyosha-krajnc';

interface Stage {
  sim: Sim;
  to: Person;
  by: Person;
}

/** The addressee at their desk, the apprentice `by` at theirs (nobody holds them: they may be sent out), everybody else out. */
function stage(by = COURIER): Stage {
  const sim = office();
  for (const p of sim.people) if (p.id !== TO && p.id !== by) sim.scenario.put(p.id, 'errand');
  sim.scenario.put(TO, 'desk', 'stay');
  sim.scenario.put(by, 'desk', 'free');
  return { sim, to: sim.person(TO), by: sim.person(by) };
}

/** the desk the post goes to */
const deskOf = (sim: Sim, p: Person) => sim.deskFor(p)!;

const until = (sim: Sim, stage: string | null, seconds = 60) => run(sim, seconds, () => sim.mail.stage === stage);

describe('play.mail-letter', () => {
  it('play.mail-letter: a dove brings a letter, an apprentice fetches it and puts it on the desk of the addressee', () => {
    const { sim, to, by } = stage();
    expect(sim.mail.start('letter', true, to)).toBe(true);
    expect(sim.mail.kind).toBe('letter');
    expect(sim.mail.to).toBe(to);
    // the dove is on its way, then the letter waits in the mailbox
    expect(sim.mail.stage).toBe('arrive');
    expect(until(sim, 'wait', DOVE.gone + 1)).toBe(true);
    // somebody goes out for it: one of the apprentices
    expect(until(sim, 'out', 10)).toBe(true);
    expect(COURIERS).toContain(sim.mail.by!.id);
    expect(sim.mail.by).toBe(by);
    // they take it and carry it
    expect(until(sim, 'back', 40)).toBe(true);
    expect(by.mailCarry).toBe('letter');
    expect(sim.mail.bubbles).toEqual([{ who: by, text: '✉️' }]);
    // in, to the desk, and put it down
    expect(until(sim, 'hand', 40)).toBe(true);
    expect(until(sim, 'put', 60)).toBe(true);
    const desk = deskOf(sim, to);
    expect(Math.hypot(by.pos.x - desk.approach.x, by.pos.z - desk.approach.z)).toBeLessThan(0.5);
    expect(run(sim, PUT + 1, () => !sim.mail.active)).toBe(true);
    expect(sim.mail.onDesks.get(desk)).toBeDefined();
    expect(by.mailCarry).toBeNull();
    expect(by.scripted).toBeNull();
    expect(by.controlled).toBe(false);
  });

  it('play.mail-letter: the dove drops the letter into the mailbox before it is gone', () => {
    const { sim, to } = stage();
    sim.mail.start('letter', true, to);
    const item = sim.mail.item!;
    expect(item.parent).not.toBe(sim.scene); // in the dove's beak
    run(sim, DOVE.drop + 0.2);
    expect(item.parent).toBe(sim.scene);
    expect(item.position.y).toBeGreaterThan(1.3);
    expect(item.position.z).toBeGreaterThan(15.15);
  });

  it('play.mail-letter: the carrier is back at their own business afterwards', () => {
    const { sim, by } = stage();
    sim.mail.start('letter', true, sim.person(TO));
    expect(run(sim, 200, () => sim.mail.stage === null && by.presence === 'in' && !by.controlled)).toBe(true);
    expect(run(sim, 15, () => by.working)).toBe(true);
  });
});

describe('play.mail-parcel', () => {
  it('play.mail-parcel: a drone puts a parcel down at the mailboxes, an apprentice carries it to the desk', () => {
    const { sim, to, by } = stage('oscar-grob');
    expect(sim.mail.start('parcel', true, to)).toBe(true);
    const item = sim.mail.item!;
    expect(until(sim, 'wait', DRONE.gone + 1)).toBe(true);
    // on the porch floor, in front of the mailboxes
    expect(item.parent).toBe(sim.scene);
    expect(item.position.y).toBeCloseTo(sizeOf(item).h / 2, 3);
    expect(item.position.z).toBeGreaterThan(15.15);
    expect(until(sim, 'back', 60)).toBe(true);
    expect(sim.mail.by).toBe(by);
    expect(by.mailCarry).toBe('parcel');
    expect(sim.mail.bubbles).toEqual([{ who: by, text: '📦' }]);
    expect(run(sim, 120, () => !sim.mail.active)).toBe(true);
    expect(sim.mail.onDesks.get(deskOf(sim, to))).toBe(item);
    expect(item.parent).toBe(deskOf(sim, to).root);
  });
});

describe('office.mailboxes', () => {
  it('office.mailboxes: envelopes and parcels differ in size and colour', () => {
    expect(new Set(ENVELOPES.map((v) => v.color)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(ENVELOPES.map((v) => v.w)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(PARCELS.map((v) => v.color)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(PARCELS.map((v) => v.w * v.h * v.d)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('play.mail-abort', () => {
  it('play.mail-abort: ends at once with the item on the desk, whatever the stage', () => {
    for (const stop of ['arrive', 'wait', 'out', 'back', 'hand'] as const) {
      const { sim, to, by } = stage();
      const desk = deskOf(sim, to);
      sim.mail.start('letter', true, to);
      expect(until(sim, stop, 120)).toBe(true);
      sim.mail.abort((p) => ({ ...p.pos }));
      expect(sim.mail.active).toBe(false);
      expect(sim.mail.onDesks.get(desk)).toBeDefined();
      expect(by.mailCarry).toBeNull();
      expect(by.scripted).toBeNull();
      expect(by.controlled).toBe(false);
    }
  });

  it('play.mail-abort: a carrier who is picked up drops the item on the desk', () => {
    const { sim, to, by } = stage();
    sim.mail.start('letter', true, to);
    expect(until(sim, 'back', 120)).toBe(true);
    by.held = true;
    sim.step(STEP);
    expect(sim.mail.active).toBe(false);
    expect(sim.mail.onDesks.get(deskOf(sim, to))).toBeDefined();
    expect(by.mailCarry).toBeNull();
  });

  it('play.mail-abort: a fetcher who is picked up on the way out leaves the letter for the next', () => {
    const { sim, to, by } = stage();
    sim.mail.start('letter', true, to);
    expect(until(sim, 'out', 120)).toBe(true);
    by.held = true;
    sim.step(STEP);
    expect(sim.mail.stage).toBe('wait');
    expect(sim.mail.by).toBeNull();
    by.held = false;
    expect(run(sim, 200, () => !sim.mail.active)).toBe(true);
    expect(sim.mail.onDesks.get(deskOf(sim, to))).toBeDefined();
  });

  it('play.mail-abort: a new working day clears the desks', () => {
    const { sim, to } = stage();
    sim.mail.start('letter', true, to);
    expect(run(sim, 200, () => !sim.mail.active)).toBe(true);
    expect(sim.mail.onDesks.size).toBe(1);
    sim.mail.update(STEP, sim.nav, sim.presence.days + 1);
    expect(sim.mail.onDesks.size).toBe(0);
  });

  it('play.mail-abort: a dev event the post is in the way of clears it', () => {
    const { sim, to } = stage();
    sim.mail.start('letter', true, to);
    expect(until(sim, 'out', 120)).toBe(true);
    const r = makePossible(sim, () => (sim.mail.active ? null : 'ok'));
    expect(r).toBe('ok');
    expect(sim.mail.active).toBe(false);
  });
});

describe('play.mail-letter by itself', () => {
  it('play.mail-letter: by itself now and then, in the dry, with an apprentice free to fetch it', () => {
    const { sim } = stage();
    sim.mail.timer = 0;
    sim.step(STEP);
    expect(sim.mail.active).toBe(true);
    expect(sim.mail.timer).toBeGreaterThan(40);
  });

  it('play.mail-letter: not in the rain, not without an apprentice, never two at once', () => {
    const rain = stage();
    rain.sim.weather.raining = true;
    rain.sim.mail.timer = 0;
    rain.sim.step(STEP);
    expect(rain.sim.mail.active).toBe(false);

    const none = stage();
    none.sim.scenario.put(COURIER, 'errand');
    none.sim.mail.timer = 0;
    none.sim.step(STEP);
    expect(none.sim.mail.active).toBe(false);

    const one = stage();
    expect(one.sim.mail.start('letter', true)).toBe(true);
    expect(one.sim.mail.start('parcel', true)).toBe(false);
  });
});

describe('play.mail-letter timing', () => {
  it('play.mail-letter: the fetcher looks into the mailbox for a moment', () => {
    const { sim, to } = stage();
    sim.mail.start('letter', true, to);
    expect(until(sim, 'out', 120)).toBe(true);
    const seen = run(sim, 60, () => sim.mail.by!.atPorchStop);
    expect(seen).toBe(true);
    expect(run(sim, MAIL_STAY, () => sim.mail.stage === 'back')).toBe(true);
  });
});
