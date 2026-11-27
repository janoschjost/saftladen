import { boot, expect, openGame, read, test } from './game';

/** The card is off by default (#319); `welcome=1` opts this spec in, as a first-time visitor. */
const FIRST_VISIT = '/?test&welcome=1&seed=1&time=11';

test.describe('ui.welcome', () => {
  test('first visit: card with a GL greeter, game held, dismissed with the button, remembered', async ({ page }) => {
    const errors = await boot(page, FIRST_VISIT);
    const card = page.locator('#welcome');
    await expect(card).toBeVisible();
    await expect(page.locator('#welcome-portrait')).toHaveAttribute('src', /team\/.+\.jpg$/);
    await expect(page.locator('#welcome-bubble')).toContainText('Geschäftsleitung');
    await expect(page.locator('#welcome-bullets li')).toHaveCount(3);
    expect(await read(page, (g) => g.paused)).toBe(true);
    await page.locator('#welcome-start').click();
    await expect(card).toBeHidden();
    expect(await read(page, (g) => g.paused)).toBe(false);
    // returning visitor: no card
    await boot(page, FIRST_VISIT);
    await expect(card).toBeHidden();
    expect(errors).toEqual([]);
  });

  for (const key of ['Enter', 'Escape']) {
    test(`${key} dismisses it and does not reach the game`, async ({ page }) => {
      await boot(page, FIRST_VISIT);
      await expect(page.locator('#welcome')).toBeVisible();
      await page.keyboard.press('3'); // plan view key: swallowed while the card is up
      expect(await read(page, (g) => g.views.mode)).toBe('orbit');
      await page.keyboard.press(key);
      await expect(page.locator('#welcome')).toBeHidden();
      expect(await read(page, (g) => g.paused)).toBe(false);
    });
  }

  test('replay: the Hilfe link in the settings and #welcome, even when seen', async ({ page }) => {
    await boot(page, FIRST_VISIT);
    await page.keyboard.press('Enter');
    await expect(page.locator('#welcome')).toBeHidden();
    await page.locator('#open-settings').click();
    await page.locator('#open-welcome').dispatchEvent('click'); // its link in the settings popover is hidden for now
    await expect(page.locator('#settings')).toBeHidden();
    await expect(page.locator('#welcome')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#welcome')).toBeHidden();
    // a fresh load on #welcome (seen by now)
    await boot(page, '/?test&seed=1&time=11#welcome');
    await expect(page.locator('#welcome')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#welcome')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('plain ?test never shows it', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('#welcome')).toBeHidden();
    expect(await read(page, (g) => g.paused)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('fits a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await boot(page, FIRST_VISIT);
    await expect(page.locator('#welcome-start')).toBeInViewport();
    await expect(page.locator('#welcome-bubble')).toBeInViewport();
  });
});
