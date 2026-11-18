import { expect, openGame, test } from './game';

test('credits.page: /credits shows the 3D scene and the credits, and links back to the game', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/credits');
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('.m-credits__lead')).toContainText('Marco Rieser & Janosch Jost');
  await expect(page.locator('.m-credits__back')).toHaveAttribute('href', '../');
  expect(errors).toEqual([]);
});

test('credits.link: the Credits link in the game opens the credits page', async ({ page }) => {
  await openGame(page);
  const link = page.locator('.m-credits-link__button');
  await expect(link).toContainText('Credits');
  await link.click();
  await expect(page).toHaveURL(/\/credits\/$/);
  await expect(page.locator('.m-credits__title')).toHaveText('Credits');
});
