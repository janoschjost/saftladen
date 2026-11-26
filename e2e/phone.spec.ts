import type { CDPSession, Page } from '@playwright/test';
import { expect, openGame, read, scene, test } from './game';

// A phone, upright and sideways, with touch (`(hover: none)`); no slide-ins, the boxes are measured where they end up.
const PHONES = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
] as const;

/** What is always on screen (when there): title, clock, the bar, the action chip, the person card, the dock. */
const HUD = ['.m-hud-title', '#clock', '.m-hud-tools', '#now', '#actions', '#away', '#feeds', '#people-empty'];

type Box = { sel: string; x: number; y: number; width: number; height: number };

/** The boxes of the visible ones among `sels`. */
async function boxes(page: Page, sels: string[]): Promise<Box[]> {
  const out: Box[] = [];
  for (const sel of sels) {
    const el = page.locator(sel);
    if (!(await el.isVisible())) continue;
    out.push({ sel, ...(await el.boundingBox())! });
  }
  return out;
}

/** Each box inside the viewport and no two of them overlapping: a list of what is wrong, empty when all is well. */
async function layoutFaults(page: Page, sels = HUD): Promise<string[]> {
  const { width, height } = page.viewportSize()!;
  const all = await boxes(page, sels);
  const faults: string[] = [];
  const r = (n: number) => Math.round(n);
  for (const [i, a] of all.entries()) {
    if (r(a.x) < 0 || r(a.y) < 0 || r(a.x + a.width) > width || r(a.y + a.height) > height) faults.push(`${a.sel} leaves the screen`);
    for (const b of all.slice(i + 1)) {
      const apart = r(a.x + a.width) <= r(b.x) || r(b.x + b.width) <= r(a.x) || r(a.y + a.height) <= r(b.y) || r(b.y + b.height) <= r(a.y);
      if (!apart) faults.push(`${a.sel} overlaps ${b.sel}`);
    }
  }
  return faults;
}

/** One browser frame: poses and the overlay are set per frame (game time stands still). */
const frame = (page: Page) => read(page, () => new Promise<void>((r) => requestAnimationFrame(() => r())));

/** Where somebody's body is on screen (px): the middle of it. */
const onScreen = (page: Page, id: string) =>
  read(page, (g, who) => {
    const p = g.sim.person(who);
    const v = p.root.position.clone();
    v.y += p.headHeight / 2;
    v.project(g.views.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }, id);

const WHO = 'oriana-pontieri'; // no pets: they would stand next to her

/** Sends everybody else out, puts WHO on a floor cell in the middle of the screen; returns where she is (px). */
async function standAlone(page: Page): Promise<{ x: number; y: number }> {
  const others = await read(page, (g, id) => g.sim.people.filter((p) => p.id !== id).map((p) => p.id), WHO);
  await scene(page, (s, ids) => ids.forEach((id) => s.put(id, 'errand')), others);
  const spot = await read(page, (g, id) => {
    const cam = g.views.camera;
    const px = (x: number, y: number, z: number) => {
      const p = cam.position.clone().set(x, y, z).project(cam);
      return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
    };
    const others = g.sim.walkers.filter((w) => !w.away && w.id !== id).map((w) => px(w.root.position.x, w.headHeight / 2, w.root.position.z));
    const nav = g.sim.nav;
    for (let cz = 0; cz < nav.rows; cz++) {
      for (let cx = 0; cx < nav.cols; cx++) {
        if (!nav.walkable(cx, cz)) continue;
        const c = nav.center(cx, cz);
        const s = px(c.x, 0.9, c.z);
        const central = s.x > innerWidth * 0.3 && s.x < innerWidth * 0.7 && s.y > innerHeight * 0.35 && s.y < innerHeight * 0.6;
        if (central && others.every((o) => Math.hypot(o.x - s.x, o.y - s.y) > 120)) return c;
      }
    }
    return null;
  }, WHO);
  expect(spot).not.toBeNull();
  await scene(page, (s, a) => s.put(a.id, a.at, 'pin'), { id: WHO, at: spot! });
  await frame(page);
  return onScreen(page, WHO);
}

/** Fingers on the screen (CDP touch events: Chrome makes pointer events and, for a tap, a click of them). */
async function touch(cdp: CDPSession, type: 'touchStart' | 'touchMove' | 'touchEnd', points: Array<{ x: number; y: number }>) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
}

/** A finger drag from `from` by (dx, dy) in a few steps. */
async function swipe(cdp: CDPSession, from: { x: number; y: number }, dx: number, dy: number) {
  await touch(cdp, 'touchStart', [from]);
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ x: from.x + (dx * i) / 5, y: from.y + (dy * i) / 5 }]);
  await touch(cdp, 'touchEnd', []);
}

/** Two fingers around `at` spreading from `from` to `to` px apart (horizontally). */
async function pinch(cdp: CDPSession, at: { x: number; y: number }, from: number, to: number) {
  const pair = (d: number) => [{ x: at.x - d / 2, y: at.y }, { x: at.x + d / 2, y: at.y }];
  await touch(cdp, 'touchStart', pair(from));
  for (let i = 1; i <= 6; i++) await touch(cdp, 'touchMove', pair(from + ((to - from) * i) / 6));
  await touch(cdp, 'touchEnd', []);
}

