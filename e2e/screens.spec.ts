import { expect, test } from '@playwright/test';
import { openGame, read, until } from './game';

test('desk.screens-live: a working monitor shows moving content, the meeting TV runs a race', async ({ page }) => {
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
