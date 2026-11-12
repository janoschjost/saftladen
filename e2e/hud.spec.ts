import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

test('hud.minimal: title, gear, Aktionen and the key line, nothing else', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('.m-hud-title')).toBeVisible();
  await expect(page.locator('#help')).toBeVisible();
  for (const id of ['#open-settings', '#open-actions']) {
    const box = await page.locator(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  for (const id of ['#settings', '#action-sheet', '#people', '#seats', '#dev', '#editor', '#now', '#walk-exit']) await expect(page.locator(id)).toBeHidden();
  // the old toolbar and view bar are gone
  await expect(page.locator('.m-toolbar, .m-viewbar, .m-tool, #toggle-settings, #toggle-names')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('hud.settings', () => {
  test('gear and "," open the popover; Esc, outside click and close button close it', async ({ page }) => {
    await openGame(page);
    const pop = page.locator('#settings');
    const gear = page.locator('#open-settings');
    await gear.click();
    await expect(pop).toBeVisible();
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    // under the gear
    const g = (await gear.boundingBox())!;
    const p = (await pop.boundingBox())!;
    expect(p.y).toBeGreaterThan(g.y + g.height - 1);
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(gear).toHaveAttribute('aria-expanded', 'false');

    await page.keyboard.press(',');
    await expect(pop).toBeVisible();
    await page.mouse.click(400, 600); // the office, outside the popover
    await expect(pop).toBeHidden();

    await gear.click();
    await page.locator('#settings-close').click();
    await expect(pop).toBeHidden();
  });

  test('view, weather, names and follow from the popover; values are remembered', async ({ page }) => {
    await openGame(page);
    await page.locator('#open-settings').click();
    await page.locator('#settings label:has(input[value="iso"])').click();
    expect(await read(page, (g) => g.views.mode)).toBe('iso');
    await page.locator('#settings label:has(input[value="plan"])').click();
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
    // keys still switch the view, the segments follow
    await page.keyboard.press('Escape');
    await page.keyboard.press('2');
    await page.locator('#open-settings').click();
    await expect(page.locator('#settings input[value="orbit"]')).toBeChecked();

    await page.locator('#settings label:has(input[value="rain"])').click();
    expect(await read(page, (g) => g.weather.mode)).toBe('rain');
    await page.locator('#setting-names').setChecked(true);
    expect(await read(page, (g) => g.overlay.namesVisible)).toBe(true);
    await page.locator('#setting-follow').setChecked(false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('saftladen.settings') ?? '{}'));
    expect(saved).toMatchObject({ weather: 'rain', follow: false });

    await page.reload();
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
    await page.locator('#open-settings').click();
    await expect(page.locator('#settings input[value="rain"]')).toBeChecked();
    await expect(page.locator('#setting-follow')).not.toBeChecked();
  });

  test('links open the panels that stay', async ({ page }) => {
    await openGame(page);
    for (const [link, panel] of [
      ['#open-people', '#people'],
      ['#open-seats', '#seats'],
      ['#open-dev', '#dev'],
      ['#open-editor', '#editor'],
    ]) {
      await page.locator('#open-settings').click();
      await page.locator(link).click();
      await expect(page.locator('#settings')).toBeHidden(); // makes room for the panel
      await expect(page.locator(panel)).toBeVisible();
    }
    await page.locator('#open-settings').click();
    await page.locator('#open-picker').click();
    await expect(page.locator('#picker')).toBeVisible();
  });
});

test('hud.walk: Rundgang hides gear and Aktionen and has its own way back', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('4');
  await expect(page.locator('#open-settings')).toBeHidden();
  await expect(page.locator('#open-actions')).toBeHidden();
  await page.keyboard.press('a'); // no sheet in the walk view
  await expect(page.locator('#action-sheet')).toBeHidden();
  await page.locator('#walk-exit').click();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  await expect(page.locator('#open-actions')).toBeVisible();
});

test.describe('actions.sheet', () => {
  test('A and the button toggle the sheet with six cards and their previews; Esc closes', async ({ page }) => {
    await openGame(page);
    const sheet = page.locator('#action-sheet');
    await page.keyboard.press('a');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveClass(/is-open/);
    await expect(page.locator('#open-actions')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#action-cards .m-card')).toHaveCount(6);
    await expect(page.locator('#action-cards .m-card').first()).toContainText('Drucken');
    await expect(page.locator('#action-cards .m-card__key').first()).toHaveText('1');
    // the previews are drawn once, on the first open: the canvas is no longer empty
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector<HTMLCanvasElement>('#action-cards canvas')!;
          const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
          let lit = 0;
          for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit++;
          return lit;
        }),
      )
      .toBeGreaterThan(10);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    // the view did not change, nothing was deselected by that Esc
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');

    await page.locator('#open-actions').click();
    await expect(sheet).toBeVisible();
    await page.locator('#action-sheet-close').click();
    await expect(sheet).toBeHidden();
  });

  test('number keys start cards instead of switching the view', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('a');
    await expect(page.locator('#action-sheet')).toBeVisible();
    await page.keyboard.press('3'); // Kaffee, not the plan view
    await expect(page.locator('#action-sheet')).toBeHidden();
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');
    await until(page, (g) => g.kitchen.current);
  });

  test('actions.search: filters cards and lists the other dev events', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('a');
    await page.locator('#action-search').fill('kick');
    await expect(page.locator('#action-cards .m-card:visible')).toHaveCount(1);
    await page.locator('#action-search').fill('regen');
    await expect(page.locator('#action-cards .m-card:visible')).toHaveCount(0);
    const entry = page.locator('#action-more [data-event="rain"]');
    await expect(entry).toBeVisible();
    const before = await read(page, (g) => g.weather.raining);
    await entry.click();
    await expect(page.locator('#action-sheet')).toBeHidden();
    expect(await read(page, (g) => g.weather.raining)).toBe(!before);
    await expect(page.locator('#now')).toBeVisible();
  });
});

