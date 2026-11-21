import type { Page } from '@playwright/test';
import { expect, openGame, read, scene, test, until } from './game';

const NIGHT = 22;

/** The roster shares the dock with other panels and may start folded. */
async function openRoster(page: Page): Promise<void> {
  const roster = page.locator('#away');
  await expect(roster).toBeVisible();
  if (await roster.evaluate((el) => el.classList.contains('is-collapsed'))) await roster.locator('.m-away__title').click();
}

/**
 * Waits for the roster to show everybody who is not in the office and returns how many rows that is. The game stands
 * still, so this is a wait on the DOM (the roster refreshes every 0.25 s of frames), which follows the browser.
 */
async function rows(page: Page): Promise<number> {
  const listed = await read(page, (g) => g.sim.presence.listed.length);
  await expect.poll(() => page.locator('#away-list li').count()).toBe(listed);
  await expect(page.locator('#away-count')).toHaveText(String(listed));
  return listed;
}

test('presence.roster: at night everybody is a row in "Nicht im Büro", off duty ones as "Zuhause", alphabetical, count badge = rows', async ({ page }) => {
  const errors = await openGame(page, '', NIGHT);
  expect(await rows(page)).toBeGreaterThan(10);
  await openRoster(page);
  const names = await page.locator('#away-list .m-away__name').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  const off = await read(page, (g) => g.sim.presence.listed.filter((p) => p.awayKind === 'off' && p.presence === 'out').length);
  expect(off).toBeGreaterThan(0);
  const status = await page.locator('#away-list .m-away__status').allTextContents();
  expect(status.filter((s) => s === 'Zuhause')).toHaveLength(off);
  expect(await page.locator('#people-empty').isHidden()).toBe(true);
  expect(errors).toEqual([]);
});

test('presence.roster: the back button of an off duty row brings them in through the door and they stay; rows come and go live without rebuilding the others', async ({ page }) => {
  const errors = await openGame(page, '', NIGHT);
  await rows(page);
  await openRoster(page);
  // two off duty people whose first name is theirs alone
  const [who, other] = await read(page, (g) => {
    const all = g.sim.presence.listed;
    const first = (name: string) => name.split(' ')[0];
    return all
      .filter((p) => p.awayKind === 'off' && p.presence === 'out' && all.filter((o) => first(o.displayName) === first(p.displayName)).length === 1)
      .slice(0, 2)
      .map((p) => ({ id: p.id, name: first(p.displayName) }));
  });
  // a mark on the rows that stay: a rebuilt row would lose it
  await page.locator('#away-list li').evaluateAll((els) => els.forEach((el) => el.setAttribute('data-mark', '1')));
  await page.getByRole('button', { name: `${who.name} zurückholen` }).click();
  const row = (name: string) => page.locator('#away-list li', { has: page.getByRole('button', { name: `${name} zurückholen` }) });
  await until(page, (g, id) => g.sim.person(id).presence === 'in', who.id, 120_000);
  // their row is gone, the one of the other stays the very same element (people come and go meanwhile, the list follows)
  await rows(page);
  await expect(row(who.name)).toHaveCount(0);
  await expect(row(other.name)).toHaveAttribute('data-mark', '1');
  // and they stay in, not sent off again
  await read(page, (g) => g.advance(120));
  expect(await read(page, (g, id) => g.sim.person(id).presence, who.id)).toBe('in');
  // somebody leaves for the home office: a new row, in its place in the alphabet
  await scene(page, (s, id) => s.put(id, 'home'), who.id);
  await rows(page);
  await expect(row(who.name)).not.toHaveAttribute('data-mark', '1');
  await expect(row(other.name)).toHaveAttribute('data-mark', '1');
  const names = await page.locator('#away-list .m-away__name').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'de')));
  expect(errors).toEqual([]);
});

test('hud.people: a long list scrolls inside the dock and does not push it off the screen', async ({ page }) => {
  const errors = await openGame(page, '', NIGHT);
  await rows(page);
  await openRoster(page);
  const list = page.locator('#away-list');
  const box = async () => (await list.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight, top: el.scrollTop })));
  const before = await box();
  expect(before.scroll).toBeGreaterThan(before.client);
  await list.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect((await box()).top).toBeGreaterThan(0);
  const dock = (await page.locator('#people').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(dock.y).toBeGreaterThanOrEqual(0);
  expect(dock.y + dock.height).toBeLessThanOrEqual(viewport.height);
  expect(errors).toEqual([]);
});

test('hud.people: "Alle sind im Büro." shows only when everybody is in the office; nobody in does not say it', async ({ page }) => {
  const errors = await openGame(page, '', NIGHT);
  await rows(page);
  await expect(page.locator('#people-empty')).toBeHidden();
  // everybody in: at a desk while there is one for them (earlier ones may take it), else standing on the floor
  const ids = await read(page, (g) => g.sim.people.map((p) => p.id));
  await scene(
    page,
    (s, all) => {
      for (const id of all) {
        try {
          s.put(id, 'desk');
        } catch {
          s.put(id, { x: 0, z: 0 });
        }
      }
    },
    ids,
  );
  expect(await rows(page)).toBe(0);
  await expect(page.locator('#away')).toBeHidden();
  await expect(page.locator('#people-empty')).toHaveText('Alle sind im Büro.');
  expect(errors).toEqual([]);
});
