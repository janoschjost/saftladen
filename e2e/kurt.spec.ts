import type { Page } from '@playwright/test';
import type { MeshBasicMaterial } from 'three';
import { expect, openGame, read, test, until } from './game';
import type { TestHook } from '../src/game/Game';

const ID = 'marco-rieser';

/** Runs a dev event until it goes through. */
async function trigger(page: Page, id: string): Promise<void> {
  await until(page, (_g, ev) => !String(window.dev.trigger(ev)).endsWith('nicht möglich'), id);
}

// Turning back into Marco behind the door and coming back as Marco: src/game/Person.test.ts (the walk out takes minutes on CI)
test('kurt.behavior: going home, Marco spins into Kurt: skin, name and name label', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('n'); // name labels on
  await trigger(page, 'kurt-walkout');
  await until(page, (g, id) => {
    const p = g.sim.person(id);
    return p.presence === 'leaving' && p.alter && p.displayName === 'Kurt' && p.rig.skin.every((s) => !s.visible);
  }, ID);
  await until(page, () => [...document.querySelectorAll('.m-label')].some((el) => el.textContent === 'Kurt'));
  expect(errors).toEqual([]);
});

test('kurt.home: Kurt in the home office feed and the roster, under his own name; no Kurt on the office monitor then', async ({ page }) => {
  const errors = await openGame(page);
  await trigger(page, 'kurt-home');
  await until(page, (g, id) => {
    const p = g.sim.person(id);
    const home = g.homes[p.homeVariant];
    return p.presence === 'out' && p.awayKind === 'home' && p.displayName === 'Kurt' && home?.alter && home.occupantId === id;
  }, ID);
  await expect(page.locator('.m-feed__name', { hasText: 'Kurt' })).toBeVisible();
  await until(page, () => [...document.querySelectorAll('.m-away__name')].some((el) => el.textContent === 'Kurt'));
  expect(await read(page, (g, id) => g.kurtScreens.has(g.sim.person(id)), ID)).toBe(false);
  expect(errors).toEqual([]);
});

test('kurt.screen: Marco out of the office (not home office) at 11:00: his empty desk shows Kurt waving; home office: it does not', async ({ page }) => {
  const errors = await openGame(page);
  await trigger(page, 'kurt-screen');
  await until(page, (g, id) => {
    const p = g.sim.person(id);
    return p.presence === 'out' && p.awayKind === 'errand' && !p.homeDesk!.occupant && g.kurtScreens.has(p);
  }, ID);
  // Kurt moves on the screen: the picture changes as game time passes
  const shot = (g: TestHook, id: string) => {
    const d = g.sim.person(id).homeDesk!;
    const img = ((d.screenMaterial as MeshBasicMaterial).map!.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 192, 120).data;
    let h = 0;
    for (let i = 0; i < img.length; i += 7) h = (h * 31 + img[i]) | 0;
    return h;
  };
  const a = await read(page, (g, [src, id]) => new Function(`return ${src}`)()(g, id), [shot.toString(), ID] as const);
  await until(page, (g, [src, id, before]) => new Function(`return ${src}`)()(g, id) !== before, [shot.toString(), ID, a] as const);
  await trigger(page, 'kurt-home');
  await until(page, (g, id) => {
    const p = g.sim.person(id);
    return p.awayKind === 'home' && !g.kurtScreens.has(p);
  }, ID);
  expect(errors).toEqual([]);
});
