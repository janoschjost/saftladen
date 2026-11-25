import type { Page } from '@playwright/test';
import { boot, expect, read, test } from './game';

/** A feature URL as a dev opens it: no `?test`, so `?seed` starts like a fresh profile. `#homes` sends people to their home offices. */
const URL = '/?seed=3&time=11#homes';

/** What a dev may have saved on the port: a moved divider, a weekday and time of day, seats, a home room, forced rain. */
const SAVED: Record<string, string> = {
  'saftladen.welcome': '1',
  'saftladen.layout': JSON.stringify({ 'group@7.1,6.1': { dz: 0.25 } }),
  'saftladen.state': JSON.stringify({ weekday: 4, cycle: 0.1 }),
  'saftladen.seats': JSON.stringify({ 'donata-manser': 17, 'marco-rieser': 22 }),
  'saftladen.homes': JSON.stringify({ 'donata-manser': 3 }),
  'saftladen.settings': JSON.stringify({ weather: 'rain' }),
};

/** Everything of the start the saved state above could change. */
const world = (page: Page) =>
  read(page, (g) => ({
    weekday: g.sim.tod.weekday,
    clock: g.sim.tod.clock,
    weather: g.sim.weather.mode,
    divider: g.sim.model.items.find((i) => i.id === 'group@7.1,6.1')!.dz,
    seats: g.sim.people.map((p) => `${p.id}:${p.homeDesk?.number}`).join(),
    homes: g.sim.people.map((p) => `${p.id}:${p.homeVariant}`).join(),
  }));

const dump = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

test('dev.seed: ?seed starts like a fresh profile, ignores saved state and saves nothing', async ({ page }) => {
  test.slow(); // a feature URL has no `?test`: the office is drawn, in software on the runners, which takes a while to load
  const info: string[] = [];
  page.on('console', (m) => m.type() === 'info' && info.push(m.text()));

  // empty storage: the world the URL stands for (`?test` instead of opening it twice in a drawn office)
  await boot(page, `/?test&${URL.slice(2)}`);
  const fresh = await world(page);

  // with saved state: the same world, the dismissed welcome card stays hidden. Filled on another page of the origin:
  // the game saves its state when it is left.
  await page.goto('/favicon.svg');
  await page.evaluate((saved) => {
    localStorage.clear();
    for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
  }, SAVED);
  const errors = await boot(page, URL);
  expect(await world(page)).toEqual(fresh);
  await expect(page.locator('#welcome')).toBeHidden();
  expect(info).toContain('[debug] ?seed: saved state ignored, nothing is saved this session');

  // edits work for the session only: nothing reaches the storage
  await page.locator('#open-env').click();
  await page.locator('#env label:has(input[value="sun"])').click();
  expect(await read(page, (g) => g.sim.weather.mode)).toBe('sun');
  await page.locator('#clock-slower').click(); // 1x -> pause
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
  await page.goto('/favicon.svg'); // leaving the page saves the session (pagehide)
  expect(await dump(page)).toEqual(SAVED);

  // the saved state does change the world when it is read (`?test` keeps the storage): the check above means something
  await boot(page, `/?test&${URL.slice(2)}`);
  const saved = await world(page);
  for (const key of ['weekday', 'weather', 'divider', 'seats', 'homes'] as const) expect(saved[key], key).not.toEqual(fresh[key]);
  expect(saved.clock).toBe(fresh.clock); // ?time still sets the hour
});
