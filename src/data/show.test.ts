import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office } from '../test/office';
import { expand } from '../game/Show';
import { OFFICE_ACTIONS } from './actions';
import { SHOW_FILM, WAITING } from './show';
import { team } from './team';

installHeadlessDom();

const ids = new Set(team.map((m) => m.id));
const cues = expand(SHOW_FILM.cues);
const stages = cues.flatMap((c) => ('stage' in c ? [c.stage] : []));
const placed = stages.flatMap((s) => [...(s.groups ?? []).flatMap((g) => g.who), ...(s.home ?? []), ...(s.outside ?? [])]);
const spoken = cues.flatMap((c) => ('who' in c ? (c.who ?? []) : []));

describe('show.script', () => {
  it('show.script: one film of four to five minutes, cues and camera keys in time order inside it', () => {
    expect(SHOW_FILM.length).toBeGreaterThan(200);
    expect(SHOW_FILM.length).toBeLessThan(330);
    const times = SHOW_FILM.camera.map((k) => k.t);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    expect(times[0]).toBe(0);
    expect(times.at(-1)!).toBeGreaterThanOrEqual(SHOW_FILM.length - 5);
    for (const c of cues) {
      expect(c.t).toBeGreaterThanOrEqual(0);
      expect(c.t).toBeLessThan(SHOW_FILM.length);
    }
    const marks = cues.flatMap((c) => ('mark' in c ? [c.mark] : []));
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('show.script: every person named exists, and nobody stands in two places at once', () => {
    for (const s of stages) {
      const here = [...(s.groups ?? []).flatMap((g) => g.who), ...(s.home ?? []), ...(s.outside ?? [])];
      expect(new Set(here).size).toBe(here.length);
    }
    for (const id of [...placed, ...spoken, ...cues.flatMap((c) => ('arrive' in c ? c.arrive : [])), ...cues.flatMap((c) => ('cast' in c ? (c.cast ?? []) : []))]) expect(ids.has(id), id).toBe(true);
  });

  it('show.script: the cast of an event waits in the office, people who arrive wait outside, feeds are people at home', () => {
    const waiting = new Set(WAITING.flatMap((g) => g.who));
    const outside = new Set(stages.flatMap((s) => s.outside ?? []));
    const home = new Set(stages.flatMap((s) => s.home ?? []));
    for (const c of cues) {
      if ('event' in c) for (const id of c.cast ?? []) expect(waiting.has(id) || outside.has(id) || home.has(id), `${c.event}: ${id}`).toBe(true);
      if ('arrive' in c) for (const id of c.arrive) expect(outside.has(id), id).toBe(true);
      if ('feed' in c && c.feed) expect(home.has(c.feed), c.feed).toBe(true);
    }
    expect(waiting.size + home.size + outside.size).toBe(ids.size);
  });

  it('show.script: the camera only goes to known places, and the people of one place stand where it is', () => {
    for (const k of SHOW_FILM.camera) if (k.shot.action) expect(OFFICE_ACTIONS.some((a) => a.id === k.shot.action), k.shot.action).toBe(true);
    for (const g of WAITING) expect(g.at, g.who.join()).toBeDefined();
  });

  it('show.script: every event the film runs exists', () => {
    const events = new Set(office().events.list().map((e) => e.id));
    const ofGame = ['home-laundry', 'remote-son', 'kurt-home']; // registered by the game itself, not by the simulation
    for (const c of cues) if ('event' in c) expect(events.has(c.event) || ofGame.includes(c.event), c.event).toBe(true);
  });

  it('show.script: everybody in the team gets a beat', () => {
    const named = new Set([...placed, ...spoken]);
    expect([...ids].filter((id) => !named.has(id))).toEqual([]);
  });

  it('show.script: no joke about restlessness: nothing in the subtitles names it', () => {
    const lines = cues.flatMap((c) => ('say' in c ? [c.say] : []));
    expect(lines.join(' ')).not.toMatch(/adhs|adhd|zappel|unruhig/i);
  });
});
