import type { OfficeModel } from '../render/officeModel';
import type { MeetingRoom, MeetSeat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Office } from './Office';
import type { Person } from './Person';

type ModelSeat = OfficeModel['benches'][number];

/** Seconds between two looks at who can have a desk now. */
const DESK_CHECK = 1;

/**
 * Overflow seating (#136): with more people in the office than desks, whoever finds no desk sits down on a free seat
 * and works on the laptop there: the kitchen bar stools, when those are full the chairs of the glass meeting room. They use the meeting-chair logic (walk to the seat, sit down, stand up); a
 * meeting takes its chairs back (`MeetingRoom.start`), and a desk that frees up goes to somebody who sits here.
 */
export class Benches {
  /** the bar stools; the meeting room's chairs come on top in `claim` */
  readonly seats: MeetSeat[] = [];
  private sources = new Map<MeetSeat, ModelSeat>();
  private timer = 0;

  constructor(
    model: readonly ModelSeat[],
    nav: NavGrid,
    private room: MeetingRoom,
    private office: Office,
  ) {
    for (const s of model) {
      const approach = this.approachFor(s, nav);
      if (!approach) continue; // boxed in: nobody could walk up to it
      const seat: MeetSeat = { seat: { x: s.x, z: s.z }, approach, yaw: s.yaw, occupant: null };
      this.seats.push(seat);
      this.sources.set(seat, s);
    }
  }

  /** A free cell next to the seat that the sitter can step into in a straight line: behind it, else in front of it. */
  private approachFor(s: ModelSeat, nav: NavGrid): Vec2 | null {
    const front = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const ok = (p: Vec2) => nav.lineClear(p, s, 0.5);
    for (const side of [-1, 1]) {
      for (const dist of [0.6, 0.8, 1, 1.2, 1.4]) {
        const c = nav.toCell({ x: s.x + front.x * dist * side, z: s.z + front.z * dist * side });
        if (nav.walkable(c.cx, c.cz) && ok(nav.center(c.cx, c.cz))) return nav.center(c.cx, c.cz);
      }
    }
    return null;
  }

  /** Furniture was moved (room editor) and the nav grid rebuilt: the seats follow in place. */
  relayout(nav: NavGrid): void {
    for (const seat of this.seats) {
      const s = this.sources.get(seat)!;
      seat.seat.x = s.x;
      seat.seat.z = s.z;
      seat.yaw = s.yaw;
      const approach = this.approachFor(s, nav);
      if (approach) {
        seat.approach.x = approach.x;
        seat.approach.z = approach.z;
      }
    }
  }

  /** The free seat nearest to `p`: stools first, the meeting room's chairs only while no meeting is on. Null when every seat is taken. */
  claim(p: Person): MeetSeat | null {
    const nearest = (seats: readonly MeetSeat[]) =>
      seats
        .filter((s) => !s.occupant)
        .map((s) => ({ s, d: Math.hypot(s.approach.x - p.pos.x, s.approach.z - p.pos.z) }))
        .sort((a, b) => a.d - b.d)[0]?.s ?? null;
    return nearest(this.seats) ?? (this.room.current ? null : nearest(this.room.seats));
  }

  /** Once a second: every free desk goes to somebody who sits here (they stand up and walk over to it). */
  update(dt: number, people: readonly Person[]): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = DESK_CHECK;
    for (const p of people) {
      if (!p.benchSeated) continue;
      const desk = this.office.claim(p, false);
      if (!desk) return; // no desk free for the others either
      p.leaveBench(desk);
    }
  }
}
