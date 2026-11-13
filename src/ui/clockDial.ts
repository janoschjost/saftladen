/**
 * Geometry of the 24 h clock dial in the HUD: midnight at the top, noon at the bottom, clockwise.
 * Kept apart from the DOM so it can be tested.
 */

/** Minutes the dial snaps to while dragging. */
export const DIAL_SNAP = 5;

/** Clock hour (0..24) at a point relative to the dial centre (screen coordinates: y grows downwards), snapped to `snap` minutes. */
export function dialHour(dx: number, dy: number, snap = DIAL_SNAP): number {
  const turn = Math.atan2(dx, -dy) / (2 * Math.PI); // -0.5 .. 0.5, 0 = straight up
  const minutes = Math.round((((turn % 1) + 1) % 1) * 1440 / snap) * snap;
  return (minutes % 1440) / 60;
}

/** Rotation of the hand in degrees (0 = up, clockwise) for a clock hour. */
export function dialAngle(hour: number): number {
  return ((((hour % 24) + 24) % 24) / 24) * 360;
}

/** Point on the dial circle of radius `r` at a clock hour (SVG coordinates around the centre). */
export function dialPoint(hour: number, r: number): [number, number] {
  const a = (dialAngle(hour) * Math.PI) / 180;
  return [Math.sin(a) * r, -Math.cos(a) * r];
}

/** SVG path of the pie slice from hour `from` clockwise to hour `to` (e.g. the night). */
export function dialSlice(from: number, to: number, r: number): string {
  const span = (((to - from) % 24) + 24) % 24;
  const [x0, y0] = dialPoint(from, r);
  const [x1, y1] = dialPoint(to, r);
  const f = (v: number) => v.toFixed(2);
  return `M0 0L${f(x0)} ${f(y0)}A${r} ${r} 0 ${span > 12 ? 1 : 0} 1 ${f(x1)} ${f(y1)}Z`;
}

/** Hour after stepping the dial with the keyboard by `minutes` (wraps around midnight, lands on the quarter hour). */
export function stepHour(hour: number, minutes: number): number {
  const m = Math.round((hour * 60) / 15) * 15 + minutes;
  return ((((m % 1440) + 1440) % 1440) / 60);
}
