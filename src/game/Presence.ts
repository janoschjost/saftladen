import { HOME_COUNT } from '../render/homeOffice';
import { homeRoomOf, reservedRooms } from '../data/homeAssignments';
import { DOOR_LANES } from './Door';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import type { TimeOfDay } from './TimeOfDay';
import type { Weather } from './Weather';
import { random } from './rng';
import { petComesToday } from './petSchedule';

/** Share of the people on duty that is out of the office at any time (errands + home office). */
const ABSENT_SHARE = 0.36;
/** Share of the absences that are home office. */
const HOME_SHARE = 0.45;
/** Rain keeps people in: fewer errands, those who go take longer, more home office. */
const RAIN = { share: 0.75, homeShare: 0.6, errandStretch: 1.4 };
/** At most this many people are in the office by day; the surplus works from home (errand if all home rooms are taken). */
const MAX_OFFICE = 15;
const MAX_HOME = HOME_COUNT; // one live feed per home office variant
const CHECK = [2, 6]; // seconds between departure decisions
const ERRAND = [25, 70]; // seconds out for a coffee / parcel
const HOME = [90, 220]; // seconds of working from home
/** homebodies (see TeamMember.homebody): picked this much more often, stay this much longer, likely home at start */
const HOMEBODY = { weight: 6, stay: 2, startHome: 0.75 };

/** The working day rolls over at this hour: everybody gets a fresh plan. Hours after midnight count on (01:00 = 25). */
const DAY_START = 4;
/** Random spread (hours, +/-) around each person's habitual times (TeamMember.schedule), rolled once per day. */
const JITTER = { arrive: 0.4, leave: 0.55, lunch: 0.4 };
/**
 * Lunch: everybody pops out around their own lunch hour for `errand` seconds. Who is not free within `window` hours
 * skips it, `skip` of the team eats at the desk anyway. From `crowd` people out at once it counts as the lunch break.
 */
const LUNCH = { errand: [22, 45], window: 1.25, skip: 0.12, crowd: 4 };
/** Night shift (see Schedule.nightOwlChance): stays on until some hour in this range (26.5 = 02:30). */
const NIGHT_END = [21.5, 26.5];
/** Crunch: on some days a deadline keeps a few more people in for the night. */
const CRUNCH = { chance: 0.1, people: [2, 4] };
/** Errands and home office spells only start between these hours and not within `beforeLeave` hours of going home. */
const ERRANDS = { from: 7.5, to: 18, beforeLeave: 0.75 };
/** Seconds between two people walking in (so the door does not jam when the clock is moved by hand). */
const DOOR_GAP = [1.5, 4];
/**
 * Going home / to lunch: seconds between two people setting off, and how many may be on their way to the door at once.
 * Who is still not out after `patience` seconds (held up on the way) no longer counts, so they do not keep the rest in.
 */
const EXIT = { gap: [1, 3], max: 3, patience: 25 };
/** Nobody walks in while somebody on the way out is within `radius` metres of the door (the doorway fits one); after `wait` seconds they come in anyway. */
const DOOR_CLEAR = { radius: 3.5, wait: 6 };
/**
 * Arrivals (morning, errand / home office / lunch returns): at most `max` on their way in at once, `gap` seconds apart.
 * From `crowd` people queueing outside (e.g. everybody called back at once) they come in `crowdGap` seconds apart, so the entrance stays clear.
 */
const ENTRY = { max: 2, gap: [1.5, 3.5], crowd: 3, crowdGap: [3, 5] };
const OFF = 9999; // "off duty": stays away until their next working day starts

const between = ([a, b]: number[]) => a + random() * (b - a);
/** -spread .. +spread, most likely near 0 */
const jitter = (spread: number) => (random() + random() - 1) * spread;

/** One person's working day, rolled fresh every morning from their habitual schedule. */
interface DayPlan {
  arrive: number;
  /** leaves the office at this hour (night shift at home: moves to the home office then) */
  leave: number;
  /** done for the day at this hour (= `leave` unless they work at night) */
  end: number;
  lunch: number;
  lunched: boolean;
  night: boolean;
  /** remote worker (Schedule.visitChance) on a day away from the office: works from the home office all day */
  remote: boolean;
  /** remote worker's office visit: the team has greeted them already */
  greeted: boolean;
}

type Duty = 'duty' | 'home' | 'off';