test('actions.camera: Drucken flies to Orbit and follows the lead; dragging hands back, Esc flies to the overview', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('1'); // from Iso
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="printer"]').click();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  const a = await read(page, (g) => g.action && { lead: g.action.lead?.id, printing: !!g.action.lead?.printJob, owned: g.action.owned });
  expect(a).toMatchObject({ printing: true, owned: true });
  expect(await read(page, (g) => g.views.flying)).toBe(true);
  await expect(page.locator('#now')).toBeVisible();
  await expect(page.locator('#now-caption')).toContainText('druckt');
  await expect(page.locator('#now-follow')).toHaveAttribute('aria-pressed', 'true');
  // the camera closes in on the lead: about half the overview distance
  await until(page, (g) => {
    const s = g.views.orbitShot;
    const p = g.action?.lead.root.position;
    return p && Math.hypot(s.x - p.x, s.z - p.z) < 1.5 && s.dist < g.views.overviewShot().dist * 0.6;
  });

  // a wheel on the office hands the camera back
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 200);
  await until(page, (g) => g.action && !g.action.owned);
  await expect(page.locator('#now-follow')).toHaveAttribute('aria-pressed', 'false');
  expect(await read(page, (g) => g.views.flying)).toBe(false);
  // Folgen takes it again
  await page.locator('#now-follow').click();
  expect(await read(page, (g) => g.action.owned)).toBe(true);

  // Esc: follow off, back to the overview
  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.action)).toBeNull();
  await expect(page.locator('#now')).toBeHidden();
  await until(page, (g) => !g.views.flying && Math.abs(g.views.orbitShot.dist - g.views.overviewShot().dist) < 0.5);
});

test('actions.fail: an action that cannot run says so and leaves the camera alone', async ({ page }) => {
  // the pod is already taken
  await openGame(page, 'iso', undefined, 'event=pod');
  await until(page, (g) => g.pod.current);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="pod"]').click();
  await expect(page.locator('#now')).toBeVisible();
  await expect(page.locator('#now-caption')).toHaveText('Holzhaus: nicht möglich');
  expect(await read(page, (g) => [g.views.mode, g.action, g.views.flying])).toEqual(['iso', null, false]);
});

test('actions.param: ?action=printer starts the card at load', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'action=printer');
  await until(page, (g) => g.action?.lead?.printJob && g.views.mode === 'orbit');
  await expect(page.locator('#now')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('actions.touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('phone: settings and Aktionen are bottom sheets, two cards per row, 44 px targets, no key hints', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#help')).toBeHidden();
    await expect(page.locator('.m-action-button__key')).toBeHidden();
    await page.locator('#open-settings').click();
    // docked to the bottom edge, full width (polled: it slides in)
    await expect.poll(async () => {
      const pop = (await page.locator('#settings').boundingBox())!;
      return [Math.round(pop.y + pop.height), Math.round(pop.width)];
    }).toEqual([844, 390]);
    for (const sel of ['#settings-close', '#settings label:has(input[value="iso"]) span', '#open-people']) {
      expect((await page.locator(sel).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#settings-close').click();

    await page.locator('#open-actions').click();
    await expect(page.locator('#action-sheet')).toHaveClass(/is-open/);
    const cards = page.locator('#action-cards .m-card');
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!));
    expect(Math.round(a.y)).toBe(Math.round(b.y)); // side by side
    expect(c.y).toBeGreaterThan(a.y + a.height - 1); // the third starts the next row
    expect(a.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.m-card__key').first()).toBeHidden();
  });
});
