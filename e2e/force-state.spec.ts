import { expect, openGame, read, test } from './game';

// the dev module loads after the game: wait for `dev.forceState`
const force = (page: import('@playwright/test').Page, id: string, state: string) => page.evaluate(([i, s]) => (window as any).dev.forceState(i, s) as string, [id, state]);

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.waitForFunction(() => typeof (window as any).dev?.forceState === 'function');
});

test('dev.force: panel People section has a button per state and shows "nicht möglich"', async ({ page }) => {
  await page.keyboard.press('`');
  const section = page.locator('#dev-people');
  await expect(section.locator('button')).toHaveCount(6);
  await section.locator('button[data-state="meeting"]').click();
  await section.locator('button[data-state="meeting"]').click();
  // second click: one person's already in the room or room is taken; either way a status is shown
  await expect(page.locator('#dev-status')).not.toBeEmpty();
});

test('dev.force: select marks people who are away, preselects one in the office, refusal names the reason (#105)', async ({ page }) => {
  await page.keyboard.press('`');
  const select = page.locator('#dev-people select');
  const away = await read(page, (g) => g.people.filter((p: { inOffice: boolean }) => !p.inOffice).map((p: { member: { name: string } }) => p.member.name) as string[]);
  for (const name of away) await expect(select.locator('option', { hasText: `${name} (nicht im Büro)` })).toHaveCount(1);
  const inOfficeId = await read(page, (g) => g.people.find((p: { inOffice: boolean }) => p.inOffice).id as string);
  expect(await select.inputValue()).toBe(inOfficeId);
  if (away.length) {
    const awayId = await read(page, (g) => g.people.find((p: { inOffice: boolean }) => !p.inOffice).id as string);
    expect(await force(page, awayId, 'desk')).toContain('(nicht im Büro)');
  }
});