const distance = (page: Page) => read(page, (g) => g.views.orbitShot.dist);

for (const phone of PHONES) {
  test.describe(`phone ${phone.name}`, () => {
    test.use({ viewport: phone.viewport, hasTouch: true, reducedMotion: 'reduce' });

    for (const [hour, query, when] of [[11, '', 'by day'], [22, '', 'at night'], [11, 'action=printer', 'during an action']] as const) {
      test(`hud.phone: nothing of the HUD overlaps or leaves the screen ${when}`, async ({ page }) => {
        const errors = await openGame(page, '', hour, query);
        if (query) await expect(page.locator('#now')).toBeVisible();
        // the dock starts folded; each panel opens downwards, clear of the rest (one at a time)
        await expect(page.locator('#away')).toHaveClass(/is-collapsed/);
        await expect(page.locator('#feeds')).toHaveClass(/is-collapsed/);
        expect(await layoutFaults(page), `${hour}h ${query}`).toEqual([]);
        for (const panel of ['#away', '#feeds']) {
          if (!(await page.locator(panel).isVisible())) continue;
          await page.locator(`${panel} .m-collapse`).click();
          await expect(page.locator(panel)).not.toHaveClass(/is-collapsed/);
          expect(await layoutFaults(page), `${hour}h ${query} ${panel} open`).toEqual([]);
          await page.locator(`${panel} .m-collapse`).click(); // its chevron is still in reach
          await expect(page.locator(panel)).toHaveClass(/is-collapsed/);
        }
        expect(errors).toEqual([]);
      });
    }

    test('hud.phone: one bar holds Ansicht, Wetter, Einstellungen and Aktionen, each a 44 px target', async ({ page }) => {
      const errors = await openGame(page);
      const bar = (await page.locator('.m-hud-tools').boundingBox())!;
      for (const id of ['#cycle-view', '#open-env', '#open-settings', '#open-actions']) {
        const b = (await page.locator(id).boundingBox())!;
        expect(b.height, id).toBeGreaterThanOrEqual(44);
        expect(b.width, id).toBeGreaterThanOrEqual(44);
        // inside the bar
        expect(b.x >= bar.x && b.y >= bar.y && b.x + b.width <= bar.x + bar.width + 0.5 && b.y + b.height <= bar.y + bar.height + 0.5, id).toBe(true);
      }
      expect(bar.height).toBeLessThan(56);
      await expect(page.locator('#open-help')).toBeHidden();
      // the view button steps through Iso, Orbit and Grundriss
      const views: string[] = [];
      for (let i = 0; i < 3; i++) {
        await page.locator('#cycle-view').click();
        views.push(await read(page, (g) => g.views.mode));
      }
      expect(views).toEqual(['plan', 'iso', 'orbit']);
      expect(errors).toEqual([]);
    });

    test('hud.phone: the welcome card fits on the screen, "Los geht\'s" in reach', async ({ page }) => {
      const errors = await openGame(page, '', 11, 'welcome=1');
      const { width, height } = page.viewportSize()!;
      const card = (await page.locator('.m-welcome__card').boundingBox())!;
      expect(card.x >= 0 && card.y >= 0 && card.x + card.width <= width && card.y + card.height <= height).toBe(true);
      await page.locator('#welcome-start').click(); // in the viewport and not covered, or the click fails
      await expect(page.locator('#welcome')).toBeHidden();
      expect(errors).toEqual([]);
    });

    test('hud.phone: the dev panel is a bottom sheet on the screen, its × in reach', async ({ page }) => {
      const errors = await openGame(page);
      const { width, height } = page.viewportSize()!;
      await page.locator('#open-settings').click();
      await page.locator('#open-dev').click();
      await expect(page.locator('#dev')).toBeVisible();
      const dev = (await page.locator('#dev').boundingBox())!;
      expect(dev.x >= 0 && dev.y >= 0 && dev.x + dev.width <= width && Math.round(dev.y + dev.height) <= height).toBe(true);
      await page.locator('#dev-close').click();
      await expect(page.locator('#dev')).toBeHidden();
      expect(errors).toEqual([]);
    });

    test('view.walk: no Rundgang on a touch screen; #walk and #walk@x,z,yaw open Orbit', async ({ page }) => {
      for (const hash of ['walk', 'walk@20,7,1.57']) {
        const errors = await openGame(page, hash);
        expect(await read(page, (g) => g.views.mode)).toBe('orbit');
        await expect(page.locator('#walk-exit')).toBeHidden();
        expect(errors).toEqual([]);
      }
      await page.locator('#open-settings').click();
      await expect(page.locator('#settings input[value="walk"]').locator('xpath=..')).toBeHidden();
      await page.locator('#settings-close').click();
      await page.locator('#cycle-view').click(); // Grundriss
      await page.keyboard.press('4'); // a keyboard on a tablet: no walk view, the view stays
      expect(await read(page, (g) => g.views.mode)).toBe('plan');
    });

    test('editor.toggle: the room editor is not reachable on a touch screen', async ({ page }) => {
      const errors = await openGame(page);
      await page.locator('#open-settings').click();
      await expect(page.locator('#open-editor')).toBeHidden();
      await page.locator('#settings-close').click();
      await page.keyboard.press('e');
      expect(await read(page, (g) => g.editor.active)).toBe(false);
      await expect(page.locator('#editor')).toBeHidden();
      expect(errors).toEqual([]);
    });

    test('view.touch: the page neither scrolls nor zooms', async ({ page }) => {
      const errors = await openGame(page);
      await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /user-scalable=no/);
      const doc = await page.evaluate(() => ({
        body: getComputedStyle(document.body).touchAction,
        stage: getComputedStyle(document.getElementById('stage')!).touchAction,
        overscroll: getComputedStyle(document.body).overscrollBehaviorY,
        scrolls: document.scrollingElement!.scrollHeight > innerHeight || document.scrollingElement!.scrollWidth > innerWidth,
      }));
      expect(doc).toEqual({ body: 'pan-x pan-y', stage: 'none', overscroll: 'none', scrolls: false });
      expect(errors).toEqual([]);
    });

    test('view.touch: a tap selects a person, a tap on the floor deselects, a drag selects nobody', async ({ page }) => {
      const errors = await openGame(page);
      const cdp = await page.context().newCDPSession(page);
      const at = await standAlone(page);
      const selected = () => read(page, (g) => g.selected?.id ?? null);
      // a fingertip just beside her still picks her
      await page.touchscreen.tap(at.x + 30, at.y);
      expect(await selected()).toBe(WHO);
      // the camera follows her now: aim again, at open floor well away from her (not on the HUD or the person card)
      await frame(page);
      const now = await onScreen(page, WHO);
      const floor = await page.evaluate((c) => {
        for (const [dx, dy] of [[-150, 0], [0, -150], [150, 0], [0, 150]]) {
          const p = { x: c.x + dx, y: c.y + dy };
          if (document.elementFromPoint(p.x, p.y)?.tagName === 'CANVAS') return p;
        }
        return null;
      }, now);
      expect(floor).not.toBeNull();
      await page.touchscreen.tap(floor!.x, floor!.y);
      expect(await selected()).toBeNull();
      // a swipe that starts on her turns the camera: nobody gets selected, nobody is carried
      const pos = () => read(page, (g, id) => ({ x: g.sim.person(id).pos.x, z: g.sim.person(id).pos.z }), WHO);
      const before = await pos();
      await swipe(cdp, now, -120, 0);
      expect(await selected()).toBeNull();
      expect(await pos()).toEqual(before);
      expect(errors).toEqual([]);
    });

    test('view.touch: Orbit turns with one finger and zooms with two; Iso pans with one and zooms with two', async ({ page }) => {
      const errors = await openGame(page, 'orbit');
      const cdp = await page.context().newCDPSession(page);
      const { width, height } = page.viewportSize()!;
      const mid = { x: width / 2, y: height / 2 };
      const azimuth = () => read(page, (g) => g.views.orbitShot.azimuth);
      const az = await azimuth();
      await swipe(cdp, { x: mid.x - 80, y: mid.y }, 160, 0);
      await frame(page);
      expect(Math.abs((await azimuth()) - az)).toBeGreaterThan(0.1);
      const far = await distance(page);
      await pinch(cdp, mid, 80, 260);
      for (let i = 0; i < 10; i++) await frame(page); // the controls ease
      expect(await distance(page)).toBeLessThan(far * 0.9);

      await page.locator('#cycle-view').click();
      await page.locator('#cycle-view').click(); // Grundriss, then Iso
      expect(await read(page, (g) => g.views.mode)).toBe('iso');
      const iso = () => read(page, (g) => g.views.iso.getState());
      const start = await iso();
      await swipe(cdp, { x: mid.x, y: mid.y }, 120, 0);
      const panned = await iso();
      expect(Math.hypot(panned.x - start.x, panned.z - start.z)).toBeGreaterThan(0.5);
      expect(panned.zoom).toBe(start.zoom);
      await pinch(cdp, mid, 80, 240);
      expect((await iso()).zoom).toBeGreaterThan(start.zoom * 1.5);
      expect(await read(page, (g) => g.selected)).toBeNull();
      expect(errors).toEqual([]);
    });
  });
}

test('hud.phone: a desktop keeps its controls: no view button, Aktionen alone in the bottom centre', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('#cycle-view')).toBeHidden();
  await expect(page.locator('#open-help')).toBeVisible();
  const { width } = page.viewportSize()!;
  const act = (await page.locator('#open-actions').boundingBox())!;
  expect(Math.abs(act.x + act.width / 2 - width / 2)).toBeLessThan(1);
  const tools = (await page.locator('.m-hud-tools').boundingBox())!;
  expect(tools.x + tools.width).toBeLessThan(act.x); // gear, sun and ? bottom left, apart from it
  expect(await page.locator('.m-hud-tools').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});
