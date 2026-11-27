import { expect, openGame, read, test } from './game';

test.describe('ui.loader', () => {
  test('ui.loader: ?test pages: the loader is gone and the game is usable after load', async ({ page }) => {
    const errors = await openGame(page);
    await expect(page.locator('#loader')).toHaveCount(0); // faded out and removed
    await expect(page.locator('body')).not.toHaveClass(/is-loading/);
    await page.keyboard.press('3');
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
    expect(errors).toEqual([]);
  });

  test('ui.loader: dark, mark, "Lädt …", labelled bar, nothing underneath', async ({ page }) => {
    // The loader is gone before a test can look: take a snapshot of it as the HTML shows it, when the document is parsed.
    // (The 2 s minimum is the rule tested in src/ui/loaderRules.test.ts: ?test skips it, and without ?test the
    // office is drawn, which takes minutes in software WebGL.)
    await page.addInitScript(() => {
      const w = window as unknown as { snap?: Record<string, string | boolean | null> };
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('loader')!;
        w.snap = {
          bg: getComputedStyle(el).backgroundColor,
          text: el.textContent!.replace(/\s+/g, ' ').trim(),
          role: el.getAttribute('role'),
          bar: el.querySelector('[role=progressbar]')?.getAttribute('aria-label') ?? null,
          mark: !!el.querySelector('svg.m-loader__mark path'),
          loading: document.body.classList.contains('is-loading'),
          theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content') ?? null,
        };
      });
    });
    await page.goto('/?test&seed=1&time=11');
    await page.waitForFunction(() => !document.getElementById('loader'), undefined, { timeout: 60_000 });
    const snap = await page.evaluate(() => (window as unknown as { snap: Record<string, unknown> }).snap);
    expect(snap).toEqual({ bg: 'rgb(13, 15, 19)', text: 'Lädt …', role: 'status', bar: 'Laden', mark: true, loading: true, theme: '#0d0f13' });
  });
});
