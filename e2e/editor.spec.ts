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

const dividerAt = (page: Page) =>
  read(
    page,
    (g, id) => {
      const it = g.sim.model.items.find((i) => i.id === id)!;
      return { x: it.x, z: it.z, dx: it.dx, dz: it.dz };
    },
    DIVIDER,
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
  expect(await read(page, (g) => g.editor.dragBlocked)).toBe('Platz 9'); // red outline
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
