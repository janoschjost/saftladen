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

test('christian.ghost: ?event=christian lets him come through the wall and clean up; christian-end sends him away', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=christian'); // the ghost glides in from the north wall (placing is checked in Vitest)
  const start = await until(page, (g) => (g.ghost.at ? { mess: g.sim.mess.count() } : null));
  expect(start.mess).toBeGreaterThan(0); // nothing lay around: the event filled the office first
  await read(page, (g) => g.advance(40));
  expect(await read(page, (g) => g.sim.mess.count())).toBeLessThan(start.mess);
  expect(await read(page, (g) => g.sim.events.trigger('christian-end'))).toBe('Christian ist weg');
  expect(await read(page, (g) => g.ghost.active)).toBe(false);
  expect(await read(page, (g) => g.sim.events.trigger('christian-end'))).toContain('nicht möglich');
  expect(errors).toEqual([]);
});
