/**
 * Home office laundry round: the occupant gets up, carries a bundle to the drying rack, hangs a few pieces and sits
 * back down. The pieces stay on the rack for the rest of their stay. Pure timing and counting, no three.js.
 */

/** pieces the drying rack holds: two rows of four */
export const RACK_SLOTS = 8;
/** a laundry round gets this many tickets in the break draw (out of ~12 normal ones) */
export const LAUNDRY_PICKS = 1;
/** timeline of a round (seconds): up from the chair, walk over, one piece per `hang`, walk back, sit down */
export const LAUNDRY = { up: 0.6, arrive: 2.0, hang: 1.1, back: 1.5, sit: 0.6 };

/** How many pieces this round hangs up: two or three (`roll` is a draw in [0, 1)), never more than fit. 0 = rack full. */
export function laundryTrip(hung: number, roll: number): number {
  return Math.max(0, Math.min(RACK_SLOTS - hung, roll < 0.5 ? 2 : 3));
}

/** Length of a round that hangs `n` pieces. */
export function laundryTime(n: number): number {
  return LAUNDRY.arrive + n * LAUNDRY.hang + LAUNDRY.back + LAUNDRY.sit;
}

/** How many of the round's `n` pieces are on the rack `at` seconds in (each lands in the middle of its hang). */
export function laundryHung(at: number, n: number): number {
  return Math.max(0, Math.min(n, Math.floor((at - LAUNDRY.arrive) / LAUNDRY.hang + 0.5)));
}
