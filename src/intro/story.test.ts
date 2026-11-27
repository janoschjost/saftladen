import { describe, expect, it } from 'vitest';
import { strings } from '../i18n/strings';
import { blueprintLevel, cloudsAt, CLOUDS, during, FADE, HOLD, lineAt, PUSH, stageAt, SUMMON_LINE, timeline } from './story';

const lines = strings.intro.lines;
const tl = timeline(lines);

describe('intro.story', () => {
  it('intro.story: nine sentence pairs, German and English, and the summoning is the Claudius sentence', () => {
    expect(lines).toHaveLength(9);
    for (const l of lines) expect(l.de.length * l.en.length).toBeGreaterThan(0);
    expect(lines[SUMMON_LINE].de).toContain('Claudius');
    expect(lines[SUMMON_LINE].en).toContain('Claudius');
  });

  it('intro.story: the sentences appear in order, a longer one stays longer, the last one until the end', () => {
    expect(lineAt(tl, 0)).toBe(-1);
    tl.starts.forEach((s, i) => {
      expect(lineAt(tl, s + 0.01)).toBe(i);
      if (i) expect(s).toBeGreaterThan(tl.starts[i - 1]);
    });
    expect(tl.starts[4] - tl.starts[3]).toBeGreaterThan(tl.starts[1] - tl.starts[0]); // the DACHCOM sentence against "Es waren einmal …"
    expect(lineAt(tl, tl.end)).toBe(lines.length - 1);
    expect(tl.end).toBeLessThan(90);
  });

  it('intro.story: after the last sentence the camera moves in, clouds close over the scene, stay white, then part over the office', () => {
    expect(tl.push).toBeGreaterThan(tl.starts[lines.length - 1]);
    expect(tl.fade).toBeCloseTo(tl.push + PUSH);
    expect(tl.clear).toBeCloseTo(tl.fade + HOLD);
    expect(tl.end).toBeCloseTo(tl.clear + FADE);
    expect(cloudsAt(tl, tl.fade - CLOUDS)).toEqual({ closed: 0, parted: 0 }); // no cloud while the story is told
    expect(cloudsAt(tl, tl.fade)).toEqual({ closed: 1, parted: 0 });
    expect(cloudsAt(tl, tl.clear)).toEqual({ closed: 1, parted: 0 }); // still white when the game takes over
    expect(cloudsAt(tl, tl.end)).toEqual({ closed: 1, parted: 1 });
  });

  it('intro.story: no Clawd and no blueprint before the summoning, both from then on, the blueprint complete before the fade', () => {
    const before = stageAt(tl, tl.summon - 0.01);
    expect(before).toMatchObject({ clawd: false, built: 0, pad: 0, puff: 0 });
    const puffing = stageAt(tl, tl.summon + 0.7);
    expect(puffing.clawd).toBe(true);
    expect(puffing.puff).toBeGreaterThan(0);
    expect(puffing.puff).toBeLessThan(1);
    expect(stageAt(tl, tl.summon + 2).puff).toBe(1); // the fog is gone
    expect(blueprintLevel(tl, tl.summon + 5)).toBeGreaterThan(0);
    expect(blueprintLevel(tl, tl.summon + 5)).toBeLessThan(1);
    expect(stageAt(tl, tl.fade)).toMatchObject({ clawd: true, built: 1, pad: 1 });
  });

  it('intro.story: each bit of acting belongs to its sentence', () => {
    const mid = (i: number) => (tl.starts[i] + (tl.starts[i + 1] ?? tl.push)) / 2;
    expect(stageAt(tl, mid(3))).toMatchObject({ slump: 1, wizard: 0, oath: 0 });
    expect(stageAt(tl, mid(4))).toMatchObject({ slump: 0, wizard: 1, sparks: 0 });
    expect(stageAt(tl, mid(5))).toMatchObject({ wizard: 0, sparks: 1 });
    expect(stageAt(tl, mid(6))).toMatchObject({ sparks: 0, oath: 1 });
    expect(stageAt(tl, mid(8))).toMatchObject({ slump: 0, wizard: 0, sparks: 0, oath: 0 });
    expect(during(tl, tl.starts[3], 3)).toBe(0); // fades in
    expect(during(tl, tl.starts[4], 3)).toBe(0); // and out again
  });
});