/** Everybody keeps their own office hours; in between people pop out of the door (errand, lunch or home office) and come back later. */
export class Presence {
  private timer = 4;
  private plans = new Map<Person, DayPlan>();
  private lastHour = 0;
  private clock = 0;
  private doorSlot = 0;
  private exitSlot = 0;
  private entrySlot = 0;
  /** people cleared to walk in (their `awayLeft` may run out now) */
  private admitted = new Set<Person>();
  /** when the people on their way out set off (`clock`) */
  private exits = new Map<Person, number>();
  /** since when (`clock`) somebody waits outside for the doorway to clear */
  private waiting = new Map<Person, number>();
  private checkTimer = 0;
  private onDuty = 0;
  /** people who are out for lunch right now */
  private lunchers = new Set<Person>();
  /** people doing their night shift from the home office */
  private nightHomers = new Set<Person>();
  /** people the player moved by hand outside their hours: the schedule leaves them alone for the rest of the day */
  private overridden = new Set<Person>();
  /** the clock's `jumps` / `picks` already handled */
  private seenJumps: number;
  private seenPicks: number;
  /** people a scene holds where they are, in or out (`keep`): no plan, lunch, errand or call back moves them */
  private kept = new Set<Person>();
  /** dev: people taken out of the sim, hidden and off the schedule until they are restored (`remove` / `restore`) */
  private removed = new Set<Person>();
  /** people called back who are still outside: a full office does not hold them back (see capOffice), they still queue at the door */
  private calledBack = new Set<Person>();
  /** somebody was called back by hand (roster, "Alle zurückholen", H, a dev event): nobody is sent out to make room until the office is down to MAX_OFFICE on its own */
  private overfull = false;

  constructor(
    private people: readonly Person[],
    private tod: TimeOfDay,
    private weather: Weather,
  ) {
    this.rollDay();
    this.lastHour = this.workHour;
    this.seenJumps = tod.jumps;
    this.seenPicks = tod.picks;
  }

  /** Counts the working days: a new one starts at 04:00, or when the player picks another day. */
  days = 0;

  /** Weekday of the running working day, 0 = Monday (the clock's). */
  get weekday(): number {
    return this.tod.weekday;
  }

  /** Clock hour of the running working day: 04:00 .. 28:00 (hours after midnight count on). */
  private get workHour(): number {
    const h = this.tod.hour % 24;
    return h < DAY_START ? h + 24 : h;
  }

  /** People who are out on an errand or in the home office (not those who are off duty). */
  get away(): Person[] {
    return this.people.filter((p) => p.presence !== 'in' && p.awayKind !== 'off');
  }

  /** true while a good part of the team is out for lunch */
  get lunch(): boolean {
    return this.lunchers.size >= LUNCH.crowd;
  }

  get target(): number {
    return Math.round(this.onDuty * ABSENT_SHARE * (this.weather.raining ? RAIN.share : 1));
  }

  get absent(): Person[] {
    return this.people.filter((p) => p.presence !== 'in');
  }

  get homeCount(): number {
    return this.people.filter((p) => p.awayKind === 'home').length;
  }

  /** Today's hours of one person: their habitual times plus some jitter, now and then a night shift. */
  private roll(p: Person): DayPlan {
    const s = p.member.schedule;
    const arrive = s.arrive + jitter(JITTER.arrive);
    const leave = Math.max(arrive + 2, s.leave + jitter(JITTER.leave));
    const remote = s.visitChance !== undefined && random() >= s.visitChance;
    const lunch = p.member.homebody || remote || random() < LUNCH.skip ? Infinity : s.lunch + jitter(JITTER.lunch);
    const night = !remote && random() < s.nightOwlChance;
    return { arrive, leave, end: night ? Math.max(leave + 1, between(NIGHT_END)) : leave, lunch, lunched: false, night, remote, greeted: false };
  }

  /** A new working day: fresh plans for everybody, on some days a crunch keeps a few more people in for the night. */
  private rollDay(): void {
    this.days++;
    this.overfull = false; // a call back by hand does not carry over into another day
    this.overridden.clear();
    this.lunchers.clear();
    this.plans.clear();
    for (const p of this.people) this.plans.set(p, this.roll(p));
    this.rollPets();
    if (random() >= CRUNCH.chance) return;
    const pool = this.people.filter((p) => !p.member.homebody && !this.plans.get(p)!.night && !this.plans.get(p)!.remote).sort(() => random() - 0.5);
    for (const p of pool.slice(0, Math.round(between(CRUNCH.people)))) {
      const plan = this.plans.get(p)!;
      plan.night = true;
      plan.end = Math.max(plan.leave + 1, between(NIGHT_END));
    }
  }

  /** Which pets come along today. A pet that is away while its owner is still in (night shift) stays away until the owner's next arrival. */
  private rollPets(): void {
    for (const p of this.people) {
      for (const d of p.pets) {
        d.comesToday = petComesToday(d.visits, this.weekday) && !(d.away && p.presence !== 'out');
        if (!d.comesToday) d.sendAway(); // a time jump rolls the day again: a pet that now stays home leaves
      }
    }
  }

