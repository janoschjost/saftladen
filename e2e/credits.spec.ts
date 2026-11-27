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

test('ui.ideamail: the Idee senden link in the settings is a mailto to both devs with subject and the current game URL in the body', async ({ page }) => {
  await openGame(page);
  await page.locator('#open-settings').click();
  const link = page.locator('#idea-link');
  await expect(link).toContainText('Idee senden');
  // stop the mail client from opening, read where the click would have gone
  await link.evaluate((a) => a.addEventListener('click', (e) => e.preventDefault()));
  await link.click();
  // the popover makes room, like after the other links
  await expect(page.locator('#settings')).toBeHidden();
  const href = (await link.getAttribute('href')) ?? '';
  expect(href.startsWith('mailto:marco.rieser@vitamin2.ch,janosch.jost@vitamin2.ch?')).toBe(true);
  const q = new URLSearchParams(href.split('?')[1]);
  expect(q.get('subject')).toBe('Saftladen: Idee / Feature-Wunsch');
  expect(q.get('body')).toContain('Worum geht es?');
  expect(q.get('body')).toContain(page.url());
});
