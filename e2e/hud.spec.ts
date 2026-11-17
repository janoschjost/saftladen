import { expect, openGame, read, scene, test, until } from './game';

// Few page loads on purpose: every openGame costs seconds on a CI runner.

test('hud.minimal + hud.modes: only title, gear, Aktionen and the key line; Rundgang has its own way back', async ({ page }) => {
  const errors = await openGame(page);
  await expect(page.locator('.m-hud-title')).toBeVisible();
  await expect(page.locator('#help')).toBeVisible();
  // status chips: top centre, black, level with the gear button
  const chip = page.locator('.m-hud-title__chip').first();
  await expect(chip).toBeVisible();
  expect((await chip.boundingBox())!.y).toBe((await page.locator('#open-settings').boundingBox())!.y);
  await expect(chip).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  for (const id of ['#open-env', '#open-settings', '#open-actions']) {
    const box = await page.locator(id).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  for (const id of ['#settings', '#env', '#action-sheet', '#seats', '#dev', '#editor', '#now', '#walk-exit']) await expect(page.locator(id)).toBeHidden();
  // hud.people: the Leute dock is always there, not behind a switch
  await expect(page.locator('#people')).toBeVisible();
  await expect(page.locator('#open-people')).toHaveCount(0);
  // the old toolbar and view bar are gone
  await expect(page.locator('.m-toolbar, .m-viewbar, .m-tool, #toggle-settings, #toggle-names')).toHaveCount(0);

  // Rundgang: no gear, no Aktionen (A does nothing), a button back
  await page.keyboard.press('4');
  await expect(page.locator('#open-settings')).toBeHidden();
  await expect(page.locator('#open-env')).toBeHidden();
  await expect(page.locator('#open-actions')).toBeHidden();
  await page.keyboard.press('a');
  await expect(page.locator('#action-sheet')).toBeHidden();
  await page.locator('#walk-exit').click();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  await expect(page.locator('#open-actions')).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe('hud.settings', () => {
  test.use({ reducedMotion: 'reduce' });

  test('gear and "," open the popover; Esc, outside click and × close it; view, weather, names, follow; links', async ({ page }) => {
    await openGame(page);
    const pop = page.locator('#settings');
    const gear = page.locator('#open-settings');
    await gear.click();
    await expect(pop).toBeVisible();
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    // under the gear
    const g = (await gear.boundingBox())!;
    const p = (await pop.boundingBox())!;
    expect(p.y).toBeGreaterThan(g.y + g.height - 1);
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press(',');
    await expect(pop).toBeVisible();
    await page.mouse.click(400, 600); // the office, outside the popover
    await expect(pop).toBeHidden();
    await gear.click();
    await page.locator('#settings-close').click();
    await expect(pop).toBeHidden();

    // view segments; keys still switch the view and the segments follow
    await gear.click();
    await page.locator('#settings label:has(input[value="iso"])').click();
    expect(await read(page, (g) => g.views.mode)).toBe('iso');
    await page.locator('#settings label:has(input[value="plan"])').click();
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
    await page.keyboard.press('Escape');
    await page.keyboard.press('2');
    await gear.click();
    await expect(page.locator('#settings input[value="orbit"]')).toBeChecked();
    // the view segments show their key numbers
    await expect(page.locator('#settings .m-settings__segment--view .m-settings__key')).toHaveText(['1', '2', '3', '4']);

    // the sun button next to the gear: weather, time of day, Zeit läuft, Weihnachten; one popover at a time
    const sun = page.locator('#open-env');
    const env = page.locator('#env');
    await sun.click();
    await expect(env).toBeVisible();
    await expect(pop).toBeHidden();
    const s = (await sun.boundingBox())!;
    const e = (await env.boundingBox())!;
    expect(e.y).toBeGreaterThan(s.y + s.height - 1);
    await env.locator('label:has(input[value="rain"])').click();
    expect(await read(page, (g) => g.sim.weather.mode)).toBe('rain');
    const slider = env.locator('#time-slider');
    await slider.evaluate((el: HTMLInputElement) => {
      el.value = '500';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(await read(page, (g) => Math.round(g.sim.tod.cycle * 1000))).toBe(500);
    await expect(env.locator('#time-ticks li')).toHaveText(['0', '6', '12', '18', '24']);
    // the clock output follows in the next frame (slow on CI)
    await expect(env.locator('#time-clock')).toHaveText(await read(page, (g) => g.sim.tod.clock), { timeout: 30_000 });
    await expect(env.locator('#time-clock')).not.toHaveText('11:00');
    await page.keyboard.press('Escape');
    await expect(env).toBeHidden();
    await gear.click();
    await sun.click();
    await expect(pop).toBeHidden();
    await expect(env).toBeVisible();
    await page.locator('#env-close').click();
    await expect(env).toBeHidden();
    await gear.click();
    // names, follow; remembered in saftladen.settings
    await page.locator('#setting-names').setChecked(true);
    expect(await read(page, (g) => g.namesVisible)).toBe(true);
    await page.locator('#setting-follow').setChecked(false);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('saftladen.settings') ?? '{}'));
    expect(saved).toMatchObject({ weather: 'rain', follow: false });

    // the links open the panels that stay, the popover makes room
    for (const [link, panel] of [
      ['#open-seats', '#seats'],
      ['#open-dev', '#dev'],
      ['#open-editor', '#editor'],
      ['#open-picker', '#picker'],
    ]) {
      if (!(await pop.isVisible())) await gear.click();
      await page.locator(link).click();
      await expect(pop).toBeHidden();
      await expect(page.locator(panel)).toBeVisible();
    }
  });
});

test('keys.dev: the dev panel has a close button', async ({ page }) => {
  await openGame(page);
  await page.keyboard.press('`');
  await expect(page.locator('#dev')).toBeVisible();
  await page.locator('#dev-close').click();
  await expect(page.locator('#dev')).toBeHidden();
});

test('actions.sheet + actions.search: A toggles the sheet, previews, number keys, search, Esc', async ({ page }) => {
  await openGame(page);
  await scene(page, (s) => s.clear('printer', 'coffee', 'kitchen'));
  const sheet = page.locator('#action-sheet');
  await page.keyboard.press('a');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveClass(/is-open/);
  await expect(page.locator('#open-actions')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#action-cards .m-card')).toHaveCount(16);
  await expect(page.locator('#action-cards .m-card').first()).toContainText('Drucken');
  await expect(page.locator('#action-cards .m-card__key').first()).toHaveText('1');
  // every other dev event is listed without typing anything
  await expect(page.locator('#action-more [data-event="rain"]')).toBeVisible();
  // every card has its still: the image of the people doing the action loaded
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLImageElement>('#action-cards img')].filter((i) => i.complete && i.naturalWidth > 0).length), { timeout: 30_000 })
    .toBe(16);
  // Esc closes the sheet and does nothing else
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  await page.locator('#open-actions').click();
  await expect(sheet).toBeVisible();
  await page.locator('#action-sheet-close').click();
  await expect(sheet).toBeHidden();

  // search: filters the cards, lists the other dev events, a pick runs it
  await page.keyboard.press('a');
  await page.locator('#action-search').fill('kick');
  await expect(page.locator('#action-cards .m-card:visible')).toHaveCount(1);
  await page.locator('#action-search').fill('regen');
  await expect(page.locator('#action-cards .m-card:visible')).toHaveCount(0);
  const entry = page.locator('#action-more [data-event="rain"]');
  await expect(entry).toBeVisible();
  const before = await read(page, (g) => g.sim.weather.raining);
  await entry.click();
  await expect(sheet).toBeHidden();
  expect(await read(page, (g) => g.sim.weather.raining)).toBe(!before);
  await expect(page.locator('#now')).toBeVisible();

  // number keys start cards instead of switching the view
  await page.keyboard.press('a');
  await page.locator('#action-search').fill('');
  await page.locator('#action-cards .m-card').first().focus();
  await page.keyboard.press('3'); // Kaffee, not the plan view
  await expect(sheet).toBeHidden();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  await until(page, (g) => g.sim.kitchen.current);
});

test('actions.camera + actions.handback: Drucken flies to Orbit and follows the lead; a wheel hands back, Esc flies to the overview', async ({ page }) => {
  await openGame(page);
  await scene(page, (s) => s.clear('printer', 'coffee', 'kitchen'));
  await page.keyboard.press('1'); // from Iso
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="printer"]').click();
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  const a = await read(page, (g) => g.action && { printing: !!g.action.lead?.printJob, owned: g.action.owned });
  expect(a).toMatchObject({ printing: true, owned: true });
  expect(await read(page, (g) => g.views.flying)).toBe(true);
  await expect(page.locator('#now')).toBeVisible();
  await expect(page.locator('#now-caption')).toContainText('druckt');
  await expect(page.locator('#now-follow')).toHaveAttribute('aria-pressed', 'true');
  // the camera closes in on the lead (or has already settled on the printer): well under the overview distance
  await until(
    page,
    (g) => {
      const s = g.views.orbitShot;
      const p = g.action?.lead?.root.position;
      return p && Math.hypot(s.x - p.x, s.z - p.z) < 3 && s.dist < g.views.overviewShot().dist * 0.6;
    },
    undefined,
    60_000,
  );

  // a wheel on the office hands the camera back
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 200);
  await until(page, (g) => g.action && !g.action.owned);
  await expect(page.locator('#now-follow')).toHaveAttribute('aria-pressed', 'false');
  expect(await read(page, (g) => g.views.flying)).toBe(false);
  // Folgen takes it again
  await page.locator('#now-follow').click();
  expect(await read(page, (g) => g.action?.owned)).toBe(true);

  // Esc: follow off, back to the overview
  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.action)).toBeNull();
  await expect(page.locator('#now')).toBeHidden();
  await until(page, (g) => !g.views.flying && Math.abs(g.views.orbitShot.dist - g.views.overviewShot().dist) < 0.5, undefined, 60_000);
});