  /** Pets that come to the office today, with their owner (UI hint, and `__game.sim.presence.petsToday` in the console). */
  get petsToday(): Array<{ pet: string; owner: string }> {
    return this.people.flatMap((p) => p.pets.filter((d) => d.comesToday).map((d) => ({ pet: d.name, owner: p.member.name })));
  }

  private planOf(p: Person): DayPlan {
    let plan = this.plans.get(p);
    if (!plan) this.plans.set(p, (plan = this.roll(p)));
    return plan;
  }

  /** Where this person should be at `hour`: in the office (errands and home office spells included), on a night shift at home, or off. */
  private duty(p: Person, hour: number): Duty {
    const plan = this.planOf(p);
    if (hour < plan.arrive || hour >= plan.end) return 'off';
    if (plan.remote) return 'home';
    if (plan.night && p.member.schedule.nightHome && hour >= plan.leave) return 'home';
    return 'duty';
  }

  /** The colleague who works remotely and only visits (`visitChance` in the team data). */
  get remoteWorker(): Person | undefined {
    return this.people.find((p) => p.member.schedule.visitChance !== undefined);
  }

  /** Remote worker who is in the office today (a visit, see Schedule.visitChance). */
  isVisitor(p: Person): boolean {
    return p.member.schedule.visitChance !== undefined && !this.planOf(p).remote;
  }

  /** True once per visit, when the visitor has just walked in and the team should welcome them. */
  claimGreeting(p: Person): boolean {
    const plan = this.planOf(p);
    if (!this.isVisitor(p) || plan.greeted) return false;
    return (plan.greeted = true);
  }

  /** Dev: the remote worker comes to the office today (or goes back to the home office). */
  setVisit(p: Person, visit: boolean): void {
    const plan = this.planOf(p);
    if (plan.remote === !visit) return; // already so today: keeps the greeting and the hours
    plan.remote = !visit;
    plan.greeted = false;
    this.overridden.delete(p);
    // from now on, for a few hours at least
    plan.arrive = Math.min(plan.arrive, this.workHour - 0.01);
    plan.end = plan.leave = Math.max(plan.leave, this.workHour + 3);
    plan.lunch = Infinity;
    if (visit) this.nightHomers.delete(p); // an ordinary return through the door, not a night shift ending
  }

