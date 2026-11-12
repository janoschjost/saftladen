import { describe, expect, it } from 'vitest';
import { cycleOfHour, daylightOf, hourOf } from '../game/TimeOfDay';
import { chromeVisibility, escLayer, filterPalette, hintItems, hourToShare, shareToHour } from './chromeRules';
import type { ViewMode } from '../render/Views';

describe('ui.palette: filter and ranking', () => {
  const entries = [
    { group: 'Ansicht', label: 'Iso' },
    { group: 'Ereignisse', label: 'Meeting 4 Personen' },
    { group: 'Ereignisse', label: 'Kaffeepause' },
    { group: 'Leute', label: 'Fabian Bucher · Am Platz' },
    { group: 'Panel', label: 'Umgebung' },
  ];

  it('empty query keeps everything in order', () => {
    expect(filterPalette(entries, '  ')).toEqual(entries);
  });

  it('matches substrings of the label, ignoring case and accents', () => {
    expect(filterPalette(entries, 'KAFFE').map((e) => e.label)).toEqual(['Kaffeepause']);
    expect(filterPalette(entries, 'bücher').map((e) => e.label)).toEqual(['Fabian Bucher · Am Platz']);
  });

  it('matches the group as well', () => {
    expect(filterPalette(entries, 'ereignisse').map((e) => e.label)).toEqual(['Meeting 4 Personen', 'Kaffeepause']);
  });

  it('ranks prefix before word start before substring', () => {
    const list = [
      { group: 'a', label: 'Xmeeting' },
      { group: 'a', label: 'Das Meeting' },
      { group: 'a', label: 'Meeting' },
    ];
    expect(filterPalette(list, 'meet').map((e) => e.label)).toEqual(['Meeting', 'Das Meeting', 'Xmeeting']);
  });

  it('finds loose letters and returns nothing for gibberish', () => {
    expect(filterPalette(entries, 'mtg').map((e) => e.label)).toEqual(['Meeting 4 Personen']);
    expect(filterPalette(entries, 'zzzz')).toEqual([]);
  });
});

describe('ui.esc-layers: Esc steps back one layer', () => {
  const all = { mode: 'orbit' as ViewMode, palette: true, selection: true, timeline: true, panel: true };

  it('goes palette, selection, timeline, panel in that order', () => {
    expect(escLayer(all)).toBe('palette');
    expect(escLayer({ ...all, palette: false })).toBe('selection');
    expect(escLayer({ ...all, palette: false, selection: false })).toBe('timeline');
    expect(escLayer({ ...all, palette: false, selection: false, timeline: false })).toBe('panel');
    expect(escLayer({ ...all, palette: false, selection: false, timeline: false, panel: false })).toBeNull();
  });

  it('leaves walk mode and ends the day only when nothing else is open', () => {
    expect(escLayer({ mode: 'walk', palette: false, selection: false, timeline: false, panel: false })).toBe('mode');
    expect(escLayer({ mode: 'third', palette: false, selection: false, timeline: false, panel: false })).toBe('mode');
  });

  it('ignores layers that are not visible in the mode', () => {
    expect(escLayer({ mode: 'walk', palette: false, selection: true, timeline: true, panel: true })).toBe('mode');
    expect(escLayer({ mode: 'third', palette: false, selection: true, timeline: true, panel: true })).toBe('mode');
    expect(escLayer({ mode: 'walk', palette: true, selection: false, timeline: false, panel: false })).toBe('palette');
  });
});

describe('ui.mode-chrome: which controls show per mode', () => {
  it('iso and orbit show everything but the plan and walk extras', () => {
    for (const mode of ['iso', 'orbit'] as const) {
      const v = chromeVisibility(mode);
      expect([v.dock, v.timeline, v.side, v.radial, v.hintLine, v.badge, v.title]).toEqual(Array(7).fill(true));
      expect([v.planTools, v.walk]).toEqual([false, false]);
    }
  });

  it('plan adds the editor tool column', () => {
    expect(chromeVisibility('plan').planTools).toBe(true);
    expect(chromeVisibility('plan').dock).toBe(true);
  });

  it('walk hides the dock, timeline, panel and title, and shows the walk keys', () => {
    const v = chromeVisibility('walk');
    expect([v.dock, v.timeline, v.side, v.radial, v.title, v.hintLine]).toEqual(Array(6).fill(false));
    expect(v.walk).toBe(true);
  });

  it('day mode hides the dock too', () => {
    const v = chromeVisibility('third');
    expect([v.dock, v.timeline, v.side, v.radial, v.walk]).toEqual(Array(5).fill(false));
  });

  it('the hint line follows mode and selection', () => {
    expect(hintItems('orbit', false, true).map((h) => h.keys)).toEqual(['1–4', 'N', '⌘K']);
    expect(hintItems('plan', false, false).map((h) => h.keys)).toEqual(['1–4', 'E', 'Strg K']);
    expect(hintItems('iso', true).map((h) => h.keys)).toEqual(['F', 'C', 'H', 'Esc']);
    expect(hintItems('walk', false)).toEqual([]);
  });
});

describe('ui.timeline: time and track', () => {
  it('maps the clock hour to a share of the 24 h track and back', () => {
    expect(hourToShare(0)).toBe(0);
    expect(hourToShare(12)).toBe(0.5);
    expect(hourToShare(30)).toBe(1);
    expect(shareToHour(0.25)).toBe(6);
    expect(shareToHour(-1)).toBe(0);
  });

  it('cycleOfHour inverts hourOf', () => {
    for (const h of [0, 3, 5, 6.5, 8, 11, 12.5, 17.5, 18, 21, 23.9, 24]) expect(hourOf(cycleOfHour(h))).toBeCloseTo(h, 6);
  });

  it('daylight: dark at night, full at noon, rising at dawn, falling at dusk', () => {
    expect(daylightOf(2)).toBe(0);
    expect(daylightOf(12)).toBe(1);
    expect(daylightOf(23)).toBe(0);
    expect(daylightOf(6.5)).toBeGreaterThan(0);
    expect(daylightOf(6.5)).toBeLessThan(1);
    expect(daylightOf(19)).toBeLessThan(daylightOf(17));
  });
});
