import { CYCLE_SECONDS } from '../src/game/TimeOfDay';
import type { Page } from '@playwright/test';
import type { Color } from 'three';
import { expect, openGame, read, test, until } from './game';

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
    // ?time pins the clock at that hour while the game runs on, until a speed button lets it go
    await until(page, (g) => g.clock > 20, undefined, 60_000);
    expect(await read(page, (g) => [g.sim.tod.pinned, g.sim.tod.clock])).toEqual([true, '11:00']);
    await page.locator('#clock [data-speed="1"]').click();
    expect(await read(page, (g) => g.sim.tod.pinned)).toBe(false);
    await until(page, (g) => g.sim.tod.hour > 11.1, undefined, 120_000);
    const [shown, clock] = await Promise.all([page.locator('#clock-time').textContent(), read(page, (g) => g.sim.tod.clock)]);
    expect(shown).toBe(clock);
    expect(errors).toEqual([]);
  });

  test('time.speed: pause, 1x, 10x, 25x run the whole game at that speed and are remembered', async ({ page }) => {
    await openGame(page);
    expect(await read(page, (g) => g.timeScale)).toBe(1); // ?time pins the clock, the game runs
    for (const s of [10, 1, 25]) {
      await page.locator(`#clock [data-speed="${s}"]`).click();
      expect(await read(page, (g) => [g.sim.tod.auto, g.sim.tod.speed, g.timeScale])).toEqual([true, s, s]);
      await expect(page.locator(`#clock [data-speed="${s}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#clock [aria-pressed="true"]')).toHaveCount(1);
    }
    // five real seconds at 25x: the clock and the whole simulation (game clock, who walks where) are 125 game seconds on
    const run = (seconds: number) =>
      read(page, (g, [n, cycleSeconds]) => {
        const t0 = [g.clock, g.sim.tod.cycle];
        for (let i = 0; i < n * 4; i++) g.frame(0.25);
        return [g.clock - t0[0], (g.sim.tod.cycle - t0[1]) * cycleSeconds];
      }, [seconds, CYCLE_SECONDS]); // (the function runs in the page: the constant goes in as an argument)
    const [simulated, clock] = await run(5);
    expect(simulated).toBeCloseTo(125, 3);
    expect(clock).toBeCloseTo(125, 3);
    // pause stops everything, speed stays remembered
    await page.locator('#clock [data-speed="0"]').click();
    expect(await read(page, (g) => [g.sim.tod.auto, g.timeScale])).toEqual([false, 0]);
    await expect(page.locator('#time-auto')).not.toBeChecked();
    expect(await run(5)).toEqual([0, 0]);
    expect(await page.evaluate(() => [localStorage.getItem('saftladen.time.auto'), localStorage.getItem('saftladen.time.speed')])).toEqual(['0', '25']);
  });

  test('time.jump: dragging the hand jumps the time, light and people follow', async ({ page }) => {
    await openGame(page);
    await page.locator('#clock [data-speed="0"]').click(); // jumping works while paused
    await dialTo(page, 15, 11);
    expect(await read(page, (g) => [Math.round(g.sim.tod.hour * 60), g.sim.tod.jumps, g.sim.tod.auto])).toEqual([15 * 60, 1, false]); // and the game stays paused
    await expect(page.locator('#clock-time')).toHaveText('15:00');
    // the slider in the environment popover catches up when it opens
    await page.locator('#open-env').click();
    await expect(page.locator('#time-slider')).toHaveValue(String(Math.round((await read(page, (g) => g.sim.tod.cycle)) * 1000)));
    await page.locator('#open-env').click();
    // into the night: dark at once, everybody but the night shift goes home
    const inside = await read(page, (g) => g.sim.people.filter((p) => p.presence === 'in').length);
    await dialTo(page, 23.5);
    await expect(page.locator('#clock-time')).toHaveText('23:30');
    // paused: nothing steps, yet the jump is applied by the next frame (people on their way out already left their desks' presence)
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    expect(await read(page, (g, n) => g.sim.people.filter((p) => p.presence === 'in').length < n, inside)).toBe(true);
    expect(await read(page, (g) => [g.sim.tod.night, g.sim.tod.day < 0.05])).toEqual([true, true]);
    await until(page, (g) => (g.scene.background as Color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.15, undefined, 60_000); // the sky, on the next frame
    await until(page, (g) => {
      const owls = g.sim.presence.schedule.filter((s) => s.night && s.end > 23.5).length;
      return g.sim.people.filter((p) => p.presence === 'in').length <= owls;
    }, undefined, 60_000);
  });

  test('time.jump: jumping from the night into the morning brings the people on duty back in', async ({ page }) => {
    await openGame(page);
    await dialTo(page, 23.5);
    await until(page, (g) => g.sim.people.filter((p) => p.presence === 'in').length <= 6, undefined, 60_000);
    await dialTo(page, 10);
    expect(await read(page, (g) => [g.sim.tod.night, g.sim.tod.day > 0.9])).toEqual([false, true]);
    // everybody on duty is given a slot at the door (they walk in one after the other), the first ones come in
      await until(page, (g) => g.sim.people.filter((p) => p.presence === 'returning' || p.presence === 'in' || (p.awayKind === 'off' && p.awayLeft < 600)).length >= 10, undefined, 60_000);
    const inside = await read(page, (g) => g.sim.people.filter((p) => p.presence === 'in').length);
    await until(page, (g, n) => g.sim.people.filter((p) => p.presence === 'in').length > n, inside, 60_000);
  });

  test('time.jump: arrow keys on the dial step 15 minutes, without moving the camera', async ({ page }) => {
    await openGame(page);
    await page.locator('#clock-dial').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#clock-time')).toHaveText('11:15');
    await page.keyboard.press('PageDown');
    await expect(page.locator('#clock-time')).toHaveText('10:15');
    expect(await read(page, (g) => g.sim.tod.jumps)).toBe(2);
  });

  test('time.weekday: picking a day starts a fresh working day and is remembered', async ({ page }) => {
    await openGame(page);
    const before = await read(page, (g) => JSON.stringify(g.sim.presence.schedule));
    await page.locator('#clock-day').selectOption('4');
    expect(await read(page, (g) => [g.sim.tod.weekday, g.sim.tod.weekdayName])).toEqual([4, 'Fr']);
    await until(page, (g, b) => JSON.stringify(g.sim.presence.schedule) !== b, before, 60_000);
    await expect(page.locator('#clock-dial')).toHaveAttribute('aria-valuetext', 'Freitag, 11:00');
    await until(page, () => JSON.parse(localStorage.getItem('saftladen.state') ?? '{}').weekday === 4, undefined, 60_000);
  });
});
