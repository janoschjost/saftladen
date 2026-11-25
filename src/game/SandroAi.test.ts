import { describe, expect, it } from 'vitest';
import { SANDRO_ANSWERS, SANDRO_LINES } from '../data/sandroLines';
import { bubbleSeconds } from '../data/sonLines';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { DJ } from './Boombox';
import { ANSWER_CHANCE, GAP_MINUTES, HEARS } from './SandroAi';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

installHeadlessDom();

const NEIGHBOR = 'donata-manser';

/** Sandro at his desk for good, everybody else out. */
function stage(): Sim {
  const sim = office();
  for (const p of sim.people) if (p.id !== DJ) sim.scenario.put(p.id, 'errand', 'stay');
  sim.scenario.put(DJ, 'desk', 'stay');
  return sim;
}

describe('play.sandro-ai', () => {
  it('play.sandro-ai: he says a line and raises a hand while it shows; both end together after the bubble time', () => {
    const sim = stage();
    const sandro = sim.person(DJ);
    sim.sandroAi.timer = 0;
    sim.step(1 / 60);
    const line = sim.sandroAi.text!;
    expect(SANDRO_LINES).toContain(line);
    expect(sim.sandroAi.bubbles[0]).toEqual({ who: sandro, text: line });
    expect(sandro.aiGesture).toBe(true);
    expect(run(sim, bubbleSeconds(line) - 0.5)).toBe(false);
    expect(sandro.aiGesture).toBe(true);
    expect(run(sim, 1, () => sim.sandroAi.text === null)).toBe(true);
    expect(sandro.aiGesture).toBe(false);
    expect(sim.sandroAi.bubbles).toEqual([]);
  });

  it('play.sandro-ai: the next line comes 20 to 40 clock minutes after the last, and never the same twice in a row', () => {
    const sim = stage();
    let last = '';
    for (let i = 0; i < 40; i++) {
      sim.sandroAi.end();
      expect(sim.sandroAi.say()).toBe(true);
      expect(sim.sandroAi.text).not.toBe(last);
      last = sim.sandroAi.text!;
      expect(sim.sandroAi.timer).toBeGreaterThanOrEqual((GAP_MINUTES.min / 60) * GAME_HOUR);
      expect(sim.sandroAi.timer).toBeLessThanOrEqual(((GAP_MINUTES.min + GAP_MINUTES.extra) / 60) * GAME_HOUR);
    }
  });

  it('play.sandro-ai: he speaks by himself once the timer is up, then waits for the gap again', () => {
    const sim = stage();
    sim.sandroAi.timer = 2;
    expect(run(sim, 5, () => sim.sandroAi.active)).toBe(true);
    expect(sim.sandroAi.timer).toBeGreaterThan((GAP_MINUTES.min / 60) * GAME_HOUR - 10);
  });

  it('play.sandro-ai: not while he is away, on an errand, steered, held or in the boombox scene', () => {
    const sim = stage();
    const sandro = sim.person(DJ);
    const blocked: Array<[string, () => void, () => void]> = [
      ['away', () => sim.scenario.put(DJ, 'home', 'stay'), () => sim.scenario.put(DJ, 'desk', 'stay')],
      ['errand', () => sim.scenario.put(DJ, 'errand', 'stay'), () => sim.scenario.put(DJ, 'desk', 'stay')],
      ['steered', () => void (sandro.controlled = true), () => void (sandro.controlled = false)],
      ['held', () => void (sandro.held = true), () => void (sandro.held = false)],
      ['boombox', () => void (sandro.boomPose = 'play'), () => void (sandro.boomPose = null)],
    ];
    for (const [what, on, off] of blocked) {
      on();
      sim.sandroAi.timer = 0;
      sim.step(1 / 60);
      expect(sim.sandroAi.active, what).toBe(false);
      off();
    }
    sim.sandroAi.timer = 0;
    sim.step(1 / 60);
    expect(sim.sandroAi.active).toBe(true);
  });

  it('play.sandro-ai: the line ends with its hand when he is taken away mid-line', () => {
    const sim = stage();
    const sandro = sim.person(DJ);
    expect(sim.sandroAi.say()).toBe(true);
    sandro.held = true;
    sim.step(1 / 60);
    expect(sim.sandroAi.active).toBe(false);
    expect(sandro.aiGesture).toBe(false);
  });

  it('play.sandro-ai: somebody within 3 m answers wordless about every second time, somebody farther away never', () => {
    const sim = stage();
    const sandro = sim.person(DJ);
    const far = sim.person('jannik-stibi');
    sim.scenario.put(NEIGHBOR, { x: sandro.pos.x + HEARS - 1, z: sandro.pos.z }, 'stay');
    sim.scenario.put(far.id, { x: sandro.pos.x + HEARS + 2, z: sandro.pos.z }, 'stay');
    let answered = 0;
    const lines = 60;
    for (let i = 0; i < lines; i++) {
      sim.sandroAi.end();
      sim.sandroAi.say();
      sim.sandroAi.update(1.5); // past the 1 s delay
      const answers = sim.sandroAi.bubbles.filter((b) => b.who !== sandro);
      expect(answers.some((b) => b.who === far)).toBe(false);
      for (const a of answers) expect(SANDRO_ANSWERS).toContain(a.text);
      if (answers.length) answered++;
    }
    expect(answered / lines).toBeGreaterThan(ANSWER_CHANCE - 0.25);
    expect(answered / lines).toBeLessThan(ANSWER_CHANCE + 0.25);
  });

  it('play.sandro-ai: the dev event sandro-ai makes him say a line at once, also when he was away', () => {
    const sim = stage();
    sim.scenario.put(DJ, 'home', 'free');
    expect(sim.events.trigger('sandro-ai')).toBe('Sandro schwärmt von KI');
    expect(sim.sandroAi.active).toBe(true);
    expect(sim.person(DJ).inOffice).toBe(true);
  });

  it('play.sandro-ai: the dev event is refused while he is held', () => {
    const sim = stage();
    sim.person(DJ).held = true;
    expect(sim.events.trigger('sandro-ai')).toContain('nicht möglich');
  });
});
