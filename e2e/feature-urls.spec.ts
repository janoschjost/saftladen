import { readFileSync } from 'node:fs';
import { boot, expect, read, test, until } from './game';

/**
 * Every `url:` in FEATURES.md is a link devs open to check a feature by eye (also listed under "Try it" in PRs).
 * Each one must start the game without errors, land in the view it asks for, and every `event=` / `action=` in it
 * must really start (a mistyped id only warns in the console, and the page would show nothing).
 */
const urls = [...new Set([...readFileSync('FEATURES.md', 'utf8').matchAll(/url: `([^`]+)`/g)].map((m) => m[1]))];

test('FEATURES.md has urls', () => expect(urls.length).toBeGreaterThan(10));

for (const url of urls) {
  test(`url ${url}`, async ({ page }) => {
    const debug: string[] = []; // what the dev params report (src/game/debugParams.ts)
    page.on('console', (m) => m.text().startsWith('[debug]') && debug.push(m.text()));
    // same URL plus the test hook
    const [path, hash = ''] = url.split('#');
    const errors = await boot(page, `${path}${path.includes('?') ? '&' : '?'}test${hash ? `#${hash}` : ''}`);
    const query = new URLSearchParams(path.split('?')[1]);
    const mode = hash.split('@')[0];
    if (['orbit', 'iso', 'plan', 'walk'].includes(mode)) expect(await read(page, (g) => g.views.mode)).toBe(mode);
    if (query.has('day')) await until(page, (g) => !!g.day);
    const started = [...query.getAll('event').map((id) => `event ${id}:`), ...query.getAll('action').map((id) => `action ${id} started`)];
    const refused = () => debug.filter((d) => /\] no (event|action|person) |: not possible/.test(d));
    // the params retry in game time for up to a minute
    for (let s = 0; s < 70 && !refused().length && !started.every((want) => debug.some((d) => d.includes(want))); s++) await read(page, (g) => g.advance(1));
    expect(refused()).toEqual([]);
    for (const want of started) expect(debug.join('\n')).toContain(want);
    expect(errors).toEqual([]);
  });
}
