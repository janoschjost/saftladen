import { expect, openGame, read, test } from './game';

// Which frames get drawn follows the wall clock, so the spec checks only the wiring the browser gives: focus and
// input reach the pacer. What the pacer does with them is `src/game/framePacer.test.ts`.
test('perf.idle: losing focus slows the loop down, focus and input bring the full rate back', async ({ page }) => {
  const errors = await openGame(page);
  expect(await read(page, (g) => g.pace.fps)).toBe(60);

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  expect(await read(page, (g) => [g.pace.focused, g.pace.fps])).toEqual([false, 10]);
  const before = await read(page, (g) => g.pace.woke);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const back = await read(page, (g) => g.pace);
  expect([back.focused, back.fps]).toEqual([true, 60]);
  expect(back.woke).toBeGreaterThan(before);

  // paused: input wakes it, each kind of it
  await page.locator('#clock-slower').click(); // 1x -> 0.5x
  await page.locator('#clock-slower').click(); // -> pause
  expect(await read(page, (g) => g.timeScale)).toBe(0);
  let woke = await read(page, (g) => g.pace.woke);
  const inputs: [string, () => Promise<void>][] = [
    ['pointer', () => page.mouse.move(200, 200)],
    ['wheel', () => page.mouse.wheel(0, 50)],
    ['key', () => page.keyboard.press('Shift')],
  ];
  for (const [kind, act] of inputs) {
    await act();
    const now = await read(page, (g) => g.pace.woke); // not the rate: that falls back after 1.5 s of wall time
    expect(now, kind).toBeGreaterThan(woke);
    woke = now;
  }
  expect(errors).toEqual([]);
});
