import type { Page } from '@playwright/test';
import { expect, openGame, read, scene, test, until } from './game';

const WHO = 'oriana-pontieri'; // no pets: they would stand next to her

/** One browser frame: poses, the hover state and the cursor are set per frame (game time stands still). */
const frame = (page: Page) => read(page, () => new Promise<void>((r) => requestAnimationFrame(() => r())));

/**
 * Puts WHO standing on a free spot near the middle of the screen, nobody else close by on screen, and returns where
 * her body is on screen: the middle of it and its half width (px).
 */
async function standAlone(page: Page): Promise<{ x: number; y: number; r: number }> {
  const spot = await read(page, (g, id) => {
    const cam = g.views.camera;
    const px = (v: { x: number; y: number; z: number }) => {
      const p = cam.position.clone().set(v.x, v.y, v.z).project(cam);
      return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight };
    };
    const others = g.sim.walkers.filter((w) => !w.away && w.id !== id).map((w) => px({ x: w.root.position.x, y: w.headHeight / 2, z: w.root.position.z }));
    const nav = g.sim.nav;
    for (let cz = 0; cz < nav.rows; cz++) {
      for (let cx = 0; cx < nav.cols; cx++) {
        if (!nav.walkable(cx, cz)) continue;
        const c = nav.center(cx, cz);
        const s = px({ x: c.x, y: 0.9, z: c.z });
        const central = s.x > innerWidth * 0.25 && s.x < innerWidth * 0.75 && s.y > innerHeight * 0.25 && s.y < innerHeight * 0.7;
        if (central && others.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 110)) return c;
      }
    }
    return null;
  }, WHO);
  expect(spot).not.toBeNull();
  await scene(page, (s, a) => s.put(a.id, a.at, 'pin'), { id: WHO, at: spot! });
  await frame(page);
  return read(page, (g, id) => {
    const cam = g.views.camera;
    const p = g.sim.person(id);
    const mid = p.root.position.clone();
    mid.y += p.headHeight / 2;
    const edge = mid.clone().add(cam.position.clone().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(0.4));
    const px = (v: typeof mid) => {
      const q = v.clone().project(cam);
      return { x: ((q.x + 1) / 2) * window.innerWidth, y: ((1 - q.y) / 2) * window.innerHeight };
    };
    const m = px(mid);
    const e = px(edge);
    return { x: m.x, y: m.y, r: Math.hypot(e.x - m.x, e.y - m.y) };
  }, WHO);
}

const state = (page: Page) =>
  read(page, (g, id) => {
    const p = g.sim.person(id);
    return { selected: g.selected?.id ?? null, held: p.held, lift: p.lift, x: p.pos.x, z: p.pos.z };
  }, WHO);

test('select.click + drag.person: a short press selects without lifting the person', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  const before = await state(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await frame(page);
  // pressed: nothing visible yet
  expect(await state(page)).toMatchObject({ selected: null, held: false, lift: 0, x: before.x, z: before.z });
  // hand jitter under the threshold is still a click
  await page.mouse.move(at.x + 5, at.y + 3);
  await frame(page);
  expect(await state(page)).toMatchObject({ held: false, lift: 0, x: before.x, z: before.z });
  await page.mouse.up();
  expect(await state(page)).toMatchObject({ selected: WHO, held: false, x: before.x, z: before.z });
  await expect(page.locator('#actions-name')).toHaveText(await read(page, (g, id) => g.sim.person(id).displayName, WHO));
  expect(errors).toEqual([]);
});

test('drag.person: a move past the threshold lifts, drags and selects, and is no click', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  const before = await state(page);
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 30, at.y, { steps: 3 });
  await page.mouse.move(at.x + 60, at.y, { steps: 3 });
  await frame(page);
  const held = await state(page);
  expect(held.held).toBe(true);
  expect(held.selected).toBe(WHO); // carrying somebody selects them
  expect(held.lift).toBeGreaterThan(0);
  expect(Math.hypot(held.x - before.x, held.z - before.z)).toBeGreaterThan(0.3);
  await page.mouse.up();
  expect(await state(page)).toMatchObject({ selected: WHO, held: false }); // no click on top: still just selected
  await expect(page.locator('#actions-follow')).toBeVisible();
  expect(errors).toEqual([]);
});

