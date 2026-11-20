import { expect, openGame, read, test, until } from './game';

test('office.mess-event: the URL event=mess fills the office with mess', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=mess');
  const kinds = await until(page, (g) => (g.sim.mess.count() ? [...new Set(g.sim.mess.list().map((i) => i.kind))].sort() : null), undefined, 10_000);
  expect(kinds).toEqual(['bin', 'bottle', 'chips', 'cup', 'jacket', 'lunchbox', 'paper', 'plate']);
  // all of it is in the office and shows: on a desk, a table, the floor; the bin's heap
  expect(await read(page, (g) => g.sim.mess.list().every((i) => i.mesh.visible && !!i.mesh.parent))).toBe(true);
  expect(errors).toEqual([]);
});
