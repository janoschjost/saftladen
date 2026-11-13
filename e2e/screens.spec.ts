import { expect, openGame, test, until } from './game';

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
