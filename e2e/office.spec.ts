import { expect, openGame, read, test, until } from './game';

test('presence.homes-hash', async ({ page }) => {
  await openGame(page, 'homes');
  const homes = await read(page, (g) =>
    g.people.filter((p: { presence: string; awayKind: string }) => p.presence === 'out' && p.awayKind === 'home').map((p: { homeVariant: number }) => p.homeVariant),
  );
  // all eight regular rooms are taken (own rooms like the beach come on top)
  expect([...new Set(homes)].filter((v) => v < 8).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  await expect(page.locator('#feeds')).toBeVisible();
});

test('home.feeds: the feed list does not bounce past its ends (the overlays would leave their videos behind)', async ({ page }) => {
  const errors = await openGame(page, 'homes');
  const feeds = page.locator('#feeds');
  await expect(feeds).toBeVisible();
  expect(await feeds.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('none');
  expect(errors).toEqual([]);
});

test('select.actions + keys.home: select, send home, call back', async ({ page }) => {
  // 08:00: still home offices free (during the day all eight are usually taken, and the button is disabled)
  await openGame(page, '', 8);
  // somebody sitting quietly at a desk, on screen and not hidden behind a panel
  const target = await read(page, (g) => {
    const cam = g.views.camera;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const free = g.people.filter((p: any) => p.presence === 'in' && !p.talk && !p.held && !p.meetJob && p.sit > 0.9 && !p.member.homebody);
    const spots = free.map((p: any) => {
      const v = p.root.position.clone();
      v.y += 1.0;
      v.project(cam);
      return { id: p.id, x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    });
    return spots.filter((s: any) => s.x > w * 0.25 && s.x < w * 0.75 && s.y > h * 0.25 && s.y < h * 0.75);
  });
  expect(target.length).toBeGreaterThan(0);

  let picked: string | null = null;
  for (const t of target) {
    await page.mouse.click(t.x, t.y);
    // the click may hit somebody else (a pet lying next to its owner, a passer-by): only the aimed-at person counts
    const hit = await read(page, (g, id) => g.selected?.id === id && g.selected.presence === 'in', t.id);
    if (hit) {
      picked = t.id;
      break;
    }
    await page.keyboard.press('Escape');
  }
  expect(picked).not.toBeNull();
  await expect(page.locator('#actions')).toBeVisible();

  // a home office is free: the button is enabled
  expect(await read(page, (g) => g.presence.homeFull)).toBe(false);
  await expect(page.locator('#actions-home')).toBeEnabled();

  // the game refuses while the person is busy (in a chat): press again, half a game second later, until they set off
  let state = { presence: '', kind: '' };
  for (let tries = 0; tries < 40 && state.presence !== 'leaving'; tries++) {
    await page.locator('#actions-home').click();
    state = await read(page, (g, id) => {
      const o = g.people.find((q: any) => q.id === id);
      return { presence: o.presence, kind: o.awayKind };
    }, picked);
    if (state.presence !== 'leaving') await read(page, (g) => g.advance(0.5));
  }
  expect(state).toEqual({ presence: 'leaving', kind: 'home' });

  // H calls the selected person back (still selected: they are on the way to the door)
  expect(await read(page, (g) => g.selected?.id)).toBe(picked);
  await page.keyboard.press('h');
  await until(page, (g, id) => g.people.find((o: any) => o.id === id).presence === 'in', picked);
});

test('presence.door-flow: after "all back" people walk in one by one and move on from the entrance', async ({ page }) => {
  const errors = await openGame(page);
  expect(await read(page, (g) => g.presence.away.length)).toBeGreaterThanOrEqual(3);
  // the roster shares the dock with other panels and may start collapsed
  const roster = page.locator('#away');
  await expect(roster).toBeVisible();
  if (await roster.evaluate((el) => el.classList.contains('is-collapsed'))) await roster.locator('.m-away__title').click();
  // watch the arrivals every simulation step: how many come through the door at once, and where each one is 4 s after
  // stepping in. By day the office is full (presence.caps), so only a few get in: enough to see that they don't stay
  // in the entrance.
  await read(page, (g) => {
    const r = (g.allBack = { maxIn: 0, dists: [] as number[] });
    const inAt = new Map<unknown, number>();
    const last = new Map<unknown, string>();
    g.tickers.add(() => {
      const now = g.presence.clock;
      r.maxIn = Math.max(r.maxIn, g.people.filter((p: { presence: string }) => p.presence === 'returning').length);
      for (const p of g.people) {
        if (last.get(p) === 'returning' && p.presence === 'in') inAt.set(p, now);
        last.set(p, p.presence);
        const t = inAt.get(p);
        if (t !== undefined && now - t >= 4) {
          inAt.delete(p);
          r.dists.push(Math.hypot(p.pos.x - p.lane.in.x, p.pos.z - p.lane.in.z));
        }
      }
    });
  });
  await page.locator('#away-all').click();
  const r = await until(page, (g) => g.allBack.dists.length >= 1 && g.allBack, undefined, 120_000);
  expect(r.maxIn).toBeLessThanOrEqual(2);
  for (const d of r.dists) expect(d).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
