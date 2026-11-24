import { expect, openGame, read, test, until } from './game';

test('oscar.event: ?event=oscar-tidy puts the police cap on Oscar and starts his outing with a Chrigi bubble; oscar-tidy-end takes the cap off', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=oscar-tidy');
  const start = await until(page, (g) => {
    const rig = g.sim.person('oscar-grob').rig;
    return g.sim.tidy.active ? { police: rig.policeCap?.visible, own: rig.cap?.visible, mess: g.sim.mess.count() } : null;
  });
  expect(start).toEqual({ police: true, own: false, mess: expect.any(Number) });
  expect(start.mess).toBeGreaterThan(0);
  const bubble = await until(page, (g) => g.bubbles.state.find((b) => b.id === 'tidy-oscar-grob' && b.opacity > 0.9)?.text);
  expect(bubble.length).toBeGreaterThan(3);
  expect(await read(page, (g) => g.sim.events.trigger('oscar-tidy-end'))).toBe('Oscar hört auf');
  const after = await read(page, (g) => {
    const rig = g.sim.person('oscar-grob').rig;
    return { active: g.sim.tidy.active, police: rig.policeCap?.visible, own: rig.cap?.visible };
  });
  expect(after).toEqual({ active: false, police: false, own: true });
  expect(await read(page, (g) => g.sim.events.trigger('oscar-tidy-end'))).toContain('nicht möglich');
  expect(errors).toEqual([]);
});
