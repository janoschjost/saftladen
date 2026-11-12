import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

const ID = 'marco-rieser';

// Marco may have to walk back in first, and the walk to the door takes a while when the suite renders in software
test.describe.configure({ timeout: 240_000 });

/** Runs a dev event until it goes through (Marco may first have to come back in). */
async function trigger(page: import('@playwright/test').Page, id: string): Promise<void> {
  await until(page, (_g, ev) => !String((window as any).dev.trigger(ev)).endsWith('nicht möglich'), id, 90_000);
}

test('kurt.behavior: Marco spins into Kurt, walks out as Kurt, is Marco again outside; his desk shows Kurt', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('n'); // name labels on
  await trigger(page, 'kurt-walkout');
  // on the way to the door he is Kurt: name, name label and skin
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return p.presence === 'leaving' && p.alter && p.displayName === 'Kurt' && p.rig.skin.every((s: any) => !s.visible);
  }, ID);
  await until(page, () => [...document.querySelectorAll('.m-label')].some((el) => el.textContent === 'Kurt'));
  // through the door: Marco again
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return p.presence === 'out' && !p.alter && p.displayName === 'Marco Rieser';
  }, ID, 90_000);
  // 11:00, nobody at his desk: the monitor shows Kurt
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    return g.kurtScreens.has(p) && !p.homeDesk.occupant;
  }, ID);
  expect(errors).toEqual([]);
});

test('kurt.home: Kurt in the home office feed, under his own name; no Kurt on the office monitor then', async ({ page }) => {
  const errors = await openGame(page);
  await trigger(page, 'kurt-home');
  // on the way out he is Kurt in the "not in the office" list as well
  await until(page, () => [...document.querySelectorAll('.m-away__name')].some((el) => el.textContent === 'Kurt'));
  await until(page, (g, id) => {
    const p = g.people.find((o: any) => o.id === id);
    const home = g.homes[p.homeVariant];
    return p.presence === 'out' && p.awayKind === 'home' && p.displayName === 'Kurt' && home?.alter && home.occupantId === id;
  }, ID, 90_000);
  await expect(page.locator('.m-feed__name', { hasText: 'Kurt' })).toBeVisible();
  expect(await read(page, (g, id) => g.kurtScreens.has(g.people.find((o: any) => o.id === id)), ID)).toBe(false);
  expect(errors).toEqual([]);
});
