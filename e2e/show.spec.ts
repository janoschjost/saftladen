import { boot, expect, openGame, read, test, until } from './game';

test('show.play: ?show starts the film: HUD away, letterbox bars up, the first scene runs', async ({ page }) => {
  const errors = await boot(page, '/?test&seed=1&show=coffee');
  await expect(page.locator('body')).toHaveClass(/is-show/);
  await expect(page.locator('#show')).toBeVisible();
  await expect(page.locator('.l-hud')).toBeHidden();
  expect(await read(page, (g) => g.show?.chapter)).toBe('coffee');
  // the subtitle comes a few seconds in, with a plate for each of the people it is about
  await read(page, (g) => g.advance(3.5));
  await expect(page.locator('#show-sub')).toHaveText('Ohne Kaffee kein Konzept.');
  await expect(page.locator('.m-show__plate')).toHaveCount(3);
  await until(page, (g) => g.show?.chapter === 'printer', undefined, 30_000); // the next chapter follows by itself, no cut
  expect(errors).toEqual([]);
});

test('show.script: the film plays from the first second to the end without an error, with no room or table label in sight', async ({ page }) => {
  test.slow(); // ~300 game seconds, a frame per half second
  const errors = await boot(page, '/?test&seed=1&show');
  expect(await read(page, (g) => g.show?.chapter)).toBe('night');
  expect(await read(page, (g) => [g.sim.model.rowLabels.visible, g.sim.model.roomLabels.visible])).toEqual([false, false]);
  await until(page, (g) => g.show?.finished, undefined, 320_000);
  expect(errors).toEqual([]);
});

test('show.keys: P in the game starts the film on a fresh page, the other params stay', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/seed=1.*[?&]show$/);
});

test('show.debug: ?show&debug adds a strip to test the film: a button per chapter seeks, the speed buttons speed it up', async ({ page }) => {
  await boot(page, '/?test&seed=1&show&debug');
  await expect(page.locator('.m-show-debug')).toBeVisible();
  await page.locator('.m-show-debug__chapters button', { hasText: 'meeting' }).click();
  expect(await read(page, (g) => g.show?.chapter)).toBe('meeting');
  await page.locator('.m-show-debug__row button', { hasText: '8×' }).click();
  expect(await read(page, (g) => g.timeScale)).toBe(8);
  await page.locator('.m-show-debug__row button').first().click(); // pause
  expect(await read(page, (g) => g.timeScale)).toBe(0);
});
