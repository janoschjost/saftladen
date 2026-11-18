import type {} from '../src/credits/hook';
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
  await expect(link).toContainText('Marco & Janosch');
  await link.click();
  await expect(page).toHaveURL(/\/credits\/$/);
  await expect(page.locator('.m-credits__title')).toHaveText('Credits');
});

test('credits.clawd: tapping Clawd pokes him, dragging the scene does not', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/credits');
  const canvas = page.locator('#stage canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.credits?.clawdScreen().x ?? 0)).toBeGreaterThan(0);
  const box = (await canvas.boundingBox())!;
  const where = async () => {
    const at = await page.evaluate(() => window.credits!.clawdScreen());
    return { x: box.x + at.x, y: box.y + at.y };
  };

  // a drag that starts on him orbits the camera and leaves him alone
  const start = await where();
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.credits!.pokes)).toBe(0);

  // a tap on him is a poke
  const now = await where();
  await page.mouse.click(now.x, now.y);
  expect(await page.evaluate(() => window.credits!.pokes)).toBe(1);

  // a tap on the empty floor is not
  await page.mouse.click(box.x + 20, box.y + 20);
  expect(await page.evaluate(() => window.credits!.pokes)).toBe(1);
  expect(errors).toEqual([]);
});
