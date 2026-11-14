import type { Person } from './Person';
import { apart } from './rng';
import type { Sim } from './Sim';

/** Where `put` places somebody: sitting at a desk, standing at a point, or out of the office. */
export type Where = 'desk' | 'errand' | 'home' | { x: number; z: number };
/**
 * How firmly a placed person stays:
 * - `pin`: exactly as put. No errand, chat, meeting, lunch or leave of their own; out, they stay out.
 * - `stay`: in the office (or out of it) for good, but inside they live on: they wander, chat, pet, join a meeting.
 * - `free`: put there once, the simulation takes over at the next step.
 */
export type Hold = 'pin' | 'stay' | 'free';
export type Place = 'printer' | 'coffee' | 'kitchen' | 'meeting' | 'wc';

/** Seconds somebody put out with `free` stays away (held, they stay out until released). */
const AWAY = 45;

/**
 * States a scene instead of finding one: who is where, who stays there, which place is free. For tests and dev tools
 * (`sim.scenario`, in the browser `__game.sim.scenario`).
 *
 * Everything here happens at once (no walk to the door) and rolls its dice apart from the simulation (`apart`): the
 * random stream is where it was, so a scene does not reshuffle the rest of the day. The people it touches act
 * differently from then on, and whoever meets them will too.
 *
 * Next to it: `dev.forceState` (`forceState.ts`) asks a person to go somewhere the way the game would send them (they
 * walk, it may be refused, nothing holds them). A scene is not refused: what it cannot do (unknown id, place or
 * `where`, no desk) throws. It does not look at how full the office is: bring somebody in beyond its 15 places and
 * the game sends somebody else to the home office.
 */
export class Scenario {
  constructor(private sim: Sim) {}

  /** Something stands on this cell of the floor now: nobody walks through it. */
  block(cx: number, cz: number): void {
    this.sim.nav.block(cx, cz);
  }

  /** Puts `id` there, now. Out of the office they come in without the door, their pets with them. */
  put(id: string, where: Where, hold: Hold = 'pin'): void {
    const p = this.sim.person(id);
    const point = typeof where === 'object' && Number.isFinite(where?.x) && Number.isFinite(where?.z);
    if (!point && !['desk', 'errand', 'home'].includes(where as string)) throw new Error(`scenario: cannot put "${id}" at ${JSON.stringify(where)}`);
    if (!['pin', 'stay', 'free'].includes(hold)) throw new Error(`scenario: unknown hold "${hold}"`);
    if (where === 'desk') {
      if (!this.sim.deskFor(p)) throw new Error(`scenario: no desk for "${id}"`);
      if (p.controlled && !p.scripted) throw new Error(`scenario: "${id}" is steered by the player and cannot sit down`);
    }
    apart(() => {
      this.release(id);
      if (!(where === 'desk' && p.working)) this.sim.pull(p); // already at a desk: stays on that chair
      if (where === 'errand' || where === 'home') this.out(p, where);
      else if (where === 'desk') this.seat(p, hold === 'pin');
      else this.stand(p, where, hold === 'pin');
      if (hold === 'free') this.sim.presence.letGo(p);
      else this.sim.presence.keep(p);
    });
  }

  /** Nothing holds `id` any more: unpinned, and the schedule has them again (kept out, they come back in). */
  release(id: string): void {
    const p = this.sim.person(id);
    p.unpin();
    this.sim.presence.letGo(p);
  }

  /** Empties these places at once: whoever uses them drops it where they stand. */
  clear(...places: Place[]): void {
    const { sim } = this;
    const empty: Record<Place, () => void> = {
      printer: () => sim.people.forEach((p) => p.cancelPrint()),
      coffee: () => sim.people.forEach((p) => p.cancelRun()),
      kitchen: () => sim.kitchen.abort(),
      meeting: () => sim.meetingRoom.abort(sim.nav),
      wc: () => sim.toilets.abort(),
    };
    for (const place of places) if (!Object.hasOwn(empty, place)) throw new Error(`scenario: no place called "${place}"`);
    apart(() => places.forEach((place) => empty[place]()));
  }

  private seat(p: Person, pin: boolean): void {
    this.enter(p, this.sim.deskFor(p)!.approach);
    const desk = this.sim.seat(p)!;
    if (pin) p.pinTo({ at: desk.seat, yaw: desk.yaw, sit: true });
  }

  private stand(p: Person, at: { x: number; z: number }, pin: boolean): void {
    const spot = this.sim.nav.nearestWalkable(at, 6) ?? at;
    this.enter(p, spot);
    p.placeAt(spot);
    p.sit = 0;
    if (pin) p.pinTo({ at: spot, yaw: p.yaw });
  }

  private out(p: Person, kind: 'errand' | 'home'): void {
    this.sim.presence.awayNow(p, kind, AWAY);
    for (const pet of p.pets) pet.sendAway();
  }

  /** Somebody who is not in the office is, at `at`. Their pets are there too, also those that stay home today (`pet.schedule`): a scene does not hope for the dice. */
  private enter(p: Person, at: { x: number; z: number }): void {
    if (p.presence !== 'in') p.arriveNow(at);
    for (const [i, pet] of p.pets.entries()) {
      if (pet.removed) continue;
      pet.comesToday = true;
      if (pet.away) pet.appearAt(this.sim.petStart(p, i % 2 ? -1 : 1, i < 2 ? 1 : -1));
    }
  }
}
