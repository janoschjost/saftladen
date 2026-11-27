import { boot, expect, openGame, read, test } from './game';

/** `?test` keeps the intro away from every other spec; `intro=1` opts this one in, as a first-time visitor. */
const FIRST_VISIT = '/?test&intro=1&seed=1&time=11';

test.describe('intro', () => {
  test('intro.once: the first visit plays it with the game held, Esc ends it, a later visit does not play it', async ({ page }) => {
    const errors = await boot(page, FIRST_VISIT);
    const intro = page.locator('#intro');
    await expect(intro).toBeVisible();
    await expect(page.locator('#intro-stage canvas')).toBeVisible();
    expect(await read(page, (g) => g.paused)).toBe(true);
    await page.keyboard.press('3'); // plan view key: swallowed while the intro runs
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');
    await page.keyboard.press('Escape');
    await expect(intro).toBeHidden();
    await expect(page.locator('#intro-stage canvas')).toHaveCount(0);
    expect(await read(page, (g) => g.paused)).toBe(false);
    await boot(page, FIRST_VISIT);
    await expect(intro).toBeHidden();
    expect(await read(page, (g) => g.paused)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('intro.story: the story starts with its first sentence, German with the English line below', async ({ page }) => {
    await boot(page, FIRST_VISIT);
    await expect(page.locator('#intro-de')).toHaveText('Es waren einmal zwei Entwickler.', { timeout: 30_000 }); // after the opening pause, in wall time: the intro is not part of the game's clock
    await expect(page.locator('#intro-en')).toHaveText('Once upon a time, there were two devs.');
    await expect(page.locator('#intro-en')).toHaveCSS('font-style', 'italic');
    await expect(page.locator('#intro-de')).toHaveCSS('font-style', 'normal');
  });

  test('intro.once: the skip button ends it; the link in the settings and #intro replay it, also when seen', async ({ page }) => {
    await boot(page, FIRST_VISIT);
    await page.locator('#intro-skip').click();
    await expect(page.locator('#intro')).toBeHidden();
    await page.locator('#open-settings').click();
    await page.locator('#open-intro').dispatchEvent('click'); // its link in the settings popover is hidden for now
    await expect(page.locator('#intro')).toBeVisible();
    await expect(page.locator('#settings')).toBeHidden({ timeout: 30_000 }); // it closes with an animation, which waits while the scene is built
    expect(await read(page, (g) => g.paused)).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#intro')).toBeHidden();
    // a fresh load on #intro (seen by now)
    await boot(page, '/?test&seed=1&time=11#intro');
    await expect(page.locator('#intro')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#intro')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('intro.greeting: ?rene always plays the intro with René\'s greeting, also when the intro was seen; the marker leaves the address', async ({ page }) => {
    // somebody who has seen the plain intro
    await boot(page, FIRST_VISIT);
    await page.keyboard.press('Escape');
    await expect(page.locator('#intro')).toBeHidden();
    const errors = await boot(page, `${FIRST_VISIT}&rene`);
    await expect(page.locator('#intro')).toBeVisible();
    expect(new URL(page.url()).search).toBe('?test&intro=1&seed=1&time=11');
    // in wall time: the intro is not part of the game's clock
    await expect(page.locator('#intro-bubble')).toHaveText('herzlich willkommen', { timeout: 30_000 });
    await expect(page.locator('#intro-bubble')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#intro-de')).toHaveText(''); // the story waits for him
    await page.keyboard.press('Escape');
    await expect(page.locator('#intro')).toBeHidden();
    await expect(page.locator('#intro-bubble')).toBeHidden();
    expect(await read(page, (g) => g.paused)).toBe(false);
    // a reload of the address as it is now: no marker, the intro was seen
    await boot(page, page.url());
    await expect(page.locator('#intro')).toBeHidden();
    // the link again: he greets again
    await boot(page, `${FIRST_VISIT}&rene`);
    await expect(page.locator('#intro')).toBeVisible();
    await expect(page.locator('#intro-bubble')).toHaveText('herzlich willkommen', { timeout: 30_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#intro')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('intro.greeting: without ?rene nobody greets', async ({ page }) => {
    await boot(page, FIRST_VISIT);
    await expect(page.locator('#intro-de')).toHaveText('Es waren einmal zwei Entwickler.', { timeout: 30_000 });
    await expect(page.locator('#intro-bubble')).toBeHidden();
  });

  test('intro.once: plain ?test never plays it', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('#intro')).toBeHidden();
    expect(await read(page, (g) => g.paused)).toBe(false);
    expect(errors).toEqual([]);
  });
});
