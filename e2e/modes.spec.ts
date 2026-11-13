import { expect, openGame, read, test, until } from './game';

test('egg.konami', async ({ page }) => {
  await openGame(page);
  expect(await read(page, (g) => g.easter.discoOn)).toBe(false);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) {
    await page.keyboard.press(key);
  }
  expect(await read(page, (g) => g.easter.discoOn)).toBe(true);
  // the disco fades in: people dance, lights come up
  await until(page, (g) => g.easter.disco > 0.5);
});

test('day.menu + day.flow: play a day as Jan', async ({ page }) => {
  await openGame(page);
  await page.locator('#open-settings').click();
  await page.locator('#open-day').click();
  await expect(page.locator('#day-menu')).toBeVisible();
  await expect(page.locator('#day-menu-name')).toHaveText('Jan Hasler');
  await page.locator('#day-menu-start').click();
  await expect(page.locator('#day-menu')).toBeHidden();
  await expect(page.locator('#day-hud')).toBeVisible();
  await expect(page.locator('#day-hud-name')).toHaveText('Jan Hasler');
  expect(await read(page, (g) => g.day?.person.id)).toBe('jan-hasler');

  // Jan comes in (if he was away), then the camera moves behind him
  await until(page, (g) => g.day?.state === 'playing', undefined, 45_000);
  expect(await read(page, (g) => g.views.mode)).toBe('third');

  // Esc leaves the day and restores the previous view
  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.day)).toBeNull();
  await expect(page.locator('#day-hud')).toBeHidden();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
});

test('xmas.mode', async ({ page }) => {
  await openGame(page);
  const start = await read(page, (g) => g.xmas.on);
  expect(start).toBe(false); // the tests run on a day in June (e2e/game.ts)
  await page.locator('#open-env').click();
  const toggle = page.locator('#setting-xmas');
  await expect(toggle).toBeVisible();

  await toggle.setChecked(!start);
  expect(await read(page, (g) => g.xmas.on)).toBe(!start);
  await toggle.setChecked(true);
  // snow fades in, decorations show
  await until(page, (g) => g.xmas.on && g.xmas.amount > 0.5 && g.xmas.decor.group.visible);
  await toggle.setChecked(false);
  // snow starts fading out
  const full = await read(page, (g) => g.xmas.amount);
  expect(await read(page, (g) => g.xmas.on)).toBe(false);
  await until(page, (g, a) => g.xmas.amount < a * 0.8, full, 60_000);
});
