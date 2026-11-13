import { expect, openGame, read, test, until } from './game';

/** Dev panel "Personen / Tiere entfernen": taking people and pets out of the sim and back (#89). */

test.describe('dev.remove', () => {
  test('a seated person: desk freed, hidden, not coming back by themselves; restore puts them back in the sim', async ({ page }) => {
    const errors = await openGame(page);
    // somebody sitting at a desk right now
    await until(page, (g) => g.people.some((p: { task?: { phase: string } | null; inOffice: boolean }) => p.inOffice && p.task?.phase === 'work'));
    const id = await read(page, (g) => g.people.find((p: { task?: { phase: string } | null; inOffice: boolean }) => p.inOffice && p.task?.phase === 'work').id as string);
    expect(await read(page, (g, who) => g.setRemoved(who, true), id)).toContain('raus');
    const state = () =>
      read(
        page,
        (g, who) => {
          const p = g.people.find((o: { id: string }) => o.id === who);
          return { away: p.away, visible: p.root.visible, presence: p.presence, task: !!p.task, deskTaken: g.office.desks.some((d: { occupant: unknown }) => d.occupant === p), removed: g.sim.removedIds.includes(who) };
        },
        id,
      );
    await until(page, (g, who) => !g.people.find((o: { id: string }) => o.id === who).root.visible, id);
    expect(await state()).toMatchObject({ away: true, visible: false, presence: 'out', task: false, deskTaken: false, removed: true });
    // the others keep living, and the removed one stays away (also through a call-all-back)
    await read(page, (g) => {
      g.presence.callAllBack();
      g.advance(3);
    });
    expect(await state()).toMatchObject({ away: true, presence: 'out', removed: true });
    // restore: back into the plan of the day. In through the door, or (full office) an errand / home office spell like everybody else
    expect(await read(page, (g, who) => g.setRemoved(who, false), id)).toContain('dabei');
    await until(page, (g, who) => g.people.find((o: { id: string }) => o.id === who).awayKind !== 'off', id, 20_000);
    expect(await state()).toMatchObject({ removed: false });
    expect(errors).toEqual([]);
  });

  test('a person in the meeting room: seat freed, nobody else is stuck', async ({ page }) => {
    const errors = await openGame(page, '', undefined, 'event=meeting-room');
    await until(page, (g) => g.meetingRoom.current?.members.length >= 2, undefined, 30_000);
    const id = await read(page, (g) => g.meetingRoom.current.members[0].id as string);
    await read(page, (g, who) => g.setRemoved(who, true), id);
    await until(page, (g, who) => !g.meetingRoom.current || !g.meetingRoom.current.members.some((m: { id: string }) => m.id === who), id);
    const left = await read(
      page,
      (g, who) => {
        const p = g.people.find((o: { id: string }) => o.id === who);
        return { inMeeting: p.inMeeting, talk: !!p.talk, seatTaken: g.meetingRoom.seats.some((s: { occupant: unknown }) => s.occupant === p) };
      },
      id,
    );
    expect(left).toEqual({ inMeeting: false, talk: false, seatTaken: false });
    // the rest of the meeting ends or goes on without them, either way nobody is left waiting for the removed person
    await until(page, (g, who) => g.people.every((p: { id: string; inMeeting: boolean; meetPhase: string | null }) => p.id === who || !p.inMeeting || p.meetPhase !== 'gather'), id, 60_000);
    expect(errors).toEqual([]);
  });

  test('a pet: hidden and stays away even though the owner is in; restore brings it back', async ({ page }) => {
    const errors = await openGame(page);
    const pet = await read(page, (g) => g.pets.find((d: { owner: { inOffice: boolean }; away: boolean }) => d.owner.inOffice && !d.away).id as string);
    expect(await read(page, (g, id) => g.setRemoved(id, true), pet)).toContain('raus');
    const away = () => read(page, (g, id) => g.pets.find((d: { id: string }) => d.id === id).away, pet);
    await until(page, (g, id) => g.pets.find((d: { id: string }) => d.id === id).away, pet);
    await read(page, (g) => g.advance(3));
    expect(await away()).toBe(true);
    expect(await read(page, (g) => g.sim.removedIds)).toContain(pet);
    await read(page, (g, id) => g.setRemoved(id, false), pet);
    await until(page, (g, id) => !g.pets.find((d: { id: string }) => d.id === id).away, pet, 30_000);
    expect(errors).toEqual([]);
  });

  test('the dev panel has a toggle per person and pet; the console can do it too', async ({ page }) => {
    const errors = await openGame(page);
    await page.keyboard.press('`');
    const counts = await read(page, (g) => ({ people: g.people.length, pets: g.pets.length }));
    await expect(page.locator('#dev-body .m-button[data-id]')).toHaveCount(counts.people + counts.pets);
    const btn = page.locator('#dev-body .m-button[data-id="jan-hasler"]');
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#dev-status')).toContainText('raus');
    expect(await read(page, (g) => g.sim.removedIds)).toEqual(['jan-hasler']);
    await btn.click();
    await expect(btn).toHaveAttribute('aria-pressed', 'false');
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
    // console: dev.remove / dev.restore / dev.removed
    await page.evaluate(() => (window as unknown as { dev: { remove(id: string): void } }).dev.remove('jan-hasler'));
    expect(await page.evaluate(() => (window as unknown as { dev: { removed(): string[] } }).dev.removed())).toEqual(['jan-hasler']);
    await page.evaluate(() => (window as unknown as { dev: { restore(id: string): void } }).dev.restore('jan-hasler'));
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('not persisted: a reload restores everyone', async ({ page }) => {
    await openGame(page);
    await read(page, (g) => g.setRemoved('jan-hasler', true));
    await page.reload();
    await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
    expect(await read(page, (g) => g.sim.removedIds)).toEqual([]);
  });
});
