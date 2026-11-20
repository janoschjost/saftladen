import { expect, openGame, read, scene, test, until } from './game';

test('play.bonfire: the Lagerfeuer card has Elia build a fire, the nearest free person puts it out with an extinguisher (event bonfire)', async ({ page }) => {
  const errors = await openGame(page);
  const crew = ['elia-vogt', 'donata-manser'];
  // only the two are in the office: he builds, she comes with the extinguisher
  const everybody = await read(page, (g) => g.sim.people.map((p) => p.id));
  await scene(page, (s, [all, ids]) => all.forEach((id) => (ids.includes(id) ? s.put(id, 'desk', 'stay') : s.put(id, 'errand'))), [everybody, crew] as const);
  await until(page, (g, ids) => g.sim.people.filter((p) => ids.includes(p.id) && p.sit > 0.9).length === ids.length, crew);
  await page.keyboard.press('a');
  await page.locator('#action-cards .m-card[data-action="bonfire"]').click();
  await expect(page.locator('#now-caption')).toContainText('Lagerfeuer');
  // it burns, the floor under it is blocked
  const fire = await until(page, (g) => (g.sim.bonfire.stage === 'burn' ? g.sim.bonfire.at : null), undefined, 120_000);
  expect(await read(page, (g, at) => g.sim.nav.walkable(g.sim.nav.toCell(at).cx, g.sim.nav.toCell(at).cz), fire)).toBe(false);
  // left alone she may be off to a meeting of her own: she sits down at her desk again second by second until she is sent
  let helper: string | null = null;
  for (let i = 0; i < 60 && !helper; i++) {
    await scene(page, (s) => s.put('donata-manser', 'desk', 'stay'));
    helper = await read(page, (g) => {
      g.advance(1);
      return g.sim.bonfire.helper?.id ?? null;
    });
  }
  expect(helper).toBe('donata-manser');
  await until(page, (g) => !g.sim.bonfire.active, undefined, 120_000);
  expect(await read(page, (g, at) => g.sim.nav.walkable(g.sim.nav.toCell(at).cx, g.sim.nav.toCell(at).cz), fire)).toBe(true);
  expect(errors).toEqual([]);
});
