import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

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
  ['pet.crouch (dog)', 'pet-dog', (g) => g.people.some((p: { petAmt: number; rig: { legL: { rotation: { x: number } } } }) => p.petAmt > 0.9 && p.rig.legL.rotation.x < -0.4)],
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
  // one call: no frame runs in between and adds its own time
  const state = await read(page, (g) => {
    const before = g.clock;
    g.advance(30);
    return { ahead: g.clock - before, draw: g.draw, shadows: g.renderer.shadowMap.enabled, pixelRatio: g.renderer.getPixelRatio() };
  });
  expect(state.ahead).toBeCloseTo(30, 3);
  expect(state).toEqual({ ahead: state.ahead, draw: false, shadows: false, pixelRatio: 1 });
});

// Donata (cats) is out with seeds 1 and 2, so the cat case uses seed 3
test('pet.crouch-cat (?event=pet-cat)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?test&seed=3&time=11&event=pet-cat');
  await page.waitForFunction(() => !!window.__game, undefined, { timeout: 30_000 });
  await until(page, (g) => g.people.some((p: { petAmt: number; rig: { legL: { rotation: { x: number } } } }) => p.petAmt > 0.9 && p.rig.legL.rotation.x < -0.4), undefined, 40_000);
  expect(errors).toEqual([]);
});

// the lettered doors under the wall lettering; `moved` = how far its letters are from their laid-out place (m + rad)
type Letter = { x: number; y: number; mesh: { position: { x: number; y: number }; rotation: { z: number } } };
type LetteredDoor = { open: number; moved: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const letteredDoors = (g: any): LetteredDoor[] =>
  g.doors.states
    .filter((s: { rig: { letters?: Letter[] } }) => s.rig.letters?.length)
    .map((s: { open: number; rig: { letters: Letter[] } }) => ({
      open: s.open,
      moved: Math.max(...s.rig.letters.map((l) => Math.abs(l.mesh.position.x - l.x) + Math.abs(l.mesh.position.y - l.y) + Math.abs(l.mesh.rotation.z))),
    }));

test('office.door-lettering (?event=door-lettering): letters move with the door and settle back when it closes', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=door-lettering');
  const doors = () => read(page, letteredDoors);
  expect((await doors()).length).toBeGreaterThan(0);
  await expect.poll(async () => (await doors()).some((d) => d.open > 0.9 && d.moved > 0.01), { timeout: 45_000 }).toBe(true);
  await page.evaluate(() => (window as unknown as { dev: { trigger: (id: string) => string } }).dev.trigger('door-lettering'));
  await expect.poll(async () => (await doors()).some((d) => d.open < 0.001 && d.moved < 0.001), { timeout: 45_000 }).toBe(true);
  expect(errors).toEqual([]);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cabin = { session: { seated: boolean; person: any } | null };

// Sitting down and the handheld pose need the walk to the washroom (minutes in software WebGL): covered by Toilets.test.ts
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
