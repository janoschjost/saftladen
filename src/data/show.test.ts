import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office } from '../test/office';
import { expand, showLength } from '../game/Show';
import { OFFICE_ACTIONS } from './actions';
import { SHOW_SCENES } from './show';
import { team } from './team';

installHeadlessDom();

const ids = new Set(team.map((m) => m.id));
const ALL = SHOW_SCENES.flatMap((s) => [...(s.present ?? []), ...(s.home ?? []), ...(s.outside ?? [])]);

describe('show.script', () => {
  it('show.script: scene ids are unique and the film is about four minutes', () => {
    const names = SHOW_SCENES.map((s) => s.id);
    expect(new Set(names).size).toBe(names.length);
    expect(showLength(SHOW_SCENES)).toBeGreaterThan(200);
    expect(showLength(SHOW_SCENES)).toBeLessThan(300);
  });

  it('show.script: every person named exists, and nobody is in two places in a scene', () => {
    for (const s of SHOW_SCENES) {
      const here = [...(s.present ?? []), ...(s.home ?? []), ...(s.outside ?? [])];
      expect(new Set(here).size, s.id).toBe(here.length);
      for (const id of [...here, ...s.cues.flatMap((c) => ('who' in c ? (c.who ?? []) : [])), ...s.cues.flatMap((c) => ('arrive' in c ? c.arrive : []))]) {
        expect(ids.has(id), `${s.id}: ${id}`).toBe(true);
      }
      expect((s.present ?? []).length, s.id).toBeLessThanOrEqual(15);
      expect((s.home ?? []).length, s.id).toBeLessThanOrEqual(9);
    }
  });

  it('show.script: cues fall inside their scene, people who arrive wait outside, feeds are people at home', () => {
    for (const s of SHOW_SCENES) {
      for (const c of expand(s.cues)) {
        expect(c.t, s.id).toBeGreaterThanOrEqual(0);
        expect(c.t, s.id).toBeLessThan(s.length);
        if ('arrive' in c) expect(s.outside, s.id).toContain(c.arrive[0]);
        if ('feed' in c && c.feed) expect(s.home, s.id).toContain(c.feed);
        if ('shot' in c && c.shot.action) expect(OFFICE_ACTIONS.some((a) => a.id === c.shot.action), `${s.id}: ${c.shot.action}`).toBe(true);
      }
    }
  });

  it('show.script: every event the film runs exists, and everybody who is in a scene is a known person', () => {
    const sim = office();
    const events = new Set(sim.events.list().map((e) => e.id));
    for (const s of SHOW_SCENES) for (const c of s.cues) if ('event' in c) expect(events.has(c.event) || ['home-laundry', 'remote-son', 'kurt-home'].includes(c.event), `${s.id}: ${c.event}`).toBe(true);
    expect(ALL.every((id) => ids.has(id))).toBe(true);
  });

  it('show.script: everybody in the team gets a beat', () => {
    const named = new Set([...ALL, ...SHOW_SCENES.flatMap((s) => s.cues.flatMap((c) => ('who' in c ? (c.who ?? []) : [])))]);
    expect([...ids].filter((id) => !named.has(id))).toEqual([]);
  });

  it('show.script: no joke about restlessness: nothing in the subtitles names it', () => {
    const lines = SHOW_SCENES.flatMap((s) => s.cues.flatMap((c) => ('say' in c ? [c.say] : [])));
    expect(lines.join(' ')).not.toMatch(/adhs|adhd|zappel|unruhig/i);
  });
});
