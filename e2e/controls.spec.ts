import { expect, test, type Page } from '@playwright/test';
import { openGame, read, until } from './game';

/** Selects somebody who is in the office by their row in the Leute tab; leaves the panel open. */
async function selectFromRoster(page: Page): Promise<string> {
  await page.locator('#toggle-people').click();
  await page.locator('#office-list li button').first().click();
  // the selection holds (a person who is still fading in or out is dropped by the game)
  await page.waitForTimeout(300);
  const id = await read(page, (g) => g.selected?.id as string | undefined);
  expect(id).toBeTruthy();
  return id as string;
}

test.describe('ui.dock', () => {
  test('views are pressed with their keys and clicks; Rundgang hides the dock', async ({ page }) => {
    await openGame(page);
    const dock = page.locator('#dock');
    await expect(dock).toBeVisible();
    await expect(dock).toHaveAttribute('role', 'toolbar');
    await expect(page.locator('button[data-view="orbit"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('1');
    await expect(page.locator('button[data-view="iso"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button[data-view="orbit"]')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('button[data-view="plan"]').click();
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
    await page.keyboard.press('4');
    await expect(dock).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(dock).toBeVisible();
  });

  test('tooltips show label and key', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('button[data-view="iso"]')).toHaveAttribute('data-tip', 'Iso (1)');
    await expect(page.locator('#toggle-names')).toHaveAttribute('data-tip', 'Namen (N)');
    await expect(page.locator('#toggle-editor')).toHaveAttribute('data-tip', 'Raum bearbeiten (E)');
  });

  test('Ein Tag im Leben hides the dock', async ({ page }) => {
    await openGame(page);
    await page.locator('#open-day').click();
    await page.locator('#day-menu-start').click();
    await expect(page.locator('#dock')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dock')).toBeVisible();
  });
});

test.describe('ui.timeline', () => {
  test('the clock chip opens the strip; dragging the track sets the time', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#timeline')).toBeHidden();
    await page.locator('#dock-clock').click();
    await expect(page.locator('#timeline')).toBeVisible();
    await expect(page.locator('#dock-time')).toHaveText(/^\d\d:\d\d$/);
    // 15:00 on the 24 h track
    await page.locator('#timeline-range').evaluate((el: HTMLInputElement) => {
      el.value = String(15 * 60);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(Math.round(await read(page, (g) => g.tod.hour))).toBe(15);
    await expect(page.locator('#dock-time')).toHaveText('15:00');
    // keyboard: arrows move the handle
    await page.locator('#timeline-range').focus();
    await page.keyboard.press('ArrowRight');
    expect(await read(page, (g) => g.tod.hour)).toBeGreaterThan(15);
    await page.locator('#dock-clock').click();
    await expect(page.locator('#timeline')).toBeHidden();
  });

  test('event markers jump to their time; Auto / Pause and weather work', async ({ page }) => {
    await openGame(page);
    await page.locator('#dock-clock').click();
    await page.locator('.m-timeline__marker', { hasText: 'Feierabend' }).click();
    expect(await read(page, (g) => g.tod.clock)).toBe('17:30');
    // the strip's Auto / Pause button is the old auto switch (and its saved setting)
    const auto = await read(page, (g) => g.tod.auto);
    await page.locator('#timeline-auto').click();
    expect(await read(page, (g) => g.tod.auto)).toBe(!auto);
    expect(await page.evaluate(() => localStorage.getItem('saftladen.time.auto'))).toBe(auto ? '0' : '1');
    await page.locator('.m-segment', { hasText: 'Regen' }).click();
    expect(await read(page, (g) => g.weather.mode)).toBe('rain');
    await page.locator('.m-segment', { hasText: 'Trocken' }).click();
    expect(await read(page, (g) => g.weather.mode)).toBe('sun');
  });

  test('the Umgebung tab has the switches but no time or weather controls', async ({ page }) => {
    await openGame(page);
    await page.locator('#toggle-people').click();
    await page.locator('#tab-env').click();
    await expect(page.locator('#setting-xmas')).toBeVisible();
    await expect(page.locator('#setting-tables')).toBeVisible();
    await expect(page.locator('#panel-env input[type="range"]')).toHaveCount(0);
    await expect(page.locator('#panel-env input[name="setting-weather"]')).toHaveCount(0);
  });
});

test.describe('ui.palette', () => {
  test('Ctrl/Cmd+K opens it, typing filters, Enter runs, Esc closes', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#palette')).toBeHidden();
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('#palette')).toBeVisible();
    await expect(page.locator('#palette-input')).toBeFocused();
    await expect(page.locator('#palette .m-palette__group').first()).toHaveText('Ansicht');

    await page.keyboard.type('grundr');
    await expect(page.locator('.m-palette__item')).toHaveCount(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('#palette')).toBeHidden();
    expect(await read(page, (g) => g.views.mode)).toBe('plan');

    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('zzzzqq');
    await expect(page.locator('#palette-empty')).toBeVisible();
    await expect(page.locator('#palette-empty')).toHaveText('Nichts gefunden.');
    await page.keyboard.press('Escape');
    await expect(page.locator('#palette')).toBeHidden();
  });

  test('arrow keys move the highlight; the dim layer and the Befehle button close and open it', async ({ page }) => {
    await openGame(page);
    await page.locator('#open-palette').click();
    await expect(page.locator('#palette')).toBeVisible();
    const first = page.locator('.m-palette__item').nth(0);
    const second = page.locator('.m-palette__item').nth(1);
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(second).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await page.mouse.click(5, 450);
    await expect(page.locator('#palette')).toBeHidden();
  });

  test('runs a dev event and selects a person', async ({ page }) => {
    await openGame(page);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('Kaffeepause');
    await page.keyboard.press('Enter');
    await until(page, (g) => g.kitchen.current, undefined, 30_000);

    const name = await read(page, (g) => g.people.find((p: any) => p.inOffice).member.name as string);
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type(name);
    await page.locator('.m-palette__item', { hasText: name }).first().click();
    expect(await read(page, (g) => g.selected?.member?.name)).toBe(name);
    expect(await read(page, (g) => g.followed?.member?.name)).toBe(name);
  });
});

test.describe('ui.radial', () => {
  test('shows on the selected person; Folgen and Steuern work and show pressed; Home is disabled while all home offices are taken', async ({ page }) => {
    await openGame(page); // 11:00, all home offices taken
    await expect(page.locator('#radial')).toBeHidden();
    const id = await selectFromRoster(page);
    const radial = page.locator('#radial');
    await expect(radial).toBeVisible();
    await expect(radial.locator('[data-act]')).toHaveCount(5);
    // the ring hangs on the person on screen
    const box = await radial.locator('.m-radial__ring').boundingBox();
    expect(box?.width).toBeGreaterThan(50);

    // Folgen starts right away when somebody is selected; the button ends it
    await expect(radial.locator('[data-act="follow"]')).toHaveAttribute('aria-pressed', 'true');
    await radial.locator('[data-act="follow"]').click();
    expect(await read(page, (g) => g.followed)).toBeNull();
    await page.keyboard.press('f');
    expect(await read(page, (g) => g.followed?.id)).toBe(id);
    await expect(radial.locator('[data-act="follow"]')).toHaveAttribute('aria-pressed', 'true');

    await radial.locator('[data-act="steer"]').click();
    expect(await read(page, (g) => g.steered?.id)).toBe(id);
    await expect(radial.locator('[data-act="steer"]')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('c');
    expect(await read(page, (g) => g.steered)).toBeNull();
    await expect(radial.locator('[data-act="steer"]')).toHaveAttribute('aria-pressed', 'false');

    await expect(radial.locator('[data-act="home"]')).toBeDisabled();
    await expect(radial.locator('[data-act="home"]')).toHaveAttribute('title', 'Alle Homeoffices sind besetzt');
  });

  test('Home and Raus send the person off and show pressed; pressing again takes them back', async ({ page }) => {
    await openGame(page, '', 8); // 08:00: home offices are still free
    // somebody who stays put at the start: not away, not homebody, not about to leave
    const id = await read(page, (g) => g.people.find((p: any) => p.presence === 'in' && !p.away && !p.member.homebody && !p.held)?.id as string);
    await page.locator('#toggle-people').click();
    await page.locator(`#office-list button[data-id="${id}"]`).click();
    const radial = page.locator('#radial');
    await expect(radial).toBeVisible();
    await expect(radial.locator('[data-act="home"]')).toBeEnabled();
    // the game refuses while the person is busy (a chat may start in the meantime): press again until they set off
    await expect(async () => {
      await radial.locator('[data-act="out"]').click();
      expect(await read(page, (g, pid) => g.people.find((p: any) => p.id === pid).presence, id)).toBe('leaving');
    }).toPass({ timeout: 20_000, intervals: [500] });
    await expect(radial.locator('[data-act="out"]')).toHaveAttribute('aria-pressed', 'true');
    await radial.locator('[data-act="out"]').click();
    await until(page, (g, pid) => g.people.find((p: any) => p.id === pid).presence === 'in', id, 30_000);
  });

  test('is not shown in Rundgang or for nobody', async ({ page }) => {
    await openGame(page);
    await selectFromRoster(page);
    await expect(page.locator('#radial')).toBeVisible();
    await page.keyboard.press('4');
    await expect(page.locator('#radial')).toBeHidden();
  });
});

test.describe('ui.side-panel', () => {
  test('five tabs, one panel at a time; the scene shrinks instead of being covered', async ({ page }) => {
    await openGame(page);
    const side = page.locator('#side');
    await expect(side).toBeHidden();
    const full = await read(page, (g) => g.viewW as number);
    await page.locator('#toggle-seats').click();
    await expect(side).toBeVisible();
    await expect(page.locator('#panel-seats')).toBeVisible();
    await expect(page.locator('#panel-people')).toBeHidden();
    expect(await read(page, (g) => g.viewW as number)).toBeLessThan(full);
    // the stage (pointer area) ends where the panel starts
    const stage = await page.locator('#stage').boundingBox();
    const panel = await side.boundingBox();
    expect(stage!.x + stage!.width).toBeLessThanOrEqual(panel!.x + 1);

    for (const tab of ['people', 'env', 'editor', 'dev', 'seats']) {
      await page.locator(`#tab-${tab}`).click();
      await expect(page.locator(`#panel-${tab}`)).toBeVisible();
      await expect(page.locator('.m-side__panel:visible')).toHaveCount(1);
      await expect(page.locator(`#tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    }
    // the second click on the active dock button closes
    await page.locator('#toggle-seats').click();
    await expect(side).toBeHidden();
    expect(await read(page, (g) => g.viewW as number)).toBe(full);
    // the backtick opens the Dev tab, Esc closes
    await page.keyboard.press('`');
    await expect(page.locator('#panel-dev')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(side).toBeHidden();
  });

  test('Leute tab: roster, selection card, away list', async ({ page }) => {
    await openGame(page);
    await page.locator('#toggle-people').click();
    await expect(page.locator('#people-hint')).toBeVisible();
    const inOffice = await read(page, (g) => g.people.filter((p: any) => p.inOffice && !p.away).length as number);
    await expect(page.locator('#office-list li')).toHaveCount(inOffice);
    await expect(page.locator('#actions')).toBeHidden();
    await page.locator('#office-list li button').first().click();
    await expect(page.locator('#actions')).toBeVisible();
    await expect(page.locator('#actions-name')).not.toBeEmpty();
    await expect(page.locator('#office-list li button.is-selected')).toHaveCount(1);
    // the away list and the top-right button agree
    const away = await read(page, (g) => g.presence.away.length as number);
    if (away) {
      await expect(page.locator('#away-list li')).toHaveCount(away);
      await expect(page.locator('#away-button')).toContainText(`${away} draussen`);
    }
  });

  test('Plätze tab keeps the per-person seat select', async ({ page }) => {
    await openGame(page);
    await page.locator('#toggle-seats').click();
    expect(await page.locator('#seats-list select').count()).toBeGreaterThan(10);
  });

  test('Dev tab lists the events as buttons', async ({ page }) => {
    await openGame(page);
    await page.locator('#toggle-dev').click();
    await expect(page.locator('#dev-body button').first()).toBeVisible();
    await page.locator('#dev-body button', { hasText: 'Kaffeepause' }).first().click();
    await until(page, (g) => g.kitchen.current, undefined, 30_000);
  });
});

test.describe('ui.mode-chrome', () => {
  test('mode badge and key hints follow the mode and the selection', async ({ page }) => {
    await openGame(page);
    const badge = page.locator('#mode-badge');
    const hint = page.locator('#hint-line');
    await expect(badge).toHaveText('Orbit');
    await expect(hint).toContainText('Namen');
    await page.keyboard.press('1');
    await expect(badge).toHaveText('Iso');
    await page.keyboard.press('3');
    await expect(badge).toHaveText('Grundriss');
    await expect(hint).toContainText('Editor');
    await expect(hint).not.toContainText('Namen');
    await page.keyboard.press('2');
    await selectFromRoster(page);
    await expect(hint).toContainText('folgen');
    await expect(hint).toContainText('abwählen');
  });

  test('Grundriss shows the editor tool column; E opens the Editor tab', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('#plan-tools')).toBeHidden();
    await page.keyboard.press('3');
    await expect(page.locator('#plan-tools')).toBeVisible();
    await page.keyboard.press('e');
    await expect(page.locator('#panel-editor')).toBeVisible();
    await expect(page.locator('#tool-select')).toHaveAttribute('aria-pressed', 'true');
    expect(await read(page, (g) => g.editor.active)).toBe(true);
    await expect(page.locator('#tool-rotate')).toBeDisabled();
    // from another view, E switches to Grundriss
    await page.keyboard.press('e');
    expect(await read(page, (g) => g.editor.active)).toBe(false);
    await page.keyboard.press('1');
    await page.keyboard.press('e');
    expect(await read(page, (g) => g.views.mode)).toBe('plan');
    await expect(page.locator('#panel-editor')).toBeVisible();
    // the editor button of the dock closes it again
    await page.locator('#toggle-editor').click();
    expect(await read(page, (g) => g.editor.active)).toBe(false);
    await expect(page.locator('#side')).toBeHidden();
  });

  test('Rundgang shows only crosshair, key hint and the way back; keys light up', async ({ page }) => {
    await openGame(page, 'walk');
    for (const hidden of ['#dock', '#timeline', '#side', '#hint-line', '#topbar', '.m-hud-title', '#plan-tools']) await expect(page.locator(hidden)).toBeHidden();
    await expect(page.locator('#walk-keys')).toBeVisible();
    await expect(page.locator('#walk-back')).toBeVisible();
    await expect(page.locator('#reticle')).toBeVisible();
    await page.keyboard.down('w');
    await expect(page.locator('#walk-keys [data-code="KeyW"]')).toHaveClass(/is-down/);
    await page.keyboard.up('w');
    await expect(page.locator('#walk-keys [data-code="KeyW"]')).not.toHaveClass(/is-down/);
    await page.locator('#walk-back').click();
    expect(await read(page, (g) => g.views.mode)).toBe('orbit');
    await expect(page.locator('#dock')).toBeVisible();
  });
});

test('ui.esc-layers: Esc closes one layer per press', async ({ page }) => {
  await openGame(page);
  await selectFromRoster(page); // panel open + selection
  await page.locator('#dock-clock').click(); // timeline open
  await page.keyboard.press('ControlOrMeta+k'); // palette open
  await expect(page.locator('#palette')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#palette')).toBeHidden();
  expect(await read(page, (g) => !!g.selected)).toBe(true);
  await expect(page.locator('#timeline')).toBeVisible();

  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.selected)).toBeNull();
  expect(await read(page, (g) => g.followed)).toBeNull();
  await expect(page.locator('#timeline')).toBeVisible();
  await expect(page.locator('#side')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#timeline')).toBeHidden();
  await expect(page.locator('#side')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('#side')).toBeHidden();

  // nothing left: Esc stays in the view; Rundgang is the last layer
  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
  await page.keyboard.press('4');
  await page.keyboard.press('Escape');
  expect(await read(page, (g) => g.views.mode)).toBe('orbit');
});
