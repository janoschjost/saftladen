import { expect, openGame, read, scene, test, until } from './game';

/**
 * `?event=<id>` runs a dev-panel event at start, so a dev can open a feature directly (the `url:` in FEATURES.md).
 * This checks that wiring once; what each place does once somebody is sent there is the simulation's business:
 * `src/game/places.test.ts`. The cases below need what only the view does: a home office feed (`HomeOffice`) or a pose
 * on the rig.
 */
test('dev.params: ?event=<id> starts its event at load (?event=meeting-room)', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-room');
  expect(await until(page, (g) => !!g.meetingRoom.current, undefined, 30_000)).toBe(true);
  expect(errors).toEqual([]);
});

const cases: [string, string, (g: any) => unknown][] = [
  ['home.son', 'remote-son', (g) => g.homes.some((h: { sonHere?: boolean } | null) => h?.sonHere)],
];

// The kneel itself is drawn by the view (`Game.posePet` puts `petPose` on the rig); who strokes what: places.test.ts
type Rig = { petAmt: number; rig: { legL: { rotation: { x: number } }; kneeR: { rotation: { x: number } } } };
const kneels = (g: any) => g.people.some((p: Rig) => p.petAmt > 0.9 && p.rig.legL.rotation.x < -0.4 && p.rig.kneeR.rotation.x > 1.2);
for (const [id, owner, event] of [
  ['pet.crouch', 'ramon-lenherr', 'pet-dog'],
  ['pet.crouch-cat', 'donata-manser', 'pet-cat'],
] as const) {
  test(`${id}: the owner kneels down to the pet (event ${event})`, async ({ page }) => {
    const errors = await openGame(page);
    await scene(page, (s, who) => s.put(who, 'desk', 'stay'), owner);
    await until(page, (g, ev) => !String((window as any).dev.trigger(ev)).endsWith('nicht möglich'), event);
    await until(page, kneels, undefined, 40_000);
    expect(errors).toEqual([]);
  });
}

// The cats' owner is out at 11:00 with seed 1: the event calls her in first (#125)
test("pet.crouch-cat (?event=pet-cat) brings the cats' owner in when she is away", async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=pet-cat');
  expect(await read(page, (g) => g.pets.find((d: { isCat: boolean }) => d.isCat).owner.presence)).not.toBe('in');
  await until(page, kneels, undefined, 40_000);
  expect(errors).toEqual([]);
});

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

// all eight home offices taken by hand: Zlatko still gets one (somebody gives theirs up) and the son comes
test('home.son (?event=remote-son#homes)', async ({ page }) => {
  const errors = await openGame(page, 'homes', undefined, 'event=remote-son');
  await until(page, (g) => g.homes.some((h: { sonHere?: boolean } | null) => h?.sonHere), undefined, 120_000);
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

// the glass room's lamp stays off by day with a meeting inside; the time slider jumping into the night switches it on, back to the day off again
test('place.meeting-lamp (?event=meeting-room, time slider jumps)', async ({ page }) => {
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
