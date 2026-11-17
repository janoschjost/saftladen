import { expect, openGame, read, test, until } from './game';

test('presence.smoke: the roster shows "Rauchpause" for a smoker on a break, and its call-back button brings them in (event smoke-sandro-hagen)', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=smoke-sandro-hagen');
  await until(page, (g) => g.sim.person('sandro-hagen').atPorchSpot, undefined, 60_000);
  // the roster shares the dock with other panels and may start collapsed
  const roster = page.locator('#away');
  await expect(roster).toBeVisible();
  if (await roster.evaluate((el) => el.classList.contains('is-collapsed'))) await roster.locator('.m-away__title').click();
  const row = page.locator('#away-list li').filter({ has: page.locator('.m-away__name', { hasText: /^Sandro$/ }) });
  await until(page, () => /Rauchpause · \d+:\d\d/.test(document.querySelector('#away-list')?.textContent ?? ''));
  await expect(row.locator('.m-away__status')).toHaveText(/^Rauchpause · \d+:\d\d$/);
  await row.locator('.m-away__back').click();
  // the cigarette goes out at once, then in through the door
  expect(
    await read(page, (g) => {
      g.advance(0.1);
      return g.sim.person('sandro-hagen').smokeLit;
    }),
  ).toBe(false);
  await until(page, (g) => g.sim.person('sandro-hagen').presence === 'in', undefined, 30_000);
  await expect(row).toHaveCount(0);
  expect(errors).toEqual([]);
});
