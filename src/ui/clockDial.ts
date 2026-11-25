/**
 * Geometry of the HUD clock: the progress bar under the time is as wide as the day (midnight at the left end, noon in
 * the middle). Kept apart from the DOM so it can be tested.
 */

/** Minutes the bar snaps to while dragging. */
export const DIAL_SNAP = 5;

/** Clock hour (0..24) at a horizontal position along the bar (0 = left end, 1 = right end), snapped to `snap` minutes. */
export function trackHour(fraction: number, snap = DIAL_SNAP): number {
  const clamped = Math.min(1, Math.max(0, fraction));
  const minutes = Math.round((clamped * 1440) / snap) * snap;
  return (minutes % 1440) / 60;
}

/** Hour after stepping the clock with the keyboard by `minutes` (wraps around midnight, lands on the quarter hour). */
export function stepHour(hour: number, minutes: number): number {
  const m = Math.round((hour * 60) / 15) * 15 + minutes;
  return ((((m % 1440) + 1440) % 1440) / 60);
}
