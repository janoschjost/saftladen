import { expect, openGame, test, until } from './game';

for (const [id, kind, who] of [
  ['play.mail-letter', 'letter', 'a dove'],
  ['play.mail-parcel', 'parcel', 'a drone'],
] as const) {
  test(`${id}: ${who} brings it, an apprentice carries it to the desk of the addressee (event mail-${kind})`, async ({ page }) => {
    const errors = await openGame(page, '', undefined, `event=mail-${kind}`);
    const job = await until(page, (g) => (g.sim.mail.active ? { kind: g.sim.mail.kind, to: g.sim.mail.to?.id } : null), undefined, 30_000);
    expect(job.kind).toBe(kind);
    // an apprentice goes out for it and carries it
    const by = await until(page, (g) => (g.sim.mail.stage === 'back' ? g.sim.mail.by?.id : null), undefined, 240_000);
    expect(['alyosha-krajnc', 'jeerapat-wang', 'oscar-grob']).toContain(by);
    // and it ends on a desk
    await until(page, (g) => !g.sim.mail.active && g.sim.mail.onDesks.size === 1, undefined, 240_000);
    expect(errors).toEqual([]);
  });
}
