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
  // somebody who is not part of the running meeting (the group is picked at random)
  const other = await read(page, (g) => g.people.find((p: { inOffice: boolean; talk: unknown }) => p.inOffice && !g.meetingRoom.current.members.includes(p)).id as string);
  expect(await force(page, other, 'meeting')).toContain('nicht möglich');
  expect(await read(page, (g, pid) => g.meetingRoom.current.members.some((p: { id: string }) => p.id === pid), other)).toBe(false);
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
  // the game ran on meanwhile: pick somebody who is still there, empty the kitchen and force the break in one go
  const pause = await read(
    page,
    (g, taken) => {
      const dev = (window as any).dev; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (g.kitchen.current) dev.trigger('coffee-end');
      for (const p of g.people) p.cancelCoffee();
      const who = g.people.find((p: any) => p.inOffice && !p.held && !p.controlled && !taken.includes(p.id)); // eslint-disable-line @typescript-eslint/no-explicit-any
      return { id: who.id as string, status: dev.forceState(who.id, 'break') as string };
    },
    [ids[0], ids[1]],
  );
  expect(pause.status).toContain('Pause');
  await until(page, (g, id) => g.kitchen.current?.members?.some((p: { id: string }) => p.id === id) ?? !!g.kitchen.current, pause.id);
  // away person: nothing possible
  expect(await force(page, ids[1], 'desk')).toContain('nicht möglich');
});

test('dev.force: wc sends a person to a free cabin, nicht möglich when both are taken', async ({ page }) => {
  const ids = await read(page, (g) => g.people.filter((p: { inOffice: boolean }) => p.inOffice).map((p: { id: string }) => p.id) as string[]);
  expect(await force(page, ids[0], 'wc')).toContain('WC');
  expect(await force(page, ids[1], 'wc')).toContain('WC');
  await until(page, (g) => g.toilets.cabins.every((c: { session: unknown }) => c.session));
  // both cabins taken: no queue, nothing changes
  expect(await force(page, ids[2], 'wc')).toContain('nicht möglich');
  expect(await read(page, (g) => g.toilets.queue.length)).toBe(0);
  // the one already in a cabin cannot be sent again
  expect(await force(page, ids[0], 'wc')).toContain('nicht möglich');
});
