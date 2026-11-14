import { expect, openGame, read, test } from './game';

/** Dev panel "Personen / Tiere entfernen": the toggles, the console and the reload (#89). What removing does to the sim is in `src/game/devRemove.test.ts`. */

test.describe('dev.remove', () => {
  test('the dev panel has a toggle per person and pet; the console can do it too', async ({ page }) => {
    const errors = await openGame(page);
    await page.keyboard.press('`');
    const counts = await read(page, (g) => ({ people: g.people.length, pets: g.pets.length }));
    await expect(page.locator('#dev-body .m-button[data-id]')).toHaveCount(counts.people + counts.pets);
    const btn = page.locator('#dev-body .m-button[data-id="jan-hasler"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dev-status')).toContainText('raus');
    expect(await read(page, (g) => g.sim.removedIds)).toEqual(['jan-hasler']);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
    // console: dev.remove / dev.restore / dev.removed
    await page.evaluate(() => (window as unknown as { dev: { remove(id: string): void } }).dev.remove('jan-hasler'));
    expect(await page.evaluate(() => (window as unknown as { dev: { removed(): string[] } }).dev.removed())).toEqual(['jan-hasler']);
    await page.evaluate(() => (window as unknown as { dev: { restore(id: string): void } }).dev.restore('jan-hasler'));
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
    // removed from the console while the panel is open: the next click on the button restores
    await page.evaluate(() => (window as unknown as { dev: { remove(id: string): void } }).dev.remove('jan-hasler'));
    await btn.click();
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('not persisted: a reload restores everyone', async ({ page }) => {
    await openGame(page);
    await read(page, (g) => g.setRemoved('jan-hasler', true));
    await page.reload();
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
  });
});
