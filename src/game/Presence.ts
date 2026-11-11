import { HOME_COUNT } from '../render/homeOffice';
import { homeRoomOf, reservedRooms } from '../data/homeAssignments';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import type { TimeOfDay } from './TimeOfDay';
import type { Weather } from './Weather';

/** Share of the team that is out of the office at any time (errands + home office). */
const ABSENT_SHARE = 0.36;
/** Share of the absences that are home office. */
const HOME_SHARE = 0.45;
/** Lunch rush: a lot more people are out between these hours. */
const LUNCH = { from: 11.75, to: 13.25, share: 0.55, homeShare: 0.25, check: [1, 3], errand: [40, 95] };
/** Rain keeps people in: fewer errands, those who go take longer, more home office. */
const RAIN = { share: 0.75, homeShare: 0.6, errandStretch: 1.4 };
/** Closing time: from this hour on the team trickles out for the day (the night shift stays). */
const CLOSING = 17.25;
const CLOSING_CHECK = [1.2, 3.2];
const MAX_HOME = HOME_COUNT; // one live feed per home office variant
const CHECK = [2, 6]; // seconds between departure decisions
const ERRAND = [25, 70]; // seconds out for a coffee / lunch / parcel
const HOME = [90, 220]; // seconds of working from home
/** homebodies (see TeamMember.homebody): picked this much more often, stay this much longer, likely home at start */
const HOMEBODY = { weight: 6, stay: 2, startHome: 0.75 };

/** The night shift: these two work late in the office (one, both or nobody), Marco sometimes works from home. Everybody else is off. */
const NIGHT_OFFICE = ['sandro-hagen', 'fabian-bucher'];
const NIGHT_HOME = 'marco-rieser';
const NIGHT_ROLL = [45, 130]; // seconds between night-shift reshuffles
/** Morning arrivals: first one after `first` s, then one every `gap` s (+ random `jitter`). */
const DAWN = { first: 3, gap: 14, jitter: 10 };
const OFF = 9999; // "off for the night": stays away until morning

const between = ([a, b]: number[]) => a + Math.random() * (b - a);

/** Sends people out of the door (errand or home office) and lets them come back later. */
export class Presence {
  private timer = 4;
  private wasNight = false;
  private nightTimer = 0;
  private nightCheck = 0;
  private wantOffice = new Set<string>();
  private wantHome = false;
  /** people the player moved by hand during the night: the night shift leaves them alone */
  private overridden = new Set<Person>();
  private closingTimer = 0;
  private recallTimer = 0;

  constructor(
    private people: readonly Person[],
    private tod: TimeOfDay,
    private weather: Weather,
  ) {
    this.wasNight = tod.night;
  }

  /** People who are out on an errand or in the home office (not those who simply went home for the night). */
  get away(): Person[] {
    return this.people.filter((p) => p.presence !== 'in' && p.awayKind !== 'off');
  }

  /** true during the lunch rush */
  get lunch(): boolean {
    return !this.tod.night && this.tod.hour >= LUNCH.from && this.tod.hour < LUNCH.to;
  }

