import { boot, expect, openGame, read, test, until } from './game';

test('show.play: ?show starts the film: HUD away, letterbox bars up, the first scene runs', async ({ page }) => {
  const errors = await boot(page, '/?test&seed=1&show=coffee');
  await expect(page.locator('body')).toHaveClass(/is-show/);
  await expect(page.locator('#show')).toBeVisible();
  await expect(page.locator('.l-hud')).toBeHidden();
  expect(await read(page, (g) => g.show?.id)).toBe('coffee');
  // the subtitle comes a second in, and goes
  await read(page, (g) => g.advance(1.5));
  await expect(page.locator('#show-sub')).toHaveText('Ohne Kaffee kein Konzept.');
  await expect(page.locator('.m-show__plate')).toHaveCount(3);
  await until(page, (g) => g.show?.id === 'printer', undefined, 30_000); // the next scene follows by itself
  expect(errors).toEqual([]);
});

test('show.script: the film plays from the first scene to the end without an error', async ({ page }) => {
  test.slow(); // ~250 game seconds, a frame per half second
  const errors = await boot(page, '/?test&seed=1&show');
  expect(await read(page, (g) => g.show?.id)).toBe('night');
  await until(page, (g) => g.show?.finished, undefined, 320_000);
  expect(errors).toEqual([]);
});

test('show.keys: P in the game starts the film on a fresh page, the other params stay', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/seed=1.*[?&]show$/);
});
