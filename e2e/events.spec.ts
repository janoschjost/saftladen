import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

/**
 * `?event=<id>` runs a dev-panel event at start, so a dev can open a feature directly (the `url:` in FEATURES.md).
 * Each case opens the same event as that URL and waits until it has started. How it plays out is the simulation's
 * business (walking there takes long in software WebGL), not this param's.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: [string, string, (g: any) => unknown][] = [
  ['place.meeting', 'meeting-room', (g) => g.meetingRoom.current],
  ['place.coffee-break', 'coffee', (g) => g.kitchen.current],
  ['place.booth', 'phone-booth', (g) => g.phoneBooth.current],
  ['place.pod', 'pod', (g) => g.pod.current],
  ['place.printer', 'printer', (g) => g.people.some((p: { printJob?: unknown }) => p.printJob)],
  ['place.foosball', 'foosball', (g) => g.people.filter((p: { foosJob?: unknown }) => p.foosJob).length === 2],
];

for (const [id, event, reached] of cases) {
  test(`${id} (?event=${event})`, async ({ page }) => {
    const errors = await openGame(page, '', undefined, `event=${event}`);
    await until(page, reached, undefined, 30_000);
    expect(errors).toEqual([]);
  });
}

test('dev.event: unknown id only warns, the game starts normally', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  const errors = await openGame(page, '', undefined, 'event=nope');
  expect(warnings.some((w) => w.includes('no event "nope"'))).toBe(true);
  expect(await read(page, (g) => g.people.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
