import type { Page } from '@playwright/test';
import { expect, openGame, read, test } from './game';

const DIVIDER = 'group@7.1,6.1'; // "Trennmöbel Himbeeren": a metre west of it, desks 9 and 10 are cut off

/** Where on the screen the point (x, z) of the floor is, 0.4 m up. */
const screenAt = (page: Page, at: { x: number; z: number }) =>
  read(
    page,
    (g, p) => {
      // a THREE.Vector3 from the page's own copy of three
      const v = g.sim.model.items[0].holder.position.clone().set(p.x, 0.4, p.z).project(g.views.camera);
      return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
    },
    at,
  );

const itemAt = (page: Page, id: string) =>
  read(
    page,
    (g, id) => {
      const it = g.sim.model.items.find((i) => i.id === id)!;
      return { x: it.x, z: it.z, dx: it.dx, dz: it.dz };
    },
    id,
  );
const dividerAt = (page: Page) => itemAt(page, DIVIDER);
/** Middle of a plant's pot (its foliage may lean away from the middle of the whole plant). */
const potAt = (page: Page, id: string) =>
  read(
    page,
    (g, id) => {
      const pot = g.sim.model.items.find((i) => i.id === id)!.blockers()[0];
      return { x: (pot.min.x + pot.max.x) / 2, z: (pot.min.z + pot.max.z) / 2 };
    },
    id,
  );

/** How many of the item's meshes are see-through right now (the red tint over a blocked spot). */
const seeThrough = (page: Page, id: string) =>
  read(
    page,
    (g, id) => {
      let n = 0;
      g.sim.model.items
        .find((i) => i.id === id)!
        .holder.traverse((o) => {
          const m = (o as { material?: { transparent: boolean } | Array<{ transparent: boolean }> }).material;
          if (m && [m].flat().some((x) => x.transparent)) n++;
        });
      return n;
    },
    id,
  );

test('editor.placement: an item dropped where it cuts off a seat goes back where it was', async ({ page }) => {
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  await expect(page.locator('#editor')).toBeVisible();
  const before = await dividerAt(page);
  const from = await screenAt(page, before);
  const to = await screenAt(page, { x: before.x - 1, z: before.z });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  expect(await read(page, (g) => g.editor.dragBlocked)).toBe('Platz 9 versperren'); // red outline, red see-through item
  await page.mouse.up();

  expect(await dividerAt(page)).toEqual(before);
  await expect(page.locator('#editor-status')).toContainText('Platz 9');
  expect(errors).toEqual([]);
});

test('editor.placement: an arrow nudge that would cut off a seat is refused', async ({ page }) => {
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  const before = await dividerAt(page);
  const at = await screenAt(page, before);
  await page.mouse.click(at.x, at.y);
  expect(await read(page, (g) => g.editor.selectedItem?.id)).toBe(DIVIDER);

  // half a metre west there is still a way past it, three quarters cut desks 9 and 10 off
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowLeft');
  expect((await dividerAt(page)).dx).toBe(before.dx - 0.5);
  await expect(page.locator('#editor-status')).toContainText('Platz 9');
  expect(errors).toEqual([]);
});

test('editor.placement: a JSON import that would cut off a seat is not applied', async ({ page }) => {
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  const before = await dividerAt(page);
  await page.locator('#editor-json').fill(JSON.stringify({ [DIVIDER]: { dx: -1 } }));
  await page.locator('#editor-import').click();
  await expect(page.locator('#editor-status')).toContainText('Nicht übernommen');
  expect(await dividerAt(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('editor.placement: a saved layout that already cuts off a seat does not lock the other items', async ({ page }) => {
  // saved before the check existed: the plant stands in the only way to desk 27 again
  await page.addInitScript(() => localStorage.setItem('saftladen.layout', JSON.stringify({ 'plant@27.1,9': {} })));
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  expect(await read(page, (g) => g.sim.blocked().filter((b) => !/^(wall|overlap|spot) /.test(b.key)).map((b) => b.label))).toEqual(['Platz 27 versperren']);
  const before = await dividerAt(page);
  const at = await screenAt(page, before);
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('Shift+ArrowLeft'); // nothing new is cut off: the nudge is kept
  expect((await dividerAt(page)).dx).toBe(before.dx - 0.25);
  expect(errors).toEqual([]);
});


test('editor.placement: an item dragged into another one turns red and goes back where it was', async ({ page }) => {
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  const before = await itemAt(page, 'foosball');
  const from = await screenAt(page, before);
  const to = await screenAt(page, await itemAt(page, 'reception-counter'));
  const opaque = await seeThrough(page, 'foosball');

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  expect(await read(page, (g) => g.editor.dragBlocked)).toBe('in Empfangstheke stehen');
  expect(await seeThrough(page, 'foosball')).toBeGreaterThan(opaque); // red and see-through ...
  expect(await seeThrough(page, 'reception-counter')).toBe(0); // ... only the dragged item
  await page.mouse.up();

  expect(await itemAt(page, 'foosball')).toEqual(before);
  expect(await seeThrough(page, 'foosball')).toBe(opaque);
  await expect(page.locator('#editor-status')).toContainText('in Empfangstheke stehen');
  expect(errors).toEqual([]);
});

test('editor.placement: an arrow nudge into a wall is refused', async ({ page }) => {
  const plant = 'plant@32.1,-0.9'; // against the east wall
  const errors = await openGame(page, 'plan');
  await page.keyboard.press('e');
  const before = await itemAt(page, plant);
  const at = await screenAt(page, await potAt(page, plant));
  await page.mouse.click(at.x, at.y);
  expect(await read(page, (g) => g.editor.selectedItem?.id)).toBe(plant);

  await page.keyboard.press('ArrowRight'); // east, into the wall
  expect(await itemAt(page, plant)).toEqual(before);
  await expect(page.locator('#editor-status')).toContainText('in einer Wand stehen');
  await page.keyboard.press('ArrowLeft'); // away from it: fine
  expect((await itemAt(page, plant)).dx).toBe(before.dx - 0.05);
  expect(errors).toEqual([]);
});
