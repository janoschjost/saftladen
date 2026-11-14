import { expect, openGame, test, until } from './game';
import type { TestHook } from '../src/game/Game';

const seatedSpeakerBubble = (g: TestHook) => {
  const m = g.sim.meetingRoom.current;
  if (m?.phase !== 'session' || m.speaker.sit < 0.95) return null;
  const b = g.bubbles.state.find((s) => s.id === m.speaker.id && s.opacity > 0.9);
  return b ? { ...b, sit: m.speaker.sit, standingHead: m.speaker.rig.headHeight } : null;
};

test('social.bubbles: a seated speaker in a meeting shows a 3D bubble just above the head', async ({ page }) => {
  const errors = await openGame(page, '', undefined, 'event=meeting-room');
  const b = await until(page, seatedSpeakerBubble, undefined, 90_000);
  // the head is lower than a standing one, and the bubble's tail sits right on top of it (alone: no stacking lift)
  expect(b.headY).toBeLessThan(b.standingHead - 0.2);
  expect(b.y - b.headY).toBeGreaterThan(0);
  expect(b.y - b.headY).toBeLessThan(0.3);
  expect(b.text.length).toBeGreaterThan(0);
  // the old DOM bubbles are gone
  await expect(page.locator('.m-bubble')).toHaveCount(0);
  expect(errors).toEqual([]);
});
