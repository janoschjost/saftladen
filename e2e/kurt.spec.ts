import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

const ID = 'marco-rieser';
/** Standing up and the 1 s spin: seconds of game time, but CI renders in software. Nothing here waits for the walk to the door. */
const SLOW = 60_000;

/** Runs a dev event until it goes through. */
async function trigger(page: import('@playwright/test').Page, id: string): Promise<void> {
  await until(page, (_g, ev) => !String((window as any).dev.trigger(ev)).endsWith('nicht möglich'), id, SLOW);
}

// Turning back into Marco behind the door and coming back as Marco: src/game/Person.test.ts (the walk out takes minutes on CI)
test('kurt.behavior: going home, Marco spins into Kurt: skin, name and name label', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('n'); // name labels on
  await trigger(page, 'kurt-walkout');
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return p.presence === 'leaving' && p.alter && p.displayName === 'Kurt' && p.rig.skin.every((s: any) => !s.visible);
  }, ID, SLOW);
  await until(page, () => [...document.querySelectorAll('.m-label')].some((el) => el.textContent === 'Kurt'), undefined, SLOW);
  expect(errors).toEqual([]);
});

test('kurt.home: Kurt in the home office feed and the roster, under his own name; no Kurt on the office monitor then', async ({ page }) => {
  const errors = await openGame(page);
  await trigger(page, 'kurt-home');
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    const home = g.homes[p.homeVariant];
    return p.presence === 'out' && p.awayKind === 'home' && p.displayName === 'Kurt' && home?.alter && home.occupantId === id;
  }, ID, SLOW);
  await expect(page.locator('.m-feed__name', { hasText: 'Kurt' })).toBeVisible();
  await until(page, () => [...document.querySelectorAll('.m-away__name')].some((el) => el.textContent === 'Kurt'), undefined, SLOW);
  expect(await read(page, (g, id) => g.kurtScreens.has(g.people.find((o: any) => o.id === id)), ID)).toBe(false);
  expect(errors).toEqual([]);
});

test('kurt.screen: Marco out of the office (not home office) at 11:00: his empty desk shows Kurt; home office: it does not', async ({ page }) => {
  const errors = await openGame(page);
  await trigger(page, 'kurt-screen');
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return p.presence === 'out' && p.awayKind === 'errand' && !p.homeDesk.occupant && g.kurtScreens.has(p);
  }, ID, SLOW);
  await trigger(page, 'kurt-home');
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return p.awayKind === 'home' && !g.kurtScreens.has(p);
  }, ID, SLOW);
  expect(errors).toEqual([]);
});
