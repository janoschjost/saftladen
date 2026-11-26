import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { LIVIA_LINES, MAX_LIVIA_LINE } from '../data/liviaLines';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, STEP, office, run } from '../test/office';
import { cycleOf } from './TimeOfDay';
import { LINE_GAP, LINE_SECONDS, LIVIA, RETRY } from './LiviaLines';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

installHeadlessDom();

/** The office holds only these people, everybody else is out. */
function only(sim: Sim, ids: readonly string[]) {
  for (const p of sim.people) if (!ids.includes(p.id)) sim.scenario.put(p.id, 'errand');
}

/** Every line she starts while the office runs `seconds`: when (game seconds) and which. Also checks one bubble at a time. */
function lines(sim: Sim, seconds: number): Array<{ at: number; text: string; up: number }> {
  const said: Array<{ at: number; text: string; up: number }> = [];
  let t = 0;
  let was: string | null = null;
  run(sim, seconds, () => false, () => {
    t += STEP;
    const now = sim.livia.text;
    expect(sim.livia.bubbles.length).toBeLessThanOrEqual(1);
    if (now !== null && now !== was) said.push({ at: t, text: now, up: 0 });
    if (now !== null) said[said.length - 1].up += STEP;
    was = now;
  });
  return said;
}

describe('char.livia: Livia In-Albon, Beratung Strategie', () => {
  it('char.livia: in the team with her role and portrait, her hours, no pet, no smoker, no extras, normal speed', () => {
    const m = team.find((p) => p.id === LIVIA)!;
    expect(m).toMatchObject({ name: 'Livia In-Albon', role: 'Beratung Strategie', portrait: 'team/livia-in-albon.jpg' });
    expect(m.schedule.arrive * 60).toBeCloseTo(8 * 60 + 40);
    expect(m.schedule.leave * 60).toBeCloseTo(17 * 60 + 45);
    expect(m.schedule.lunch * 60).toBeCloseTo(12 * 60 + 25);
    expect([m.dog, m.cats, m.speed, m.son, m.partner, m.signature, m.alterEgo]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
    expect([m.smoke, m.adhd, m.napper, m.snacker, m.hatesCoffee]).toEqual([false, false, false, false, false]);
    expect(m.look).toMatchObject({ style: 'long', heightM: 1.7 });
  });
});

describe('livia.lines: Livia says a line in Walliser Deutsch now and then', () => {
  it('livia.lines: the eight lines of the issue, word for word, none longer than 40 characters', () => {
    expect(LIVIA_LINES).toEqual([
      'Ich gah embri gah di Porta üftüe.',
      'Ich gah gschwind die Guttra gah üffillo.',
      'Bisch mus?',
      'Wier brüche unbedingt Ferie,',
      'daswer nisch alli mal chäne üsliwo.',
      'Tagwohl.',
      'Hüere Tubel!',
      'Siänta miessend sumi wirkli Seich macho!',
    ]);
    expect(MAX_LIVIA_LINE).toBe(40);
    for (const line of LIVIA_LINES) expect(line.length).toBeLessThanOrEqual(MAX_LIVIA_LINE);
  });

  it('livia.lines: at her desk a line every 1–2 clock hours, up about 3 s, never the same twice in a row; nobody else says one', () => {
    const sim = office();
    only(sim, [LIVIA, ...GROUP]);
    sim.scenario.put(LIVIA, 'desk');
    const said = lines(sim, 12 * GAME_HOUR);
    expect(said.length).toBeGreaterThanOrEqual(5);
    expect(said[0].at).toBeLessThanOrEqual((LINE_GAP.min + LINE_GAP.extra) * GAME_HOUR + RETRY);
    for (let i = 1; i < said.length; i++) {
      const gap = said[i].at - said[i - 1].at;
      expect(gap).toBeGreaterThanOrEqual(LINE_GAP.min * GAME_HOUR - STEP);
      expect(gap).toBeLessThanOrEqual((LINE_GAP.min + LINE_GAP.extra) * GAME_HOUR + RETRY);
      expect(said[i].text).not.toBe(said[i - 1].text);
    }
    for (const s of said.slice(0, -1)) expect(s.up).toBeCloseTo(LINE_SECONDS, 1);
    for (const s of said) expect(LIVIA_LINES).toContain(s.text);
    expect(sim.livia.bubbles.every((b) => b.who.id === LIVIA)).toBe(true);
  });

  it('livia.lines: while walking she says them too', () => {
    const sim = office();
    only(sim, [LIVIA]);
    sim.scenario.put(LIVIA, 'desk', 'stay');
    const p = sim.person(LIVIA);
    const states = new Set<string>();
    run(sim, 30 * GAME_HOUR, () => states.has('walk'), () => {
      if (sim.livia.text !== null && sim.livia.bubbles.length) states.add(p.working ? 'desk' : p.state);
    });
    expect(states.has('walk')).toBe(true);
  });

  it('livia.lines: not at night', () => {
    const sim = office({ cycle: cycleOf(23) });
    only(sim, [LIVIA]);
    sim.scenario.put(LIVIA, 'desk');
    expect(sim.tod.night).toBe(true);
    expect(lines(sim, 4 * GAME_HOUR)).toEqual([]);
  });

  it('livia.lines: not in a meeting; she goes on once it is over', () => {
    const sim = office();
    only(sim, [LIVIA, GROUP[0]]);
    sim.scenario.put(LIVIA, 'desk', 'stay');
    sim.scenario.put(GROUP[0], 'desk', 'stay');
    expect(sim.meetingRoom.start([sim.person(LIVIA), sim.person(GROUP[0])], sim.nav)).not.toBeNull();
    sim.livia.nextIn = 0; // her line is due now
    run(sim, 6 * GAME_HOUR, () => !sim.person(LIVIA).inMeeting, () => expect(sim.livia.text).toBeNull());
    expect(sim.person(LIVIA).inMeeting).toBe(false);
    sim.scenario.put(GROUP[0], 'errand'); // nobody left for a chat after the meeting (in a talk she says none either)
    expect(run(sim, GAME_HOUR, () => sim.livia.text !== null)).toBe(true);
  });

  it('livia.lines: not while steered by the player', () => {
    const sim = office();
    only(sim, [LIVIA]);
    sim.scenario.put(LIVIA, 'desk', 'stay'); // not pinned: a pin is a scene, not the player
    sim.person(LIVIA).controlled = true;
    sim.livia.nextIn = 0;
    expect(lines(sim, 10)).toEqual([]);
  });

  it('livia.event: livia-line brings her in from home and she says a line at once, at night too; refused while steered', () => {
    const sim = office({ cycle: cycleOf(23) });
    sim.scenario.put(LIVIA, 'home', 'free');
    const status = sim.events.trigger('livia-line');
    expect(status).toMatch(/^Livia: /);
    expect(sim.person(LIVIA).inOffice).toBe(true);
    expect(LIVIA_LINES).toContain(sim.livia.text);
    expect(status).toBe(`Livia: ${sim.livia.text}`);
    // asked again at once: one bubble, another line
    const before = sim.livia.text;
    sim.events.trigger('livia-line');
    expect(sim.livia.text).not.toBe(before);
    expect(sim.livia.bubbles.length).toBe(1);

    sim.person(LIVIA).controlled = true;
    expect(sim.events.trigger('livia-line')).toMatch(/nicht möglich$/);
  });

  it('livia.event: a meeting she sits in is cleared for the line (actions.force)', () => {
    const sim = office();
    only(sim, [LIVIA, GROUP[0]]);
    sim.scenario.put(LIVIA, 'desk', 'stay');
    sim.scenario.put(GROUP[0], 'desk', 'stay');
    sim.meetingRoom.start([sim.person(LIVIA), sim.person(GROUP[0])], sim.nav);
    expect(sim.events.trigger('livia-line')).toMatch(/^Livia: /);
    expect(sim.person(LIVIA).inMeeting).toBe(false);
    expect(sim.livia.text).not.toBeNull();
  });
});
