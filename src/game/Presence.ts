import { HOME_COUNT } from '../render/homeOffice';
import { homeRoomOf, reservedRooms } from '../data/homeAssignments';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';

/** Share of the team that is out of the office at any time (errands + home office). */
const ABSENT_SHARE = 0.36;
/** Share of the absences that are home office. */
const HOME_SHARE = 0.45;
const MAX_HOME = HOME_COUNT; // one live feed per home office variant
const CHECK = [2, 6]; // seconds between departure decisions
const ERRAND = [25, 70]; // seconds out for a coffee / lunch / parcel
const HOME = [90, 220]; // seconds of working from home

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

/** Sends people out of the door (errand or home office) and lets them come back later. */
export class Presence {
  private timer = 4;

  constructor(private people: readonly Person[]) {}

  get target(): number {
    return Math.round(this.people.length * ABSENT_SHARE);
  }

  get absent(): Person[] {
    return this.people.filter((p) => p.presence !== 'in');
  }

  get homeCount(): number {
    return this.people.filter((p) => p.awayKind === 'home').length;
  }

  /** The person's own room (special or assigned), else a free one that nobody else has reserved, else any free one. */
  private freeVariant(p: Person): number {
    const own = homeRoomOf(p.id);
    if (own !== null) return own; // own room (assigned in the character view; Marco: hammock in Thailand)
    const used = new Set(this.people.filter((o) => o !== p && o.awayKind === 'home').map((o) => o.homeVariant));
    const reserved = reservedRooms(p.id);
    for (const skipReserved of [true, false]) {
      for (let i = 0; i < HOME_COUNT; i++) {
        const v = (p.preferredHome + i) % HOME_COUNT;
        if (!used.has(v) && !(skipReserved && reserved.has(v))) return v;
      }
    }
    return p.preferredHome;
  }

  /** Some people are already gone when the game starts (#homes: all eight home offices occupied, for a look at the rooms). */
  seed(): void {
    if (location.hash.includes('homes')) {
      const fixed = this.people.filter((p) => homeRoomOf(p.id) !== null);
      const taken = new Set(fixed.map((p) => homeRoomOf(p.id)));
      const free = Array.from({ length: HOME_COUNT }, (_, i) => i).filter((i) => !taken.has(i));
      const auto = this.people.filter((p) => homeRoomOf(p.id) === null).slice(0, free.length);
      for (const p of fixed) {
        p.homeVariant = homeRoomOf(p.id)!;
        p.startAway('home', 9999);
      }
      auto.forEach((p, i) => {
        p.homeVariant = free[i];
        p.startAway('home', 9999);
      });
      return;
    }
    const pool = [...this.people].sort(() => Math.random() - 0.5);
    const n = Math.round(this.target * 0.8);
    let home = 0;
    for (const p of pool.slice(0, n)) {
      const kind = Math.random() < HOME_SHARE && home < MAX_HOME ? 'home' : 'errand';
      if (kind === 'home') {
        home++;
        p.homeVariant = this.freeVariant(p);
      }
      p.startAway(kind, Math.random() * (kind === 'home' ? HOME[1] : ERRAND[1]) + 6);
    }
  }

  get homeFull(): boolean {
    return this.homeCount >= MAX_HOME;
  }

  /** Send somebody home / out by hand. They stay away until called back (or 10 min). */
  send(p: Person, kind: 'home' | 'errand', nav: NavGrid): void {
    if (p.presence !== 'in' || p.held || p.controlled || p.talk) return;
    if (kind === 'home') {
      if (this.homeFull) return;
      p.homeVariant = this.freeVariant(p);
    }
    p.leaveOffice(nav, kind, 600);
  }

  /** Bring somebody back to the office. */
  callBack(p: Person): void {
    if (p.presence === 'out') p.awayLeft = 0;
    else p.cancelLeave();
  }

  callAllBack(): void {
    for (const p of this.absent) this.callBack(p);
  }

  /** Home office <-> office for one person (H key). */
  toggleHome(p: Person, nav: NavGrid): void {
    if (p.presence === 'in') this.send(p, 'home', nav);
    else this.callBack(p);
  }

  update(dt: number, nav: NavGrid): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = between(CHECK);
    const leaving = this.people.filter((p) => p.presence === 'leaving').length;
    if (this.absent.length >= this.target || leaving >= 2) return;
    const candidates = this.people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.task && !p.printJob);
    if (!candidates.length) return;
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    const home = Math.random() < HOME_SHARE && this.homeCount < MAX_HOME;
    if (home) p.homeVariant = this.freeVariant(p);
    p.leaveOffice(nav, home ? 'home' : 'errand', between(home ? HOME : ERRAND));
  }
}
