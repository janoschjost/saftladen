import { expect, openGame, read, test, until } from './game';

test('chat.panel + chat.voice: open on desktop; a coffee break posts in it and the bubble of whoever wrote it shows the message', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=coffee');
  const panel = page.locator('#chat');
  await expect(panel).toBeVisible();
  await expect(page.locator('#chat-members')).toHaveText(/^\d+ Mitglieder$/);
  const ask = await until(page, (g) => {
    const m = g.sim.chat.messages.find((x) => x.topic === 'coffee');
    const bubble = m && g.bubbles.state.find((b) => b.id === m.by && b.text === m.text);
    return m && bubble ? m : null;
  });
  const line = panel.locator('.m-chat__message', { hasText: ask.text });
  await expect(line).toHaveCount(1);
  await expect(line.locator('.m-chat__name')).not.toBeEmpty();
  await expect(line.locator('.m-chat__time')).toHaveText(/^\d\d:\d\d$/);
  await expect(panel.locator('.m-chat__day').first()).toHaveText('Montag');
  // read-only: nothing to type into
  await expect(panel.locator('input, textarea, [contenteditable]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('chat.panel: C and the launcher toggle it; closed, new messages count on the launcher; the choice is kept', async ({ page }) => {
  const errors = await openGame(page);
  const panel = page.locator('#chat');
  const badge = page.locator('#chat-badge');
  await expect(panel).toBeVisible();
  await page.keyboard.press('c');
  await expect(panel).toBeHidden();
  await expect(badge).toBeHidden();
  const seen = await read(page, (g) => g.sim.chat.messages.length);
  await until(page, (g, n) => g.sim.chat.messages.length >= n + 2, seen, 150_000);
  const count = await read(page, (g, n) => g.sim.chat.messages.length - n, seen);
  await expect(badge).toHaveText(String(count));
  await expect(page.locator('#open-chat')).toHaveAttribute('aria-label', `Chat, ${count} ungelesen`);
  await page.locator('#open-chat').click();
  await expect(panel).toBeVisible();
  await expect(badge).toBeHidden();
  await page.keyboard.press('c');
  await expect(panel).toBeHidden();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('saftladen.settings') ?? '{}').chat)).toBe(false);
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); // no slide-in: the sheet is where it ends up at once

  test('chat.panel: closed at the start; the launcher opens a full-width sheet', async ({ page }) => {
    const errors = await openGame(page);
    const panel = page.locator('#chat');
    await expect(panel).toBeHidden();
    await expect(page.locator('#open-chat')).toBeVisible();
    await page.locator('#open-chat').click();
    await expect(panel).toBeVisible();
    const box = (await panel.boundingBox())!;
    expect(box.width).toBe(390);
    expect(box.y + box.height).toBeCloseTo(844, 0);
    expect(errors).toEqual([]);
  });
});

test('chat.dev: the voice editor changes a style, sends a test message, keeps the edit locally and exports the JSON', async ({ page }) => {
  const errors = await openGame(page);
  await page.keyboard.press('`');
  const form = page.locator('#dev-body form[data-section="voice"]');
  await form.locator('select[name="person"]').selectOption('jan-hasler');
  await form.locator('select[name="case"]').selectOption('lower');
  await form.locator('input[name="emoji"]').fill('0');
  await form.locator('input[name="emoji"]').dispatchEvent('change');
  await form.locator('textarea[name="lines"]').fill('{"coffee": ["Kafi, sofort."]}');
  await form.locator('textarea[name="lines"]').dispatchEvent('change');
  await form.locator('select[name="topic"]').selectOption('coffee');
  await form.locator('button[name="send"]').click();
  await expect(page.locator('#dev-status')).toHaveText('Chat: Kafi, sofort.');
  await expect(page.locator('#chat .m-chat__message', { hasText: 'Kafi, sofort.' })).toHaveCount(1);
  // no own line for the topic: a shared one in the edited style
  await form.locator('select[name="topic"]').selectOption('lunch');
  await form.locator('button[name="send"]').click();
  const lunch = (await page.locator('#dev-status').textContent())!.replace(/^Chat: /, '');
  expect(lunch).toBe(lunch.toLowerCase());
  expect(await read(page, (g) => g.sim.chat.messages.at(-1)?.by)).toBe('jan-hasler');

  await form.locator('button[name="export"]').click();
  const file = JSON.parse(await form.locator('textarea[name="export"]').inputValue());
  expect(file.style).toMatchObject({ case: 'lower', emoji: 0 });
  expect(file.lines).toEqual({ coffee: ['Kafi, sofort.'] });

  // kept in localStorage over a reload, until reset
  await page.reload();
  await page.waitForFunction(() => !!window.__game);
  await page.keyboard.press('`');
  await form.locator('select[name="person"]').selectOption('jan-hasler');
  await expect(form.locator('select[name="case"]')).toHaveValue('lower');
  await form.locator('button[name="reset"]').click();
  await expect(form.locator('textarea[name="lines"]')).toHaveValue('{}');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('saftladen.voices') ?? '{}'))).toEqual({});
  expect(errors).toEqual([]);
});
