import { expect, openGame, read, test, until } from './game';

test('weather.snow: ?event=snow snows and the porch turns white, with Weihnachten mode off', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=snow');
  await until(page, (g) => g.sim.weather.snowing && g.sim.weather.snow > 0.9);
  expect(await read(page, (g) => g.sim.weather.raining)).toBe(false);
  await until(page, (g) => g.sim.weather.cover > 0.3, undefined, 60_000);
  expect(errors).toEqual([]);
});

test('weather.snow: the Schnee and Gewitter chips force it; Trocken ends it', async ({ page }) => {
  const errors = await openGame(page);
  await page.locator('#open-env').click();
  const chip = (value: string) => page.locator(`#env label:has(input[name="setting-weather"][value="${value}"])`);
  await chip('snow').click();
  expect(await read(page, (g) => g.sim.weather.mode)).toBe('snow');
  await until(page, (g) => g.sim.weather.snowing);
  await chip('storm').click();
  await until(page, (g) => g.sim.weather.stormy && g.sim.weather.raining && !g.sim.weather.snowing);
  await chip('sun').click();
  await until(page, (g) => !g.sim.weather.foul);
  expect(errors).toEqual([]);
});

test('weather.storm: ?event=storm rains and flashes: lightning, then thunder', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=storm');
  await until(page, (g) => g.sim.weather.stormy && g.sim.weather.raining && g.sim.weather.storm > 0.9);
  await until(page, (g) => g.sim.weather.strikes >= 1, undefined, 60_000);
  expect(errors).toEqual([]);
});

test('weather.season: the Jahreszeit chips set the season of the weather, remembered; a dev event picks one too', async ({ page }) => {
  const errors = await openGame(page);
  await page.locator('#open-env').click();
  await page.locator('#env label:has(input[name="setting-season"][value="winter"])').click();
  expect(await read(page, (g) => g.sim.weather.season)).toBe('winter');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('saftladen.settings') ?? '{}'));
  expect(saved).toMatchObject({ season: 'winter' });
  await page.evaluate(() => window.dev.trigger('season-summer'));
  await until(page, (g) => g.sim.weather.season === 'summer');
  await expect(page.locator('#env input[name="setting-season"][value="summer"]')).toBeChecked();
  expect(errors).toEqual([]);
});

test('hud.environment: the Auto chips of weather and season show an icon of their row (random), every chip names itself on hover', async ({ page }) => {
  const errors = await openGame(page);
  await page.locator('#open-env').click();
  const weather = page.locator('#env label[data-cycle^="weather"]');
  const season = page.locator('#env label[data-cycle^="calendar"]');
  expect(['weather', 'day', 'rain', 'snow', 'storm']).toContain(await weather.getAttribute('data-icon'));
  expect(['calendar', 'spring', 'summer', 'autumn', 'winter']).toContain(await season.getAttribute('data-icon'));
  await expect(weather.locator('svg')).toHaveCount(1);
  const chips = page.locator('#env label.m-settings__segment[data-label]');
  await expect(chips).toHaveCount(10);
  await page.locator('#env label[data-label="Gewitter"]').hover();
  const label = await page.locator('#env label[data-label="Gewitter"]').evaluate((el) => getComputedStyle(el, '::after').content);
  expect(label).toBe('"Gewitter"');
  expect(errors).toEqual([]);
});