  /** Today's hours of everybody (for a look in the console: `__game.sim.presence.schedule`). */
  get schedule(): Array<{ id: string; arrive: number; leave: number; end: number; lunch: number; night: boolean; remote: boolean }> {
    return this.people.map((p) => {
      const { arrive, leave, end, lunch, night, remote } = this.planOf(p);
      return { id: p.id, arrive, leave, end, lunch, night, remote };
    });
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

  /** Some people are already gone when the game starts (`homes`: all eight home offices occupied, for a look at the rooms). */
  seed(homes = false): void {
    const hour = (this.lastHour = this.workHour);
    if (homes) {
      const fixed = this.people.filter((p) => homeRoomOf(p.id) !== null);
      const taken = new Set(fixed.map((p) => homeRoomOf(p.id)));
      const free = Array.from({ length: HOME_COUNT }, (_, i) => i).filter((i) => !taken.has(i));
      // a remote worker on a remote day takes one of them: he works from home anyway (nobody gives up a room for him)
      const remote = (p: Person) => (this.planOf(p).remote ? 0 : 1);
      const auto = this.people
        .filter((p) => homeRoomOf(p.id) === null)
        .sort((a, b) => remote(a) - remote(b))
        .slice(0, free.length);
      for (const p of fixed) {
        p.homeVariant = homeRoomOf(p.id)!;
        p.startAway('home', 9999);
      }
      auto.forEach((p, i) => {
        p.homeVariant = free[i];
        p.startAway('home', 9999);
      });
      for (const p of [...fixed, ...auto]) this.overridden.add(p);
      return;
    }
    // who is not at work at this hour starts outside
    for (const p of this.people) {
      const plan = this.planOf(p);
      plan.lunched = hour >= plan.lunch + 0.5;
      const duty = this.duty(p, hour);
      if (duty === 'duty') continue;
      if (duty === 'home') {
        p.homeVariant = this.freeVariant(p);
        this.nightHomers.add(p);
      }
      p.startAway(duty, OFF);
    }
    const onDuty = this.people.filter((p) => p.presence === 'in');
    this.onDuty = onDuty.length;
    if (hour < ERRANDS.from || hour >= ERRANDS.to) return; // early birds and the night shift sit at their desks
    const homebodies = onDuty.filter((p) => p.member.homebody && random() < HOMEBODY.startHome);
    for (const p of homebodies) {
      p.homeVariant = this.freeVariant(p);
      p.startAway('home', random() * HOME[1] * HOMEBODY.stay + 6);
    }
    const pool = onDuty.filter((p) => !p.member.homebody).sort(() => random() - 0.5);
    const n = Math.round(this.target * 0.8) - homebodies.length;
    for (const p of pool.slice(0, Math.max(0, n))) {
      const kind = random() < HOME_SHARE && this.roomFree ? 'home' : 'errand';
      if (kind === 'home') p.homeVariant = this.freeVariant(p);
      p.startAway(kind, random() * (kind === 'home' ? HOME[1] : ERRAND[1]) + 6);
    }
    // too many left in the office: the rest starts in the home office
    const staying = this.people.filter((p) => p.presence === 'in').sort(() => random() - 0.5);
    for (const p of staying.slice(MAX_OFFICE)) {
      const home = this.roomFree || p.member.homebody;
      if (home) p.homeVariant = this.freeVariant(p);
      p.startAway(home ? 'home' : 'errand', random() * (home ? HOME[1] : ERRAND[1]) + 6);
    }
  }

  /** People in the office or on their way back in; a smoker on the porch counts too (just outside the door, back any minute). */
  private get present(): number {
    return this.people.filter((p) => p.presence === 'in' || p.presence === 'returning' || p.onSmokeBreak).length;
  }

  /** Somebody who is not tied up right now (talk, meeting, printer, ...) nor held by a scene, and so free to walk out. */
  free(p: Person): boolean {
    return !this.kept.has(p) && p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob;
  }

  /** Free to be sent out by the simulation: not busy, not on the way somewhere, not the remote worker on his visit (he came to see the team; only lunch and the end of the day take him out). */
  private sendable(p: Person): boolean {
    return this.free(p) && !p.task && !this.isVisitor(p);
  }

  /**
   * May `p` step out for a cigarette now: on duty by day (not at night, not off), free (not steered, held, in a talk
   * or a meeting), not around their lunch, and the schedule has them (no scene holds them, not moved by hand today).
   */
  maySmoke(p: Person): boolean {
    const hour = this.workHour;
    if (this.leftAlone(p) || !this.free(p) || p.inMeeting || this.lunchers.has(p)) return false;
    if (hour < ERRANDS.from || hour >= ERRANDS.to || this.duty(p, hour) !== 'duty') return false;
    const plan = this.planOf(p);
    return plan.lunched || hour < plan.lunch - 0.25;
  }

  /** Out of the door for a cigarette, `seconds` on the porch. False when the door is busy right now (try again in a moment). */
  smokeBreak(p: Person, nav: NavGrid, seconds: number): boolean {
    if (!this.exitFree) return false;
    this.exit(p);
    p.leaveOffice(nav, 'smoke', seconds);
    return true;
  }

  /** A smoker on the porch has somewhere to be (lunch, home): finishes up now and comes in (through the door as usual). */
  private stubOut(p: Person): void {
    if (p.presence === 'out') p.awayLeft = Math.min(p.awayLeft, 1);
    else if (p.beforeDoor) p.cancelLeave();
  }

  /** In right away, not queued at the door (rain left no spot for this smoker: they must not stand about out there). */
  hurryIn(p: Person): void {
    p.awayLeft = 0;
    this.admitted.add(p);
  }

  /** Office over capacity: sends one person to the home office, holds back those about to return. Returns true if somebody left. */
  private capOffice(nav: NavGrid): boolean {
    const present = this.present;
    if (present < MAX_OFFICE) return false;
    // nobody walks back in while the office is full, except who was called back: they do (one after the other, see clearDoor)
    for (const p of this.people) if (p.presence === 'out' && p.awayKind !== 'off' && !p.onSmokeBreak && p.awayLeft > 0 && p.awayLeft < 5 && !this.calledBack.has(p)) p.awayLeft = 5 + random() * 15;
    if (present === MAX_OFFICE || this.overfull) return false;
    if (this.people.some((p) => p.presence === 'leaving')) return false;
    const candidates = this.people.filter((p) => this.sendable(p));
    if (!candidates.length) return false;
    const p = candidates[Math.floor(random() * candidates.length)];
    const home = this.roomFree || p.member.homebody;
    if (home) p.homeVariant = this.freeVariant(p);
    p.leaveOffice(nav, home ? 'home' : 'errand', home ? between(HOME) : between(ERRAND));
    return true;
  }

  /** A home office room for somebody who is not in a hurry: leaves one free for each remote worker still waiting for theirs. */
  private get roomFree(): boolean {
    const hour = this.workHour;
    let waiting = 0;
    for (const p of this.people) {
      const plan = this.planOf(p);
      if (plan.remote && hour >= plan.arrive && hour < plan.end && p.awayKind !== 'home' && !this.overridden.has(p)) waiting++;
    }
    return this.homeCount < MAX_HOME - waiting;
  }

  /**
   * Somebody in a shared home office who can give it up: ordinary home-office workers first (the one who would be
   * back soonest), people sent home by hand (or by `#homes`) only when nobody else is there. Never homebodies or a
   * night shift at home: their day is at home. Own rooms free none of the shared ones. Null: nobody can.
   */
  private roomToFree(): Person | null {
    let best: Person | null = null;
    let bestKept = true;
    for (const x of this.people) {
      if (x.presence !== 'out' || x.awayKind !== 'home' || x.homeVariant >= HOME_COUNT || x.member.homebody || this.nightHomers.has(x)) continue;
      const kept = this.overridden.has(x);
      if (!best || (kept === bestKept ? x.awayLeft < best.awayLeft : !kept)) [best, bestKept] = [x, kept];
    }
    return best;
  }

  /** `p` takes home office `room`; whoever works there comes back to the office (one person per room). */
  private moveInto(p: Person, room: number): void {
    p.homeVariant = room;
    for (const o of this.people) if (o !== p && o.awayKind === 'home' && (o.presence === 'out' || o.presence === 'leaving') && o.homeVariant === room) this.recall(o);
  }

  /** A home office for `p` now or soon: a free one, their own, or one that `roomToFree` can clear. */
  roomFor(p: Person): boolean {
    return !this.homeFull || homeRoomOf(p.id) !== null || this.roomToFree() !== null;
  }

  /**
   * All home offices taken: somebody leaves theirs and comes back to the office (`roomToFree`), so a room frees up in
   * a few seconds. One at a time: nothing happens while somebody is already on the way out of a room.
   */
  makeRoom(): void {
    for (const x of this.people) if (x.awayKind === 'home' && (x.presence === 'returning' || (x.presence === 'out' && x.awayLeft <= 1))) return;
    const o = this.roomToFree();
    if (o) this.comeBack(o);
  }

  get homeFull(): boolean {
    return this.homeCount >= MAX_HOME;
  }

  /**
   * Sends somebody home / out by hand: they stay away until called back (or 10 min). False (nothing changed) when
   * they can't go. With `takeRoom` a full home office is no obstacle: whoever `roomToFree` picks comes back to the
   * office and `p` gets that room (the dev event).
   */
  send(p: Person, kind: 'home' | 'errand', nav: NavGrid, takeRoom = false): boolean {
    if (p.presence !== 'in' || p.held || p.controlled || p.talk || this.kept.has(p) || this.removed.has(p)) return false;
    if (p.member.homebody) kind = 'home'; // never out on errands
    if (kind === 'home') {
      if (this.homeFull && homeRoomOf(p.id) === null) {
        const o = takeRoom ? this.roomToFree() : null;
        if (!o) return false;
        this.moveInto(p, o.homeVariant);
      } else this.moveInto(p, this.freeVariant(p));
    }
    if (this.duty(p, this.workHour) !== 'duty') this.overridden.add(p);
    p.leaveOffice(nav, kind, 600, true);
    return true;
  }

  /** Dev event: off home as if their day ended (an alter ego spins and walks out as itself); back after `seconds`. */
  goHome(p: Person, nav: NavGrid, seconds: number): boolean {
    if (!this.free(p)) return false;
    this.overridden.add(p);
    p.leaveOffice(nav, 'off', seconds);
    return true;
  }

  /** Dev events: straight out of the office (no walk to the door), into the home office or on an errand; back after `seconds`. */
  awayNow(p: Person, kind: 'home' | 'errand', seconds: number): void {
    if (this.kept.has(p) || this.removed.has(p)) return;
    this.overridden.add(p);
    if (kind === 'home') {
      this.moveInto(p, this.freeVariant(p));
    }
    p.startAway(kind, seconds);
  }

  /** The schedule does not move this person: the player did by hand today, a scene holds them or the dev panel took them out. */
  private leftAlone(p: Person): boolean {
    return this.overridden.has(p) || this.kept.has(p) || this.removed.has(p);
  }

  /** A scene holds this person where they are: in the office they stay in, out they stay out, until `letGo`. */
  keep(p: Person): void {
    this.kept.add(p);
    if (p.presence === 'out') p.awayLeft = Infinity;
    this.lunchers.delete(p);
    this.nightHomers.delete(p);
  }

  /**
   * The schedule has them again (also somebody the player moved by hand today): who was kept out comes back in, and
   * leaves again if their day is over.
   */
  letGo(p: Person): void {
    const was = this.kept.delete(p);
    this.overridden.delete(p);
    if (was && p.presence === 'out' && !this.removed.has(p)) {
      // in right away, even when the office is full: not queued at the door, where a full office would push them back again
      p.awayLeft = 0;
      this.admitted.add(p);
    }
  }

  /** Dev: takes somebody out of the sim at once. They are off the schedule, off the roster and ignored by every call back until `restore`. */
  remove(p: Person): void {
    this.removed.add(p);
    this.kept.delete(p);
    this.overridden.delete(p);
    this.lunchers.delete(p);
    this.nightHomers.delete(p);
    this.admitted.delete(p);
    this.waiting.delete(p);
    this.exits.delete(p);
    this.calledBack.delete(p);
    if (p.presence === 'out' && !p.onSmokeBreak) {
      p.awayKind = 'off';
      p.awayLeft = OFF;
    } else {
      p.startAway('off', OFF); // hides them on the spot and ends whatever they were walking to
    }
  }

  /** Dev: back into the sim. They follow today's plan again: in through the door if they are on duty, else they stay off. */
  restore(p: Person): void {
    this.removed.delete(p);
  }

  isRemoved(p: Person): boolean {
    return this.removed.has(p);
  }

  /** A scene holds this person where they are (`keep`). */
  isKept(p: Person): boolean {
    return this.kept.has(p);
  }

  /** Bring somebody back to the office (by hand): they come and stay, even into a full office (see `overfull`). */
  callBack(p: Person): void {
    if (this.kept.has(p) || this.removed.has(p)) return;
    this.overfull = true;
    this.recall(p);
  }

  /** Dev: on duty from now on (not sent out again, even when the office is full), like `callBack`. False when a scene or the dev panel holds them. */
  stay(p: Person): boolean {
    if (this.isRemoved(p) || this.kept.has(p)) return false;
    this.overfull = true;
    if (this.duty(p, this.workHour) !== 'duty') this.overridden.add(p);
    this.calledBack.delete(p);
    this.admitted.delete(p);
    return true;
  }

  /** Back to the office (also automatic, e.g. out of a home office somebody else needs): a full office makes room by sending somebody else out (see capOffice), unless a call back by hand holds it (`overfull`). */
  private recall(p: Person): void {
    if (this.duty(p, this.workHour) !== 'duty') this.overridden.add(p);
    if (p.presence === 'out') this.comeBack(p);
    else p.cancelLeave();
  }

  /** Out and back in now, even when the office is full (see capOffice). */
  private comeBack(p: Person): void {
    p.awayLeft = 0;
    this.calledBack.add(p);
  }

  callAllBack(): void {
    for (const p of this.absent) this.callBack(p);
  }

  /** Home office <-> office for one person (H key). */
  toggleHome(p: Person, nav: NavGrid): void {
    if (p.presence === 'in') this.send(p, 'home', nav);
    else this.callBack(p);
  }

  /** May one more person set off for the door right now? */
  private get exitFree(): boolean {
    if (this.clock < this.exitSlot) return false;
    let busy = 0;
    for (const [p, since] of this.exits) {
      if (p.presence !== 'leaving') this.exits.delete(p);
      else if (this.clock - since < EXIT.patience) busy++;
    }
    return busy < EXIT.max;
  }

  private exit(p: Person): void {
    this.exitSlot = this.clock + between(EXIT.gap);
    this.exits.set(p, this.clock);
  }

  /**
   * Keeps people from walking in against somebody who is about to walk out, and lets them in one after the other:
   * at most `ENTRY.max` on their way in at once, `ENTRY.gap` seconds apart (errand / home office / lunch returns pile up otherwise),
   * further apart while a crowd queues outside (mass return).
   */
  private clearDoor(): void {
    const busy = this.people.some((p) => p.presence === 'leaving' && DOOR_LANES.some((l) => Math.hypot(p.pos.x - l.in.x, p.pos.z - l.in.z) < DOOR_CLEAR.radius));
    let entering = 0;
    let queue = 0;
    for (const p of this.people) {
      if (p.presence === 'returning') entering++;
      else if (this.admitted.has(p) && p.presence === 'out') entering++;
      else this.admitted.delete(p);
      if (p.presence === 'out' && p.awayLeft <= 0.5 && !this.admitted.has(p)) queue++;
    }
    const gap = queue >= ENTRY.crowd ? ENTRY.crowdGap : ENTRY.gap;
    for (const p of this.people) {
      if (p.presence !== 'out') {
        this.waiting.delete(p);
        this.calledBack.delete(p);
        continue;
      }
      if (p.awayLeft >= 1) this.calledBack.delete(p); // sent away again before they got in
      if (p.awayLeft >= 0.5 || this.admitted.has(p)) continue;
      if (busy) {
        const since = this.waiting.get(p) ?? this.clock;
        this.waiting.set(p, since);
        if (this.clock - since < DOOR_CLEAR.wait) {
          p.awayLeft = 0.5;
          continue;
        }
      }
      if (entering >= ENTRY.max || this.clock < this.entrySlot) {
        p.awayLeft = 0.5; // queue outside until the lounge has room
        continue;
      }
      this.waiting.delete(p);
      this.admitted.add(p);
      this.entrySlot = this.clock + between(gap);
      entering++;
    }
  }

  /** Off duty (or night shift at home): out of the door and away until the plan says otherwise. */
  private sendOff(p: Person, kind: 'off' | 'home', nav: NavGrid): void {
    if (p.onSmokeBreak) return this.stubOut(p); // on the porch: comes back in first, then goes

    // a regular remote day needs a room: somebody makes room, he comes in as soon as it is free
    if (kind === 'home' && p.awayKind !== 'home' && this.homeCount >= MAX_HOME && this.planOf(p).remote) {
      this.makeRoom();
      return;
    }
    switch (p.presence) {
      case 'in':
        if (!this.free(p) || !this.exitFree) return;
        this.exit(p);
        if (kind === 'home') p.homeVariant = this.freeVariant(p);
        p.leaveOffice(nav, kind, OFF);
        break;
      case 'leaving':
      case 'out':
        if (p.awayKind === kind && p.awayLeft >= OFF - 1) return;
        if (kind === 'home' && p.awayKind !== 'home') p.homeVariant = this.freeVariant(p);
        p.leaveAs(kind);
        p.awayLeft = OFF;
        break;
      default:
        return; // just walking in: turns around once inside
    }
    if (kind === 'home') this.nightHomers.add(p);
    else this.nightHomers.delete(p);
    this.lunchers.delete(p);
  }

  /** Their day starts: in through the door, one after the other. With a full office (and for homebodies) the day starts away. */
  private arrive(p: Person): void {
    const coming = this.people.filter((o) => o.presence === 'out' && o.awayKind === 'off' && o.awayLeft < 600).length;
    const full = this.present + coming >= MAX_OFFICE;
    if (p.member.homebody ? random() < HOMEBODY.startHome : full) {
      // no room: the day starts in the home office, or out and about when all home rooms are taken
      const home = p.member.homebody || this.roomFree;
      if (home) p.homeVariant = this.freeVariant(p);
      p.awayKind = home ? 'home' : 'errand';
      p.awayLeft = home ? between(HOME) * (p.member.homebody ? HOMEBODY.stay : 1) : between(ERRAND);
      return;
    }
    this.doorSlot = Math.max(this.doorSlot + between(DOOR_GAP), this.clock + random());
    p.awayLeft = this.doorSlot - this.clock;
  }

  /** Lunch at their own hour. */
  private lunchBreak(p: Person, plan: DayPlan, hour: number, nav: NavGrid): void {
    if (hour < plan.lunch) plan.lunched = false; // clock moved back
    if (plan.lunched || hour < plan.lunch) return;
    if (p.onSmokeBreak) return this.stubOut(p); // lunch time: the cigarette goes out, they come in and then go
    if (p.presence !== 'in' || hour > plan.lunch + LUNCH.window || hour > plan.leave - ERRANDS.beforeLeave) {
      plan.lunched = true; // ate at home / on the way / not at all
      return;
    }
    if (!this.free(p) || !this.exitFree) return;
    this.exit(p);
    plan.lunched = true;
    this.lunchers.add(p);
    p.leaveOffice(nav, 'errand', between(LUNCH.errand) * (this.weather.raining ? RAIN.errandStretch : 1));
  }

  /** Holds everybody to today's plan: arrivals, lunch, going home, night shifts. */
  private followPlans(hour: number, nav: NavGrid): void {
    let onDuty = 0;
    for (const p of this.lunchers) if (p.presence === 'in') this.lunchers.delete(p);
    for (const p of this.people) {
      const duty = this.duty(p, hour);
      if (duty !== 'off' && !this.removed.has(p)) onDuty++;
      if (this.leftAlone(p)) continue;
      if (duty !== 'duty') {
        this.sendOff(p, duty, nav);
        continue;
      }
      if (p.presence === 'leaving' && p.awayKind === 'off') {
        p.cancelLeave(); // clock moved back
      } else if (p.presence === 'out' && p.awayKind === 'off' && p.awayLeft > 600) {
        this.arrive(p);
      } else if (p.presence === 'out' && p.awayKind === 'home' && this.nightHomers.has(p)) {
        this.nightHomers.delete(p); // clock moved back: an ordinary home office spell again
        p.awayLeft = between(HOME) * 0.5;
      } else {
        this.lunchBreak(p, this.planOf(p), hour, nav);
      }
    }
    this.onDuty = onDuty;
  }

  /**
   * The player jumped in time (picked another day: fresh plans first). Lunch is settled for the new hour, who is now
   * off duty and free vanishes at once (busy people follow as soon as they are free), and who is now on duty walks
   * in through the door one after the other (followPlans, right on the next tick).
   */
  private jump(newDay: boolean): void {
    if (newDay) this.rollDay();
    this.overfull = false; // nor into another hour
    const hour = (this.lastHour = this.workHour);
    for (const p of this.people) {
      const plan = this.planOf(p);
      plan.lunched = hour >= plan.lunch + 0.5;
      if (this.leftAlone(p)) continue;
      const duty = this.duty(p, hour);
      if (duty === 'duty' || !this.free(p)) continue;
      if (duty === 'home') {
        p.homeVariant = this.freeVariant(p);
        this.nightHomers.add(p);
      }
      this.lunchers.delete(p);
      p.startAway(duty, OFF);
      for (const d of p.pets ?? []) d.sendAway();
    }
    this.checkTimer = 0;
  }

  /** The player jumped in time since last looked: puts everybody where the new time wants them. `Game` calls it every frame too, so a jump while paused applies at once. */
  applyJump(): void {
    if (this.tod.jumps === this.seenJumps) return;
    const newDay = this.tod.picks !== this.seenPicks;
    this.seenJumps = this.tod.jumps;
    this.seenPicks = this.tod.picks;
    this.jump(newDay);
  }

  update(dt: number, nav: NavGrid): void {
    this.clock += dt;
    this.applyJump();
    const hour = this.workHour;
    if (hour < this.lastHour - 20) this.rollDay(); // past 04:00 (a smaller step back is the player moving the clock)
    this.lastHour = hour;
    this.checkTimer -= dt;
    if (this.checkTimer <= 0) {
      this.checkTimer = 0.5;
      this.followPlans(hour, nav);
    }
    this.clearDoor();
    if (this.overfull && !this.calledBack.size && this.present <= MAX_OFFICE) this.overfull = false;
    if (hour < ERRANDS.from || hour >= ERRANDS.to) return;
    this.capOffice(nav);
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = between(CHECK);
    if (this.overfull && this.present >= MAX_OFFICE) return; // called back by hand into a full office: nobody goes out on an errand or to the home office for now
    const leaving = this.people.filter((p) => p.presence === 'leaving').length;
    // enough people out already; a full office still lets somebody go, so that those waiting outside get their turn
    // smokers on the porch are back any minute: they take nobody's turn for an errand
    const out = this.away.filter((p) => !p.onSmokeBreak).length;
    if ((out >= this.target && this.present < MAX_OFFICE) || leaving >= 2) return;
    const candidates = this.people.filter((p) => {
      if (!this.sendable(p) || this.leftAlone(p)) return false;
      const plan = this.planOf(p);
      // not right before lunch or going home
      return this.duty(p, hour) === 'duty' && hour < plan.leave - ERRANDS.beforeLeave && (plan.lunched || hour < plan.lunch - 0.5);
    });
    if (!candidates.length) return;
    // homebodies get several tickets in the draw
    const draw = candidates.flatMap((c) => Array<Person>(c.member.homebody ? HOMEBODY.weight : 1).fill(c));
    const p = draw[Math.floor(random() * draw.length)];
    const stretch = this.weather.raining ? RAIN.errandStretch : 1;
    if (p.member.homebody) {
      // own room, so a full set of regular home offices doesn't keep them in
      p.homeVariant = this.freeVariant(p);
      p.leaveOffice(nav, 'home', between(HOME) * HOMEBODY.stay);
      return;
    }
    const homeShare = this.weather.raining ? RAIN.homeShare : HOME_SHARE;
    const home = random() < homeShare && this.roomFree;
    if (home) p.homeVariant = this.freeVariant(p);
    p.leaveOffice(nav, home ? 'home' : 'errand', home ? between(HOME) : between(ERRAND) * stretch);
  }
}