test('actions.fail: an action that cannot run (everybody held by a scene) says so and leaves the camera alone', async ({ page }) => {
  await openGame(page, 'iso');
  const everybody = await read(page, (g) => g.sim.people.map((p) => p.id));
  await scene(page, (s, ids) => ids.forEach((id) => s.put(id, 'errand')), everybody);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="pod"]').click();
  await expect(page.locator('#now')).toBeVisible();
  await expect(page.locator('#now-caption')).toHaveText('Holzhaus: nicht möglich');
  expect(await read(page, (g) => [g.views.mode, g.action, g.views.flying])).toEqual(['iso', null, false]);
});

test('actions.force: an action asked for happens: a taken place is cleared, a dev who is away comes in', async ({ page }) => {
  await openGame(page, 'iso', undefined, 'event=pod');
  await until(page, (g) => g.sim.pod.current);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="pod"]').click();
  await expect(page.locator('#now-caption')).not.toContainText('nicht möglich');
  // no dev in the office: one comes in to fix the rack
  await page.keyboard.press('Escape');
  const devs = await read(page, (g) => g.sim.people.filter((p) => p.member.look.nerf).map((p) => p.id));
  await scene(page, (s, ids) => ids.forEach((id) => s.put(id, 'errand', 'free')), devs);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="server-rack"]').click();
  await expect(page.locator('#now-caption')).not.toContainText('nicht möglich');
  expect(await read(page, (g) => g.sim.serverRack.state)).toBe('broken');
});

