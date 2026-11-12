import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

test('desk.screens-live: a working monitor shows moving content', async ({ page }) => {
  const errors = await openGame(page);
  await until(page, (g) => g.office.desks.some((d: any) => d.occupant?.working));
  const shot = () =>
    read(page, (g) => {
      const d = g.office.desks.find((k: any) => k.occupant?.working);
      const img = (d.screenMaterial.map.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 192, 120).data;
      let h = 0;
      for (let i = 0; i < img.length; i += 7) h = (h * 31 + img[i]) | 0;
      return h;
    });
  const a = await shot();
  await expect.poll(shot, { timeout: 10_000 }).not.toBe(a);
  expect(errors).toEqual([]);
});

test('place.meeting-tv: black without a meeting, slides in a meeting', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-room');
  expect(await read(page, (g) => g.meetingRoom.tv)).toBe('off');
  await until(page, (g) => g.meetingRoom.tv === 'slides', undefined, 90_000);
  expect(errors).toEqual([]);
});

test('place.meeting-tv: a lunch round plays kart racing', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-kart');
  await until(page, (g) => g.meetingRoom.tv === 'kart', undefined, 90_000);
  // everybody watches the TV, not each other
  await until(
    page,
    (g) => {
      const tv = g.meetingRoom.tvPos;
      return g.meetingRoom.current.members.every((p: any) => {
        const want = Math.atan2(tv.x - p.pos.x, tv.z - p.pos.z);
        return Math.abs(Math.atan2(Math.sin(p.yaw - want), Math.cos(p.yaw - want))) < 0.2;
      });
    },
    undefined,
    20_000,
  );
  expect(errors).toEqual([]);
});