  get target(): number {
    const share = this.lunch ? LUNCH.share : ABSENT_SHARE;
    return Math.round(this.people.length * share * (this.weather.raining ? RAIN.share : 1));
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
    if (own !== null) return own; // their room from the team data or the character view (Marco: the beach in Thailand)
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

  /** Who works tonight: one or both of the office people (or nobody), Marco from home about half the time. */
  private rollNight(): void {
    this.nightTimer = between(NIGHT_ROLL);
    const r = Math.random();
    this.wantOffice = new Set(r < 0.35 ? [NIGHT_OFFICE[0]] : r < 0.7 ? [NIGHT_OFFICE[1]] : r < 0.88 ? NIGHT_OFFICE : []);
    this.wantHome = Math.random() < 0.5;
  }

  /** What this person should be doing at night: at their desk (`in`), at home working, or off. */
  private nightRole(p: Person): 'in' | 'home' | 'off' {
    if (this.wantOffice.has(p.id)) return 'in';
    if (p.id === NIGHT_HOME && this.wantHome) return 'home';
    return 'off';
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
    if (this.tod.night) {
      this.rollNight();
      for (const p of this.people) {
        const role = this.nightRole(p);
        if (role === 'in') continue;
        if (role === 'home') p.homeVariant = this.freeVariant(p);
        p.startAway(role, OFF);
      }
      return;
    }
    const homebodies = this.people.filter((p) => p.member.homebody && Math.random() < HOMEBODY.startHome);
    for (const p of homebodies) {
      p.homeVariant = this.freeVariant(p);
      p.startAway('home', Math.random() * HOME[1] * HOMEBODY.stay + 6);
    }
    const pool = this.people.filter((p) => !p.member.homebody).sort(() => Math.random() - 0.5);
    const n = Math.round(this.target * 0.8) - homebodies.length;
    let home = 0;
    for (const p of pool.slice(0, Math.max(0, n))) {
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
    if (p.member.homebody) kind = 'home'; // never out on errands
    if (kind === 'home') {
      if (this.homeFull) return;
      p.homeVariant = this.freeVariant(p);
    }
    if (this.tod.night || this.tod.hour >= CLOSING) this.overridden.add(p);
    p.leaveOffice(nav, kind, 600);
  }

  /** Bring somebody back to the office. */
  callBack(p: Person): void {
    if (this.tod.night || this.tod.hour >= CLOSING) this.overridden.add(p);
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

  /** Dawn: everybody who went home for the night trickles back, one after the other over a few minutes (no rush at the door). */
  private dawn(): void {
    this.overridden.clear();
    const back = this.people.filter((p) => p.presence === 'out' && (p.awayKind === 'off' || (p.awayKind === 'home' && p.awayLeft > 600)));
    back.sort(() => Math.random() - 0.5);
    back.forEach((p, i) => {
      p.awayLeft = DAWN.first + i * DAWN.gap + Math.random() * DAWN.jitter;
    });
  }

  /** Night: send everybody except tonight's shift home, keep the shift at their desks. */
  private updateNight(dt: number, nav: NavGrid): void {
    this.nightTimer -= dt;
    if (this.nightTimer <= 0) this.rollNight();
    this.nightCheck -= dt;
    if (this.nightCheck > 0) return;
    this.nightCheck = 0.6;
    let leaving = this.people.filter((p) => p.presence === 'leaving').length;
    for (const p of this.people) {
      if (this.overridden.has(p)) continue;
      const role = this.nightRole(p);
      switch (p.presence) {
        case 'in': {
          if (role === 'in' || leaving >= 6) break;
          if (p.held || p.controlled || p.talk || p.meetJob || p.printJob || p.foosJob || p.vapeJob) break;
          if (role === 'home') p.homeVariant = this.freeVariant(p);
          p.leaveOffice(nav, role, OFF);
          leaving++;
          break;
        }
        case 'leaving':
          if (role === 'in') p.cancelLeave();
          else {
            p.awayKind = role;
            p.awayLeft = OFF;
          }
          break;
        case 'out':
          if (role === 'in') {
            if (p.awayLeft > 12) p.awayLeft = between([3, 12]); // back to the desk soon
          } else if (p.awayKind !== role || p.awayLeft < OFF - 1) {
            if (role === 'home' && p.awayKind !== 'home') p.homeVariant = this.freeVariant(p);
            p.awayKind = role;
            p.awayLeft = OFF;
          }
          break;
      }
    }
  }

  update(dt: number, nav: NavGrid): void {
    if (this.tod.night !== this.wasNight) {
      this.wasNight = this.tod.night;
      if (this.tod.night) {
        this.overridden.clear();
        this.rollNight();
      } else this.dawn();
    }
    if (this.tod.night) {
      this.updateNight(dt, nav);
      return;
    }
    if (this.tod.hour >= CLOSING) {
      this.closing(dt, nav);
      return;
    }
    this.recall(dt);
    this.timer -= dt;
    if (this.timer > 0) return;
    const lunch = this.lunch;
    this.timer = between(lunch ? LUNCH.check : CHECK);
    const leaving = this.people.filter((p) => p.presence === 'leaving').length;
    if (this.absent.length >= this.target || leaving >= (lunch ? 3 : 2)) return;
    const candidates = this.people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.task && !p.printJob && !p.foosJob && !p.vapeJob);
    if (!candidates.length) return;
    // homebodies get several tickets in the draw
    const draw = candidates.flatMap((c) => Array<Person>(c.member.homebody ? HOMEBODY.weight : 1).fill(c));
    const p = draw[Math.floor(Math.random() * draw.length)];
    const stretch = this.weather.raining ? RAIN.errandStretch : 1;
    if (p.member.homebody) {
      // own room, so a full set of regular home offices doesn't keep them in
      p.homeVariant = this.freeVariant(p);
      p.leaveOffice(nav, 'home', between(HOME) * HOMEBODY.stay);
      return;
    }
    const homeShare = this.weather.raining ? RAIN.homeShare : lunch ? LUNCH.homeShare : HOME_SHARE;
    const home = Math.random() < homeShare && this.homeCount < MAX_HOME;
    if (home) p.homeVariant = this.freeVariant(p);
    p.leaveOffice(nav, home ? 'home' : 'errand', home ? between(HOME) : between(lunch ? LUNCH.errand : ERRAND) * stretch);
  }

  /** Time was moved back before closing: whoever went home for the day returns. */
  private recall(dt: number): void {
    this.recallTimer -= dt;
    if (this.recallTimer > 0) return;
    this.recallTimer = 1;
    for (const p of this.people) {
      if (p.awayKind !== 'off' || this.overridden.has(p)) continue;
      if (p.presence === 'out' && p.awayLeft > 600) p.awayLeft = between([3, 40]);
      else if (p.presence === 'leaving') p.cancelLeave();
    }
  }

  /** Closing time: one person after the other heads home for the day. */
  private closing(dt: number, nav: NavGrid): void {
    this.closingTimer -= dt;
    if (this.closingTimer > 0) return;
    this.closingTimer = between(CLOSING_CHECK);
    const leaving = this.people.filter((p) => p.presence === 'leaving').length;
    if (leaving >= 3) return;
    const stays = new Set([...NIGHT_OFFICE, NIGHT_HOME]);
    const candidates = this.people.filter(
      (p) => p.inOffice && !stays.has(p.id) && !this.overridden.has(p) && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob,
    );
    if (!candidates.length) return;
    const p = candidates[Math.floor(Math.random() * candidates.length)];
    p.leaveOffice(nav, 'off', OFF);
  }
}
