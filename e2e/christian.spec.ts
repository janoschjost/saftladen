import { expect, openGame, read, test, until } from './game';

test('christian.model: ?event=christian-model stands him in the office at 2.1 m, walking on the spot and then up a line; christian-model-end sends him away', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=christian-model');
  const start = await until(page, (g) => (g.christian.root ? { x: g.christian.root.position.x, visible: g.christian.root.visible } : null));
  expect(start.visible).toBe(true);
  // he walks on the spot first, then sets off along the line
  await read(page, (g) => g.advance(8));
  const later = await read(page, (g) => g.christian.root!.position.x);
  expect(Math.abs(later - start.x)).toBeGreaterThan(1);
  expect(await read(page, (g) => g.christian.root!.scale.y)).toBeCloseTo(2.1 / 1.75, 5);
  expect(await read(page, (g) => g.sim.events.trigger('christian-model-end'))).toBe('Christian ist weg');
  expect(await read(page, (g) => g.christian.active)).toBe(false);
  expect(await read(page, (g) => g.sim.events.trigger('christian-model-end'))).toContain('nicht möglich');
  expect(errors).toEqual([]);
});
