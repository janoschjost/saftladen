import { expect, openGame, read, test, until } from './game';

/**
 * `?event=<id>` runs a dev-panel event at start, so a dev can open a feature directly (the `url:` in FEATURES.md).
 * Each case opens the same event as that URL and waits until it has started. How it plays out is the simulation's
 * business (Vitest), not this param's.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cases: [string, string, (g: any) => unknown][] = [
  ['place.meeting', 'meeting-room', (g) => g.meetingRoom.current],
  ['place.coffee-break', 'coffee', (g) => g.kitchen.current],
  ['place.booth', 'phone-booth', (g) => g.phoneBooth.current],
  ['place.pod', 'pod', (g) => g.pod.current],
  ['pet.crouch', 'pet-dog', (g) => g.people.some((p: { petAmt: number; rig: { legL: { rotation: { x: number } } } }) => p.petAmt > 0.9 && p.rig.legL.rotation.x < -0.4)],
  ['place.printer', 'printer', (g) => g.people.some((p: { printJob?: unknown }) => p.printJob)],
  ['place.foosball', 'foosball', (g) => g.people.filter((p: { foosJob?: unknown }) => p.foosJob).length === 2],
  ['place.toilet', 'toilet', (g) => g.toilets.cabins.some((c: { session?: unknown }) => c.session)],
];

for (const [id, event, reached] of cases) {
  test(`${id} (?event=${event})`, async ({ page }) => {
    const errors = await openGame(page, '', undefined, `event=${event}`);
    await until(page, reached, undefined, 30_000);
    expect(errors).toEqual([]);
  });
}

// the round itself: src/render/laundry.test.ts. This is the way there: dev event → a home office → its rack
test('home.laundry (?event=home-laundry#homes)', async ({ page }) => {
  const errors = await openGame(page, 'homes', undefined, 'event=home-laundry');
  await until(page, (g) => g.homes.some((h: { laundryHung: number } | null) => h && h.laundryHung >= 1), undefined, 60_000);
  expect(errors).toEqual([]);
});

test('dev.params: unknown ?event id only warns, the game starts normally', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => m.type() === 'warning' && warnings.push(m.text()));
  const errors = await openGame(page, '', undefined, 'event=nope');
  expect(warnings.some((w) => w.includes('no event "nope"'))).toBe(true);
  expect(await read(page, (g) => g.people.length)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('dev.params: ?test fast-forwards in game time and does not draw the office', async ({ page }) => {
  await openGame(page);
  const state = await read(page, (g) => {
    const before = g.clock;
    g.advance(30);
    return { ahead: g.clock - before, draw: g.draw };
  });
  expect(state.ahead).toBeCloseTo(30, 3);
  expect(state.draw).toBe(false);
});

// The cats' owner is out at 11:00 with seeds 1 and 2 (the event needs her in the office), so the cat case uses seed 3
test('pet.crouch-cat (?event=pet-cat)', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=pet-cat', 3);
  await until(page, (g) => g.people.some((p: { petAmt: number; rig: { legL: { rotation: { x: number } } } }) => p.petAmt > 0.9 && p.rig.legL.rotation.x < -0.4), undefined, 40_000);
  expect(errors).toEqual([]);
});

// A lettered door (under the wall lettering) that is `open` or shut again; its letters must have moved along / be back
// in their laid-out place (`moved`: how far they are from it, m + rad).
type Letter = { x: number; y: number; mesh: { position: { x: number; y: number }; rotation: { z: number } } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const letteredDoor = (g: any, want: 'any' | 'open' | 'shut'): boolean =>
  g.doors.states
    .filter((s: { rig: { letters?: Letter[] } }) => s.rig.letters?.length)
    .some((s: { open: number; rig: { letters: Letter[] } }) => {
      const moved = Math.max(...s.rig.letters.map((l) => Math.abs(l.mesh.position.x - l.x) + Math.abs(l.mesh.position.y - l.y) + Math.abs(l.mesh.rotation.z)));
      return want === 'any' || (want === 'open' ? s.open > 0.9 && moved > 0.01 : s.open < 0.001 && moved < 0.001);
    });

test('office.door-lettering (?event=door-lettering): letters move with the door and settle back when it closes', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=door-lettering');
  expect(await read(page, letteredDoor, 'any')).toBe(true);
  await until(page, letteredDoor, 'open', 45_000);
  await page.evaluate(() => (window as unknown as { dev: { trigger: (id: string) => string } }).dev.trigger('door-lettering'));
  await until(page, letteredDoor, 'shut', 45_000);
  expect(errors).toEqual([]);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cabin = { session: { seated: boolean; person: any } | null };

// Sitting down and the handheld pose: covered by Toilets.test.ts
test('place.toilet: the cabin is taken at once, its light turns red (?event=toilet)', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=toilet');
  // the light follows on the next simulation step
  await until(page, (g) => g.toilets.cabins.some((c: Cabin, i: number) => c.session && g.model.toilets.cabins[i].sign.color.getHex() === 0xe0342c), undefined, 30_000);
  const state = await read(page, (g) => {
    const i = g.toilets.cabins.findIndex((c: Cabin) => c.session);
    const c = g.toilets.cabins[i];
    return { sign: g.model.toilets.cabins[i].sign.color.getHex(), occupant: c.seat.occupant === c.session.person };
  });
  expect(state).toEqual({ sign: 0xe0342c, occupant: true });
  expect(errors).toEqual([]);
});

test('place.toilet-queue: both cabins taken, the third person waits in front (?event=toilet ×3)', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=toilet&event=toilet&event=toilet');
  await until(page, (g) => g.toilets.queue.length === 1 && g.toilets.cabins.every((c: Cabin) => c.session), undefined, 30_000);
  const ok = await read(page, (g) => {
    const waiting = g.toilets.queue[0].person;
    return g.toilets.cabins.every((c: Cabin) => c.session!.person !== waiting) && !waiting.inMeeting;
  });
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});

// the glass room's lamp stays off by day with a meeting inside; the time slider jumping into the night switches it on, back to the day off again
test('place.meeting-lamp (?event=meeting-room, time slider jumps)', async ({ page }) => {
  test.setTimeout(240_000); // the group has to walk into the room first, slow in software WebGL
  const errors = await openGame(page, '', undefined, 'event=meeting-room');
  await until(page, (g) => g.meetingRoom.occupants(g.people) >= 2, undefined, 150_000);
  expect(await read(page, (g) => g.meetingLight.level)).toBe(0);
  // the slider value is the cycle position in thousandths: 953 = 22:00, 362 = 11:00
  const slide = (v: number) =>
    page.evaluate((v) => {
      const s = document.getElementById('time-slider') as HTMLInputElement;
      s.value = String(v);
      s.dispatchEvent(new Event('input'));
    }, v);
  await slide(953);
  await until(page, (g) => g.tod.hour > 21 && g.meetingRoom.occupants(g.people) > 0 && g.meetingLight.level > 0.9, undefined, 60_000);
  await slide(362);
  await until(page, (g) => g.tod.hour < 12 && g.meetingLight.level === 0, undefined, 60_000);
  expect(errors).toEqual([]);
});
