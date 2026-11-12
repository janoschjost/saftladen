import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { read } from './game';

/**
 * Every `url:` in FEATURES.md is a link devs open to check a feature by eye (also listed under "Try it" in PRs).
 * Each one must at least start the game without errors and land in the view it asks for.
 */
const urls = [...new Set([...readFileSync('FEATURES.md', 'utf8').matchAll(/url: `([^`]+)`/g)].map((m) => m[1]))];

test('FEATURES.md has urls', () => expect(urls.length).toBeGreaterThan(10));

for (const url of urls) {
  test(`url ${url}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    // same URL plus the read-only test hook
    const [path, hash = ''] = url.split('#');
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}test${hash ? `#${hash}` : ''}`);
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
    await expect(page.locator('#loader')).toHaveCount(0, { timeout: 30_000 });
    const mode = hash.split('@')[0];
    if (['orbit', 'iso', 'plan', 'walk'].includes(mode)) expect(await read(page, (g) => g.views.mode)).toBe(mode);
    if (new URLSearchParams(path.split('?')[1]).has('day')) await expect.poll(() => read(page, (g) => !!g.day), { timeout: 30_000 }).toBe(true);
    expect(errors).toEqual([]);
  });
}
