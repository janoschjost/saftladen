import { expect, test, type Page } from '@playwright/test';
import { openGame, read, until } from './game';

/** Presses on the HUD dial at a clock hour (midnight at the top, clockwise) and lets go there, optionally dragging from `from`. */
async function dialTo(page: Page, hour: number, from?: number): Promise<void> {
  const box = (await page.locator('#clock-dial').boundingBox())!;
  const at = (h: number) => {
    const a = (h / 24) * 2 * Math.PI;
    const r = box.width * 0.35;
    return [box.x + box.width / 2 + Math.sin(a) * r, box.y + box.height / 2 - Math.cos(a) * r] as const;
  };
  await page.mouse.move(...at(from ?? hour));
  await page.mouse.down();
  if (from !== undefined) await page.mouse.move(...at(hour), { steps: 8 });
  await page.mouse.up();
}

test.describe('clock', () => {
  test('time.clock: the HUD shows weekday and game time and follows the clock', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('#clock-time')).toHaveText('11:00');
    await expect(page.locator('#clock-day')).toHaveValue('0');
    await expect(page.locator('#clock-dial')).toHaveAttribute('aria-valuenow', String(11 * 60));
    // ?time freezes the clock: shown as paused
    await expect(page.locator('#clock [data-speed="0"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#clock [data-speed="60"]').click();
    await until(page, (g) => g.tod.hour > 11.1, undefined, 60_000);
    const [shown, clock] = await Promise.all([page.locator('#clock-time').textContent(), read(page, (g) => g.tod.clock)]);
    expect(shown!.slice(0, 4)).toBe(clock.slice(0, 4)); // same ten minutes (the clock races at 60x)
    expect(errors).toEqual([]);
  });

  test('time.speed: pause, 1x, 10x, 60x set the clock speed and are remembered', async ({ page }) => {
    await openGame(page);
    for (const s of [10, 1, 60]) {
      await page.locator(`#clock [data-speed="${s}"]`).click();
      expect(await read(page, (g) => [g.tod.auto, g.tod.speed])).toEqual([true, s]);
      await expect(page.locator(`#clock [data-speed="${s}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#clock [aria-pressed="true"]')).toHaveCount(1);
    }
    const h = await read(page, (g) => g.tod.hour);
    await until(page, (g, h0) => g.tod.hour > h0 + 0.05, h, 60_000);
    await page.locator('#clock [data-speed="0"]').click();
    expect(await read(page, (g) => g.tod.auto)).toBe(false);
    await expect(page.locator('#time-auto')).not.toBeChecked();
    expect(await page.evaluate(() => [localStorage.getItem('saftladen.time.auto'), localStorage.getItem('saftladen.time.speed')])).toEqual(['0', '60']);
  });

  test('time.jump: dragging the hand jumps the time, light and people follow', async ({ page }) => {
    await openGame(page);
    await dialTo(page, 15, 11);
    expect(await read(page, (g) => [Math.round(g.tod.hour * 60), g.tod.jumps])).toEqual([15 * 60, 1]);
    await expect(page.locator('#clock-time')).toHaveText('15:00');
    expect(await read(page, (g) => g.timeControl.slider.value)).toBe(String(Math.round((await read(page, (g) => g.tod.cycle)) * 1000)));
    // into the night: dark at once, everybody but the night shift goes home
    await dialTo(page, 23.5);
    await expect(page.locator('#clock-time')).toHaveText('23:30');
    expect(await read(page, (g) => [g.tod.night, g.tod.day < 0.05])).toEqual([true, true]);
    await until(page, (g) => g.scene.background.getHSL({}).l < 0.15, undefined, 60_000); // the sky, on the next frame
    await until(page, (g) => {
      const owls = g.presence.schedule.filter((s: { night: boolean; end: number }) => s.night && s.end > 23.5).length;
      return g.people.filter((p: { presence: string }) => p.presence === 'in').length <= owls;
    }, undefined, 60_000);
  });

  test('time.jump: jumping from the night into the morning brings the people on duty back in', async ({ page }) => {
    await openGame(page);
    await dialTo(page, 23.5);
    await until(page, (g) => g.people.filter((p: { presence: string }) => p.presence === 'in').length <= 6, undefined, 60_000);
    await dialTo(page, 10);
    expect(await read(page, (g) => [g.tod.night, g.tod.day > 0.9])).toEqual([false, true]);
    // everybody on duty is given a slot at the door (they walk in one after the other), the first ones come in
    type P = { presence: string; awayKind: string | null; awayLeft: number };
    await until(page, (g) => g.people.filter((p: P) => p.presence === 'returning' || p.presence === 'in' || (p.awayKind === 'off' && p.awayLeft < 600)).length >= 10, undefined, 60_000);
    const inside = await read(page, (g) => g.people.filter((p: P) => p.presence === 'in').length);
    await until(page, (g, n) => g.people.filter((p: P) => p.presence === 'in').length > n, inside, 60_000);
  });

  test('time.jump: arrow keys on the dial step 15 minutes, without moving the camera', async ({ page }) => {
    await openGame(page);
    await page.locator('#clock-dial').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#clock-time')).toHaveText('11:15');
    await page.keyboard.press('PageDown');
    await expect(page.locator('#clock-time')).toHaveText('10:15');
    expect(await read(page, (g) => g.tod.jumps)).toBe(2);
  });

  test('time.weekday: picking a day starts a fresh working day and is remembered', async ({ page }) => {
    await openGame(page);
    const before = await read(page, (g) => JSON.stringify(g.presence.schedule));
    await page.locator('#clock-day').selectOption('4');
    expect(await read(page, (g) => [g.tod.weekday, g.tod.weekdayName])).toEqual([4, 'Fr']);
    await until(page, (g, b) => JSON.stringify(g.presence.schedule) !== b, before, 60_000);
    await expect(page.locator('#clock-dial')).toHaveAttribute('aria-valuetext', 'Freitag, 11:00');
    await until(page, () => JSON.parse(localStorage.getItem('saftladen.state') ?? '{}').weekday === 4, undefined, 60_000);
  });
});
