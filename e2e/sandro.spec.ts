import { expect, openGame, read, test, until } from './game';

test('play.sandro-ai: ?event=sandro-ai makes Sandro say an AI line in a bubble and raise a hand; it ends with the bubble', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=sandro-ai');
  const line = await until(page, (g) => g.bubbles.state.find((b) => b.id === 'sandro-ai-sandro-hagen' && b.opacity > 0.9)?.text);
  expect(line.length).toBeGreaterThan(3);
  expect(line.length).toBeLessThanOrEqual(30);
  expect(await read(page, (g) => g.sim.person('sandro-hagen').aiGesture)).toBe(true);
  await until(page, (g) => !g.sim.sandroAi.active);
  expect(await read(page, (g) => g.sim.person('sandro-hagen').aiGesture)).toBe(false);
  expect(errors).toEqual([]);
});
