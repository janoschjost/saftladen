import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

test('desk.screens-live: a working monitor shows moving content', async ({ page }) => {
  const errors = await openGame(page);
  await until(page, (g) => g.office.desks.some((d: any) => d.occupant?.working));
  // a hash of the first working monitor's picture; with `before` given: only once it differs
  const shot = (g: any, before?: number) => {
    const d = g.office.desks.find((k: any) => k.occupant?.working);
    if (!d) return null;
    const img = (d.screenMaterial.map.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 192, 120).data;
    let h = 1;
    for (let i = 0; i < img.length; i += 7) h = (h * 31 + img[i]) | 0;
    return h !== before ? h || 1 : null;
  };
  const a = await until(page, shot);
  await until(page, shot, a, 10_000);
  expect(errors).toEqual([]);
});

// Walking the group into the room takes minutes in software WebGL, so these check what the event sets up right away;
// how the TV follows the meeting (black → screen once all sit, kart players face the TV) is in src/game/Meeting.test.ts.
test('place.meeting-tv: black without a meeting, a meeting brings slides', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-room');
  expect(await read(page, (g) => g.meetingRoom.tv)).toBe('off');
  await until(page, (g) => g.meetingRoom.current?.screen === 'slides', undefined, 30_000);
  expect(await read(page, (g) => g.meetingRoom.tv)).toBe('off'); // still gathering: black until everybody sits
  expect(errors).toEqual([]);
});

test('place.meeting-tv: a lunch round is a kart race', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-kart');
  await until(page, (g) => g.meetingRoom.current?.screen === 'kart', undefined, 30_000);
  expect(errors).toEqual([]);
});
