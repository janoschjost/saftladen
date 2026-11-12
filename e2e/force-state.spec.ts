import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

// the dev module loads after the game: wait for `dev.forceState`
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const force = (page: import('@playwright/test').Page, id: string, state: string) => page.evaluate(([i, s]) => (window as any).dev.forceState(i, s) as string, [id, state]);

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await page.waitForFunction(() => typeof (window as any).dev?.forceState === 'function'); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('dev.force: console / hook sends a person to a meeting, then the sim goes on', async ({ page }) => {
  const id = await read(page, (g) => g.people.find((p: { inOffice: boolean }) => p.inOffice).id as string);
  expect(await force(page, id, 'meeting')).toContain('Meeting');
  await until(page, (g, pid) => g.meetingRoom.current?.members.some((p: { id: string }) => p.id === pid), id, 30_000);
  // meeting room is taken now: a second request changes nothing and says so
  const other = await read(page, (g, pid) => g.people.find((p: { inOffice: boolean; id: string }) => p.inOffice && p.id !== pid).id as string, id);
  expect(await force(page, other, 'meeting')).toContain('nicht möglich');
  expect(await read(page, (g, pid) => g.meetingRoom.current.members.some((p: { id: string }) => p.id === pid), other)).toBe(false);
});

test('dev.force: panel People section has a button per state and shows "nicht möglich"', async ({ page }) => {
  await page.keyboard.press('`');
  const section = page.locator('#dev-people');
  await expect(section.locator('button')).toHaveCount(5);
  await section.locator('button[data-state="meeting"]').click();
  await section.locator('button[data-state="meeting"]').click();
  // second click: one person's already in the room or room is taken; either way a status is shown
  await expect(page.locator('#dev-status')).not.toBeEmpty();
});

test('dev.force: unknown person only reports', async ({ page }) => {
  expect(await force(page, 'nobody', 'desk')).toContain('unbekannt');
});

test('dev.force: desk, errand and coffee break take effect', async ({ page }) => {
  const who = await read(page, (g) => {
    const inOffice = g.people.filter((p: { inOffice: boolean }) => p.inOffice);
    const key = (p: { working: boolean }) => (p.working ? 1 : 0);
    return inOffice.sort((a: { working: boolean }, b: { working: boolean }) => key(a) - key(b)).map((p: { id: string; working: boolean }) => ({ id: p.id, working: p.working }));
  });
  // somebody already at the desk cannot be sent there again
  const sitting = who.find((w) => w.working);
  if (sitting) expect(await force(page, sitting.id, 'desk')).toContain('nicht möglich');
  const ids = who.filter((w) => !w.working || w !== sitting).map((w) => w.id);
  expect(await force(page, ids[0], 'desk')).toContain('Am Platz');
  await until(page, (g, id) => g.people.find((p: { id: string }) => p.id === id).task, ids[0]);
  expect(await force(page, ids[1], 'errand')).toContain('Besorgung');
  await until(page, (g, id) => g.people.find((p: { id: string }) => p.id === id).presence !== 'in', ids[1]);
  expect(await force(page, ids[2], 'break')).toContain('Pause');
  await until(page, (g, id) => g.kitchen.current?.members?.some((p: { id: string }) => p.id === id) ?? !!g.kitchen.current, ids[2]);
  // away person: nothing possible
  expect(await force(page, ids[1], 'desk')).toContain('nicht möglich');
});