test('select.click: a click just beside the body still selects, one far beside it does not', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  await page.mouse.click(at.x + at.r + 40, at.y);
  expect((await state(page)).selected).toBeNull();
  // outside the hit volume, within 20 px of the body
  await page.mouse.click(at.x + at.r + 12, at.y);
  expect((await state(page)).selected).toBe(WHO);
  expect(errors).toEqual([]);
});

test('select.click: a second click on the selected person keeps them selected; the floor and Esc deselect', async ({ page }) => {
  const errors = await openGame(page);
  let at = await standAlone(page);
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).selected).toBe(WHO);
  // the camera starts to follow her: aim again
  at = await read(page, (g, id) => {
    const p = g.sim.person(id).root.position.clone();
    p.y += g.sim.person(id).headHeight / 2;
    p.project(g.views.camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, r: 0 };
  }, WHO);
  await page.mouse.click(at.x, at.y);
  expect((await state(page)).selected).toBe(WHO);
  await expect(page.locator('#actions')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await state(page)).selected).toBeNull();
  await expect(page.locator('#actions')).toBeHidden();
  expect(errors).toEqual([]);
});

test('select.hover: a hand cursor over a person, the usual one beside', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  const cursor = () => page.locator('#stage').evaluate((el) => getComputedStyle(el).cursor);
  await page.mouse.move(at.x, at.y);
  await frame(page);
  expect(await cursor()).toBe('pointer');
  await page.mouse.move(at.x + at.r + 80, at.y);
  await frame(page);
  expect(await cursor()).toBe('grab');
  expect(errors).toEqual([]);
});

test('select.actions: the card stays for somebody on the way out, with Folgen and Zurückrufen instead of the rest', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator('#actions-out')).toBeEnabled();
  await expect(page.locator('#actions-back')).toBeHidden();
  await scene(page, (s, id) => s.release(id), WHO); // put pins her: nothing sends a pinned person out
  await page.locator('#actions-out').click();
  await until(page, (g, id) => g.sim.person(id).presence === 'leaving', WHO);
  await expect(page.locator('#actions')).toBeVisible();
  await expect(page.locator('#actions-name')).toHaveText(await read(page, (g, id) => g.sim.person(id).displayName, WHO));
  await expect(page.locator('#actions-follow')).toBeEnabled();
  for (const id of ['steer', 'home', 'out']) await expect(page.locator(`#actions-${id}`)).toBeHidden();
  // Zurückrufen does what H does: she turns round and stays in the office
  await page.locator('#actions-back').click();
  await until(page, (g, id) => g.sim.person(id).presence === 'in', WHO);
  await expect(page.locator('#actions-back')).toBeHidden();
  await expect(page.locator('#actions-out')).toBeVisible();
  expect(errors).toEqual([]);
});

test('select.actions: a click the game refuses says why on the card', async ({ page }) => {
  const errors = await openGame(page);
  const at = await standAlone(page);
  await page.mouse.click(at.x, at.y); // put pins her: a scene holds her, nothing sends her out
  await expect(page.locator('#actions-out')).toBeEnabled();
  await expect(page.locator('#actions-note')).toBeHidden();
  await page.locator('#actions-out').click();
  await expect(page.locator('#actions-note')).toHaveText('Gerade nicht möglich: beschäftigt');
  expect(await read(page, (g, id) => g.sim.person(id).presence, WHO)).toBe('in');
  expect(errors).toEqual([]);
});

test('select.actions: a dog gets the card too, with its name and only Folgen working', async ({ page }) => {
  const errors = await openGame(page, '', undefined, '', 2);
  const dog = await read(page, (g) => {
    const d = g.sim.people.flatMap((p) => p.pets).find((q) => q.comesToday && !q.away);
    if (!d) return null;
    const cam = g.views.camera;
    const v = d.root.position.clone();
    v.y += d.headHeight / 2;
    v.project(cam);
    return { name: d.name, x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  });
  expect(dog).not.toBeNull();
  await page.mouse.click(dog!.x, dog!.y);
  await expect(page.locator('#actions-name')).toHaveText(dog!.name);
  await expect(page.locator('#actions-follow')).toBeEnabled();
  for (const id of ['steer', 'home', 'out']) await expect(page.locator(`#actions-${id}`)).toBeDisabled();
  expect(errors).toEqual([]);
});