// The card path to the event (`Game.startAction`): the card, the chip, and the people the event pulled out of their
// chairs. What the event does from there (they stand up, walk, nobody glides sitting): src/game/simEvents.test.ts
test('place.meeting: the Meeting card starts a meeting with the people at their desks and pulls them out of their chairs', async ({ page }) => {
  const errors = await openGame(page);
  const crew = ['oscar-grob', 'andrew-jelley', 'linda-peter', 'milica-rakic', 'alyosha-krajnc'];
  // only these five are in the office, so the card can pick nobody else
  const everybody = await read(page, (g) => g.sim.people.map((p) => p.id));
  await scene(page, (s, [all, ids]) => all.forEach((id) => (ids.includes(id) ? s.put(id, 'desk', 'stay') : s.put(id, 'errand'))), [everybody, crew] as const);
  await until(page, (g, ids) => g.sim.people.filter((p) => ids.includes(p.id) && p.sit > 0.9).length === ids.length, crew);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="meeting"]').click();
  await expect(page.locator('#now-caption')).toContainText('Besprechung');
  const members = await read(page, (g) => g.sim.meetingRoom.current?.members.map((p) => [p.id, p.task?.phase !== 'work']).sort());
  expect(members).toEqual([...crew].sort().map((id) => [id, true]));
  expect(errors).toEqual([]);
});

test.describe('actions.touch', () => {
  // no slide-in: the boxes are measured where they end up
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });

  test('phone: settings and Aktionen are bottom sheets, two cards per row, 44 px targets, no key hints', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#help')).toBeHidden();
    await expect(page.locator('.m-action-button__key')).toBeHidden();
    await page.locator('#open-settings').click();
    const pop = (await page.locator('#settings').boundingBox())!;
    expect([Math.round(pop.y + pop.height), Math.round(pop.width)]).toEqual([844, 390]); // docked to the bottom, full width
    for (const sel of ['#settings-close', '#settings label:has(input[value="iso"]) span', '#open-seats']) {
      expect((await page.locator(sel).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator('#settings-close').click();
    // the environment popover is a bottom sheet too, with a slider big enough for a thumb
    await page.locator('#open-env').click();
    const env = (await page.locator('#env').boundingBox())!;
    expect([Math.round(env.y + env.height), Math.round(env.width)]).toEqual([844, 390]);
    expect((await page.locator('#time-slider').boundingBox())!.height).toBeGreaterThanOrEqual(32);
    await page.locator('#env-close').click();
    // the dock (Leute) starts folded, it would cover the office
    await expect(page.locator('#feeds')).toHaveClass(/is-collapsed/);

    await page.locator('#open-actions').click();
    await expect(page.locator('#action-sheet')).toHaveClass(/is-open/);
    const cards = page.locator('#action-cards .m-card');
    const [a, b, c] = await Promise.all([0, 1, 2].map(async (i) => (await cards.nth(i).boundingBox())!));
    expect(Math.round(a.y)).toBe(Math.round(b.y)); // side by side
    expect(c.y).toBeGreaterThan(a.y + a.height - 1); // the third starts the next row
    expect(a.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('.m-card__key').first()).toBeHidden();
  });
});
