import { expect, openGame, read, test, until } from './game';


test('load', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/is-loading/);
  expect(await read(page, (g) => g.people.length)).toBeGreaterThan(10);
  // frames come, but under ?test time stands still between them
  const t0 = await read(page, (g) => ({ last: g.last, clock: g.clock }));
  await expect.poll(() => read(page, (g) => g.last)).toBeGreaterThan(t0.last + 100);
  expect(await read(page, (g) => g.clock)).toBe(t0.clock);
  // unfrozen, as in the real game, the loop itself moves the game on with the clock on the wall
  await read(page, (g) => void (g.frozen = false));
  await expect.poll(() => read(page, (g) => g.clock)).toBeGreaterThan(t0.clock + 0.2);
  expect(errors).toEqual([]);
});

// The only test that draws (`&draw`), the way players see it: shadows, antialiasing, the home office feeds. Slow in
// software WebGL, so on a small canvas and for a few frames. A shader that no longer compiles fails here.
test('load: the office is drawn without errors', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
  const errors = await openGame(page, 'homes', undefined, 'draw');
  const r = await read(page, (g) => ({ shadows: g.renderer.shadowMap.enabled, programs: g.renderer.info.programs.length, frame: g.renderer.info.render.frame }));
  expect(r.shadows).toBe(true);
  expect(r.programs).toBeGreaterThan(5);
  await expect.poll(() => read(page, (g) => g.renderer.info.render.frame), { timeout: 60_000 }).toBeGreaterThan(r.frame + 2);
  expect(errors).toEqual([]);
});

test.describe('keys', () => {
  test('keys.roof', async ({ page }) => {
    await openGame(page);
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');
    const before = await read(page, (g) => g.roof.visible);
    await page.keyboard.press('r');
    expect(await read(page, (g) => g.roof.visible)).toBe(!before);
    await page.keyboard.press('r');
    expect(await read(page, (g) => g.roof.visible)).toBe(before);
    // plan view never shows the roof, and R does nothing there
    await page.keyboard.press('3');
    await page.keyboard.press('r');
    expect(await read(page, (g) => [g.roof.visible, g.roofWanted])).toEqual([false, before]);
  });

  test('keys.names', async ({ page }) => {
    await openGame(page);
    const label = page.locator('#labels .m-label').first();
    expect(await read(page, (g) => g.overlay.namesVisible)).toBe(false);
    await expect(label).toBeHidden();
    await page.keyboard.press('n');
    expect(await read(page, (g) => g.overlay.namesVisible)).toBe(true);
    await expect(page.locator('#setting-names')).toBeChecked(); // the settings switch mirrors the key
    await page.keyboard.press('n');
    expect(await read(page, (g) => g.overlay.namesVisible)).toBe(false);
  });

  test('view.iso + view.orbit + view.plan + view.walk: keys 1-4', async ({ page }) => {
    await openGame(page);
    for (const [key, mode] of [['1', 'iso'], ['3', 'plan'], ['4', 'walk'], ['2', 'orbit']] as const) {
      await page.keyboard.press(key);
      expect(await read(page, (g) => g.views.mode)).toBe(mode);
      await expect(page.locator('#stage')).toHaveAttribute('data-view', mode);
    }
    // Esc leaves the walk view
    await page.keyboard.press('4');
    await page.keyboard.press('Escape');
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  });
});

test.describe('view.deeplinks', () => {
  test('#plan opens the plan view', async ({ page }) => {
    await openGame(page, 'plan');
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
  });

  test('#walk@x,z,yaw opens the walk view there', async ({ page }) => {
    await openGame(page, 'walk@20,7,1.5');
    expect(await read(page, (g) => g.views.mode)).toBe('walk');
    const eye = await read(page, (g) => g.views.eye);
    expect(eye.x).toBeCloseTo(20, 0);
    expect(eye.z).toBeCloseTo(7, 0);
    expect(eye.dx).toBeCloseTo(-Math.sin(1.5), 1);
    expect(eye.dz).toBeCloseTo(-Math.cos(1.5), 1);
  });
});
