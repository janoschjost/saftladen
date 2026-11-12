import { expect, openGame, read, test, until } from './game';

/** Dev panel "Debug-Overlays": nav grid, state labels, paths (#90). */

test('dev.overlays: all off by default, nothing drawn', async ({ page }) => {
  const errors = await openGame(page);
  expect(await read(page, (g) => g.debug.on)).toEqual({ grid: false, states: false, paths: false });
  await expect(page.locator('.m-label--debug:visible')).toHaveCount(0);
  expect(await read(page, (g) => [g.debug.gridMesh.visible, g.debug.lines.visible])).toEqual([false, false]);
  expect(errors).toEqual([]);
});

test('dev.overlays: the panel toggles each overlay on and off', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('`');
  for (const kind of ['grid', 'states', 'paths']) {
    const b = page.locator(`#dev-body .m-button[data-overlay="${kind}"]`);
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    expect(await read(page, (g, k) => g.debug.on[k], kind)).toBe(true);
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(await read(page, (g, k) => g.debug.on[k], kind)).toBe(false);
  }
  expect(errors).toEqual([]);
});

test('dev.overlays: state labels sit above everybody in the office and say what they do', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'overlay=states');
  await until(page, (g) => g.debug.on.states);
  const inOffice = await read(page, (g) => g.people.filter((p: { away: boolean }) => !p.away).length);
  await expect(page.locator('.m-label--debug:visible')).not.toHaveCount(0);
  // somebody sits at a desk: the label says so
  await until(page, () => [...document.querySelectorAll<HTMLElement>('.m-label--debug')].some((el) => !el.hidden && el.textContent?.includes('desk:work')), undefined, 30_000);
  expect(await page.locator('.m-label--debug:visible').count()).toBeGreaterThanOrEqual(Math.min(inOffice, 3));
  expect(errors).toEqual([]);
});

test('dev.overlays: the grid shows the nav grid and follows changes to it', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'overlay=grid');
  const reds = () =>
    read(page, (g) => {
      const d = g.debug.gridTexture?.image.data as Uint8Array | undefined;
      if (!d) return -1;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1]) n++;
      return n;
    });
  const blocked = () => read(page, (g) => { let n = 0; for (let z = 0; z < g.nav.rows; z++) for (let x = 0; x < g.nav.cols; x++) if (!g.nav.walkable(x, z)) n++; return n; });
  await until(page, (g) => g.debug.gridTexture);
  expect(await reds()).toBe(await blocked());
  // a layout change: block a free cell, the overlay catches up
  const before = await blocked();
  await read(page, (g) => {
    for (let z = 5; z < g.nav.rows; z++) for (let x = 5; x < g.nav.cols; x++) if (g.nav.walkable(x, z)) return g.nav.block(x, z);
  });
  expect(await blocked()).toBe(before + 1);
  await until(page, (g) => {
    const d = g.debug.gridTexture.image.data as Uint8Array;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] > d[i + 1]) n++;
    let b = 0;
    for (let z = 0; z < g.nav.rows; z++) for (let x = 0; x < g.nav.cols; x++) if (!g.nav.walkable(x, z)) b++;
    return n === b;
  });
  expect(errors).toEqual([]);
});

test('dev.overlays: paths show the way of somebody walking', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'overlay=paths');
  await until(page, (g) => g.walkers.some((w: { path: unknown[]; away: boolean }) => !w.away && w.path.length > 0) && g.debug.lines.geometry.drawRange.count > 0, undefined, 30_000);
  expect(await read(page, (g) => g.debug.lines.visible)).toBe(true);
  expect(errors).toEqual([]);
});

test('dev.overlays: console switch and unknown ?overlay only warns', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  const errors = await openGame(page, '', undefined, 'overlay=nope');
  expect(warnings.some((w) => w.includes('no overlay "nope"'))).toBe(true);
  await page.evaluate(() => (window as unknown as { dev: { overlay(k: string, on?: boolean): void } }).dev.overlay('paths'));
  expect(await read(page, (g) => g.debug.on.paths)).toBe(true);
  await page.evaluate(() => (window as unknown as { dev: { overlay(k: string, on?: boolean): void } }).dev.overlay('paths', false));
  expect(await read(page, (g) => g.debug.on.paths)).toBe(false);
  expect(errors).toEqual([]);
});
