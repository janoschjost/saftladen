import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import type { TeamMember } from '../data/types';
import type { NavGrid } from './NavGrid';
import type { AwayKind, Person } from './Person';
import { transformsOnLeave } from './AlterEgo';
import { Presence } from './Presence';
import { cycleOf, hourOf, TimeOfDay } from './TimeOfDay';
import type { Weather } from './Weather';
import { setSeed } from './rng';

const STEP = 1 / 60;
/** Seconds a stand-in takes to walk to the door / back in from the porch. */
const WALK = 4;
/** Real seconds per 24 h cycle, as in TimeOfDay. */
const CYCLE_SECONDS = 600;

/** Cycle position of a clock hour (inverse of `hourOf`, which rises monotonically over the day). */
function cycleAt(hour: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (hourOf(mid) < hour) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Stand-in for Person with just the presence part: walks out of the door in `WALK` seconds, stays away for
 * `awayLeft`, walks back in. Presence only ever talks to people through these fields and methods.
 */
class Stub {
  presence: 'in' | 'leaving' | 'out' | 'returning' = 'in';
  awayKind: AwayKind | null = null;
  awayLeft = 0;
  homeVariant = 0;
  preferredHome = 0;
  held = false;
  controlled = false;
  talk = null;
  meetJob = null;
  printJob = null;
  foosJob = null;
  vapeJob = null;
  task = null;
  pos = { x: 0, z: 0 };
  /** every walk out of the door: kind and whether an alter ego transforms (#32) */
  leaves: Array<{ kind: AwayKind; transform: boolean; manual: boolean }> = [];
  private walk = 0;

  constructor(readonly member: TeamMember) {}

  get id(): string {
    return this.member.id;
  }
  get inOffice(): boolean {
    return this.presence === 'in';
  }
  leaveOffice(_nav: NavGrid, kind: AwayKind, seconds: number, manual = false): void {
    this.leaves.push({ kind, transform: transformsOnLeave(this.member, kind, manual), manual });
    this.presence = 'leaving';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.walk = WALK;
  }
  leaveAs(kind: AwayKind): void {
    this.awayKind = kind;
    const last = this.leaves.at(-1);
    // Person.leaveAs: re-targeted on the way out, an alter ego going home now still transforms (unless sent by hand)
    if (this.presence === 'leaving' && last) Object.assign(last, { kind, transform: last.transform || transformsOnLeave(this.member, kind, last.manual) });
  }
  startAway(kind: AwayKind, seconds: number): void {
    this.presence = 'out';
    this.awayKind = kind;
    this.awayLeft = seconds;
  }
  cancelLeave(): void {
    if (this.presence !== 'leaving') return;
    this.presence = 'in';
    this.awayKind = null;
  }
  update(dt: number): void {
    if (this.presence === 'leaving' && (this.walk -= dt) <= 0) this.presence = 'out';
    else if (this.presence === 'out' && (this.awayLeft -= dt) <= 0) {
      this.presence = 'returning';
      this.walk = WALK;
    } else if (this.presence === 'returning' && (this.walk -= dt) <= 0) {
      this.presence = 'in';
      this.awayKind = null;
    }
  }
}

interface Sample {
  hour: number;
  inOffice: number;
  home: number;
  homeRooms: number[];
  lunch: boolean;
  returning: number;
  states: string;
}

/** Runs one working day from `from` to `to` o'clock with a fixed seed; samples every simulated second. */
function runDay(seed: number, from = 5, to = 23, raining = false) {
  setSeed(seed);
  let cycle = cycleAt(from);
  const clock = { hour: hourOf(cycle) };
  const people = team.map((m) => new Stub(m));
  for (const p of people) p.startAway('off', 9999); // night before: everybody at home
  const presence = new Presence(people as unknown as Person[], clock as unknown as TimeOfDay, { raining } as Weather);
  const plans = new Map(presence.schedule.map((s) => [s.id, s]));
  const nav = {} as NavGrid;
  const samples: Sample[] = [];
  let t = 0;
  while (clock.hour < to) {
    presence.update(STEP, nav);
    for (const p of people) p.update(STEP);
    cycle += STEP / CYCLE_SECONDS;
    clock.hour = hourOf(cycle);
    if ((t += STEP) >= 1) {
      t -= 1;
      const home = people.filter((p) => p.awayKind === 'home' && p.presence === 'out');
      samples.push({
        hour: clock.hour,
        inOffice: people.filter((p) => p.presence === 'in').length,
        home: home.length,
        homeRooms: home.map((p) => p.homeVariant),
        lunch: presence.lunch,
        returning: people.filter((p) => p.presence === 'returning').length,
        states: people.map((p) => `${p.presence[0]}${p.awayKind?.[0] ?? '-'}`).join(''),
      });
    }
  }
  return { samples, plans, people, presence, nav };
}

describe('presence', () => {
  it('determinism: same seed, same day', () => {
    const a = runDay(42);
    const b = runDay(42);
    expect(b.samples).toEqual(a.samples);
    expect(b.plans).toEqual(a.plans);
    expect(runDay(43).samples).not.toEqual(a.samples);
  });

  it('presence.hours: plans scatter around each habitual time', () => {
    const { plans } = runDay(1, 5, 5.1);
    for (const m of team) {
      const plan = plans.get(m.id)!;
      expect(Math.abs(plan.arrive - m.schedule.arrive)).toBeLessThanOrEqual(0.4);
      expect(plan.leave).toBeGreaterThan(plan.arrive);
      if (!plan.night) expect(plan.end).toBe(plan.leave);
    }
    const arrivals = new Set([...plans.values()].map((p) => p.arrive.toFixed(3)));
    expect(arrivals.size).toBe(team.length); // staggered, nobody shares the exact minute
  });

  it('presence.hours: nobody is in before their arrival or after their day ends', () => {
    for (const seed of [1, 2, 3]) {
      const { samples, plans, people } = runDay(seed);
      // in the office (not counting the walk out of the door) only within today's plan
      for (const s of samples) {
        people.forEach((p, i) => {
          if (s.states[i * 2] !== 'i') return;
          const plan = plans.get(p.id)!;
          expect(s.hour).toBeGreaterThanOrEqual(plan.arrive);
          // going home queues at the door (max 3 at once, a gap between them): measured up to ~0.5 h late
          expect(s.hour).toBeLessThan(plan.end + 1);
        });
      }
    }
  });

  it('presence.night-shift: the office is empty late at night except for night owls', () => {
    const { samples, plans } = runDay(2, 5, 23.5);
    const owls = [...plans.values()].filter((p) => p.night && p.end > 23.4).length;
    const late = samples.filter((s) => s.hour > 23.3);
    for (const s of late) expect(s.inOffice).toBeLessThanOrEqual(owls);
  });

  it('presence.caps: at most 15 in the office, at most 8 home offices, one person per room', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      for (const s of runDay(seed).samples) {
        expect(s.inOffice).toBeLessThanOrEqual(15);
        expect(new Set(s.homeRooms).size).toBe(s.homeRooms.length);
      }
    }
  });

  it('presence.lunch: a lunch break happens, never before the first lunch hour of the day', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { samples, plans } = runDay(seed);
      const first = Math.min(...[...plans.values()].map((p) => p.lunch));
      const lunch = samples.filter((s) => s.lunch);
      expect(lunch.length).toBeGreaterThan(0);
      for (const s of lunch) expect(s.hour).toBeGreaterThanOrEqual(first);
    }
  });

  it('presence.share: during core hours a good part of the team is out', () => {
    const { samples } = runDay(5);
    const core = samples.filter((s) => s.hour > 9.5 && s.hour < 11.5);
    const avgIn = core.reduce((n, s) => n + s.inOffice, 0) / core.length;
    expect(avgIn).toBeLessThan(team.length * 0.85);
    expect(avgIn).toBeGreaterThan(team.length * 0.3);
  });

  it('presence.door-flow: arrivals come in one after another, at most 2 on their way in at once', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { samples } = runDay(seed);
      expect(samples.some((s) => s.returning > 0)).toBe(true);
      for (const s of samples) expect(s.returning).toBeLessThanOrEqual(2);
    }
  });

  /** A day run to 11:00 (the clock then stands still) with exactly 15 in: whoever is missing to 15 is back at the desk already. */
  function fullOffice(seed: number) {
    const { people, presence, nav } = runDay(seed, 5, 11);
    const step = () => {
      presence.update(STEP, nav);
      for (const p of people) p.update(STEP);
    };
    const present = () => people.filter((p) => p.presence === 'in' || p.presence === 'returning').length;
    const left = () => people.reduce((n, p) => n + p.leaves.length, 0);
    for (const p of people) {
      if (present() >= 15 || p.presence !== 'out' || p.awayKind === 'off') continue;
      p.presence = 'in';
      p.awayKind = null;
    }
    expect(present()).toBe(15);
    return { people, presence, step, present, left, away: people.filter((p) => p.presence === 'out' && p.awayKind !== 'off') };
  }

  it('presence.caps: called back into a full office, everybody comes in and stays, nobody is sent out to make room', () => {
    for (const seed of [1, 2, 3]) {
      const { people, presence, step, present, left, away } = fullOffice(seed);
      expect(away.length).toBeGreaterThan(2);
      const before = left();
      // one called back from the roster: in within seconds, and nobody leaves for them
      const one = away[0];
      presence.callBack(one as unknown as Person);
      let t = 0;
      for (; t < 30 && one.presence !== 'in'; t += STEP) step();
      expect(one.presence, `seed ${seed}`).toBe('in');
      expect(t).toBeLessThan(10);
      expect(present(), `seed ${seed}`).toBe(16);
      // "all back": everybody comes in, at most 2 on their way in at once
      const rest = away.slice(1);
      const arrived = new Set<Stub>();
      presence.callAllBack();
      for (t = 0; t < 180 && arrived.size < rest.length; t += STEP) {
        step();
        for (const p of rest) if (p.presence === 'in') arrived.add(p);
        expect(people.filter((p) => p.presence === 'returning').length).toBeLessThanOrEqual(2);
      }
      expect(rest.filter((p) => !arrived.has(p)).map((p) => p.id), `seed ${seed}`).toEqual([]);
      // and they stay: neither the cap nor an errand or home-office draw sends anybody out
      for (t = 0; t < 120; t += STEP) step();
      expect(left() - before, `seed ${seed}: sent out`).toBe(0);
      expect(present(), `seed ${seed}: everybody in, off duty too`).toBe(people.length);
    }
  });

  it('presence.caps: after a call back the office empties on its own; once down to 15 the cap works as before', () => {
    const { people, presence, step, present, left, away } = fullOffice(1);
    const [one, other] = away;
    presence.callBack(one as unknown as Person);
    for (let t = 0; t < 30 && one.presence !== 'in'; t += STEP) step();
    expect(present()).toBe(16);
    // the office stays at 16: nobody is sent out
    const quiet = left();
    for (let t = 0; t < 60; t += STEP) step();
    expect(left()).toBe(quiet);
    expect(present()).toBe(16);
    // somebody leaves on their own (e.g. lunch): back at 15, the exception ends
    const gone = people.find((p) => p.presence === 'in' && p !== one)!;
    gone.presence = 'out';
    gone.awayKind = 'errand';
    gone.awayLeft = 600;
    step();
    // back to normal: one more in without a call back (16 again), and the cap sends somebody out to make room
    other.presence = 'in';
    other.awayKind = null;
    const before = left();
    step(); // the cap acts on the very next update (an errand draw would wait for its timer)
    expect(left()).toBe(before + 1);
  });

  it('kurt.behavior: Marco transforms when going home (end of day, home office), never for errands, lunch or a manual send', () => {
    let homeSpells = 0;
    let homeDays = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { people } = runDay(seed);
      const marco = people.find((p) => p.id === 'marco-rieser')!;
      // most days he walks out of the door for home (some days his day ends while he is out on an errand)
      if (marco.leaves.some((l) => l.kind === 'off' || l.kind === 'home')) homeDays++;
      for (const l of marco.leaves) expect(l.transform).toBe(l.kind !== 'errand');
      homeSpells += marco.leaves.filter((l) => l.kind === 'home').length;
      for (const p of people) if (!p.member.alterEgo) expect(p.leaves.every((l) => !l.transform)).toBe(true);
    }
    expect(homeDays).toBeGreaterThanOrEqual(5);
    expect(homeSpells).toBeGreaterThan(0);
    // sent home by hand (H / action card): stays Marco
    const { people, presence, nav } = runDay(1, 5, 11);
    const marco = people.find((p) => p.id === 'marco-rieser')!;
    if (marco.presence !== 'in') marco.presence = 'in';
    marco.leaves = [];
    presence.send(marco as unknown as Person, 'home', nav);
    presence.send(marco as unknown as Person, 'errand', nav);
    expect(marco.leaves.length).toBeGreaterThan(0);
    expect(marco.leaves.every((l) => !l.transform)).toBe(true);
  });

  it('kurt.home: the dev event never puts Marco into a taken room; whoever sits there comes back', () => {
    const { people, presence } = runDay(1, 5, 11);
    const marco = people.find((p) => p.id === 'marco-rieser')!;
    for (const p of people) if (p.awayKind === 'home') p.startAway('errand', 600); // nobody at home yet
    // home office full: every room taken by somebody else
    const others = people.filter((p) => p !== marco).slice(0, 8);
    others.forEach((p, i) => {
      p.startAway('home', 600);
      p.homeVariant = i;
    });
    presence.awayNow(marco as unknown as Person, 'home', 120);
    const sharing = others.filter((p) => p.homeVariant === marco.homeVariant);
    expect(sharing.length).toBeGreaterThan(0);
    for (const p of sharing) expect(p.awayLeft).toBe(0); // on the way back to the office
    for (const p of people) p.update(STEP);
    const home = people.filter((p) => p.awayKind === 'home' && p.presence === 'out').map((p) => p.homeVariant);
    expect(new Set(home).size).toBe(home.length);
  });

  it('presence.remote-visit: Zlatko is rarely in the office, the other days he works from the home office', () => {
    const idx = team.findIndex((m) => m.id === 'zlatko-pesic');
    expect(team[idx].schedule.visitChance).toBeGreaterThan(0);
    let visits = 0;
    let remoteDay = false;
    let visitDay = false;
    for (let seed = 1; seed <= 40; seed++) {
      const { samples, plans } = runDay(seed, 5, 19);
      const plan = plans.get('zlatko-pesic')!;
      const during = samples.filter((s) => s.hour > plan.arrive + 0.3 && s.hour < plan.leave - 0.3);
      if (plan.remote) {
        remoteDay = true;
        // never at the desk, in the home office nearly all day (he waits for a free room at most a little while)
        const at = (s: { states: string }) => s.states.slice(idx * 2, idx * 2 + 2);
        for (const s of during) expect(at(s)[0]).not.toBe('i');
        expect(during.filter((s) => at(s) === 'oh').length / during.length).toBeGreaterThan(0.8);
      } else {
        visits++;
        visitDay = true;
        expect(during.some((s) => s.states[idx * 2] === 'i')).toBe(true);
      }
    }
    expect(remoteDay && visitDay).toBe(true);
    expect(visits / 40).toBeLessThan(0.35); // rare (chance 0.12)
    // everybody else comes in every day
    for (const seed of [1, 2, 3]) {
      const { plans } = runDay(seed, 5, 5.1);
      for (const [id, plan] of plans) if (id !== 'zlatko-pesic') expect(plan.remote, id).toBe(false);
    }
  });

  it('presence.door-flow: after "all back" the crowd walks in spaced out, one by one', () => {
    for (const seed of [1, 2, 3]) {
      setSeed(seed);
      const clock = { hour: 11 };
      const people = team.map((m) => new Stub(m));
      const presence = new Presence(people as unknown as Person[], clock as unknown as TimeOfDay, { raining: false } as Weather);
      const nav = {} as NavGrid;
      // a quiet office: everybody is out on an errand or in the home office for a long while
      people.forEach((p, i) => p.startAway(i % 2 ? 'errand' : 'home', 500));
      presence.callAllBack();
      // when each of them starts walking in (only the first time: the full office sends others out, who come back later)
      const starts: number[] = [];
      const started = new Set<Stub>();
      let t = 0;
      let maxIn = 0;
      while (t < 240 && started.size < people.length) {
        presence.update(STEP, nav);
        for (const p of people) {
          const was = p.presence;
          p.update(STEP);
          if (was === 'out' && p.presence === 'returning' && !started.has(p)) {
            started.add(p);
            starts.push(t);
          }
        }
        maxIn = Math.max(maxIn, people.filter((p) => p.presence === 'returning').length);
        t += STEP;
      }
      expect(maxIn).toBeLessThanOrEqual(2);
      // everybody called back walks in, even past the office's limit (presence.caps)
      expect(starts.length).toBe(people.length);
      // while a crowd still waits outside (all but the last two), at least 3 s between two people
      const crowd = starts.slice(0, -2);
      for (let i = 1; i < crowd.length; i++) expect(crowd[i] - crowd[i - 1]).toBeGreaterThanOrEqual(3 - STEP);
    }
  });
});

describe('time jumps', () => {
  /** The whole team at home at `hour` on a stopped clock; `run(seconds)` steps the simulation. */
  function office(seed: number, hour: number) {
    setSeed(seed);
    const tod = new TimeOfDay();
    tod.auto = false;
    tod.setCycle(cycleOf(hour));
    const people = team.map((m) => new Stub(m));
    for (const p of people) p.startAway('off', 9999);
    const presence = new Presence(people as unknown as Person[], tod, { raining: false } as Weather);
    const nav = {} as NavGrid;
    const run = (seconds: number) => {
      for (let t = 0; t < seconds; t += STEP) {
        presence.update(STEP, nav);
        for (const p of people) p.update(STEP);
      }
    };
    const plans = () => new Map(presence.schedule.map((s) => [s.id, s]));
    return { tod, people, presence, run, plans };
  }

  it('time.jump: jumping into the working day brings the people on duty in through the door', () => {
    const { tod, people, run, plans } = office(1, 23.5);
    run(1);
    expect(people.filter((p) => p.presence === 'in')).toHaveLength(0);
    tod.jumpToHour(11);
    run(120);
    const today = plans();
    const onDuty = people.filter((p) => today.get(p.id)!.arrive <= 11 && today.get(p.id)!.end > 11);
    expect(onDuty.length).toBeGreaterThan(10);
    // everybody on duty is in or out on an errand / in the home office, nobody is still waiting at home
    for (const p of onDuty) expect(p.presence === 'out' && p.awayKind === 'off').toBe(false);
    // the jump keeps today's plans
    expect(plans()).toEqual(today);
  });

  it('presence.caps: a time jump ends the call-back exception, the cap sends people out again', () => {
    const { tod, people, presence, run } = office(1, 11);
    run(120);
    presence.callAllBack();
    run(120);
    expect(people.filter((p) => p.presence === 'in').length).toBeGreaterThan(16);
    const sent = () => people.reduce((n, p) => n + p.leaves.filter((l) => l.kind !== 'off').length, 0);
    const before = sent();
    run(30);
    expect(sent()).toBe(before); // the exception holds: nobody is sent out
    tod.jumpToHour(10);
    run(30);
    expect(sent()).toBeGreaterThan(before);
  });

  it('time.jump: jumping to the night sends everybody off duty away at once', () => {
    const { tod, people, run, plans } = office(2, 23.5);
    tod.jumpToHour(11);
    run(120);
    expect(people.filter((p) => p.presence === 'in').length).toBeGreaterThan(5);
    tod.jumpToHour(23.9);
    run(STEP);
    const today = plans();
    for (const p of people) {
      const plan = today.get(p.id)!;
      const owl = plan.night && plan.end > 23.9;
      if (!owl) expect(p.presence, p.id).not.toBe('in');
    }
  });

  it('time.weekday: picking a day rolls fresh plans, a jump in time does not', () => {
    const { tod, run, plans } = office(3, 10);
    run(1);
    const before = plans();
    tod.jumpToHour(15);
    run(1);
    expect(plans()).toEqual(before);
    tod.pickWeekday(3);
    run(1);
    expect(plans()).not.toEqual(before);
  });

  it('dev.remove: a removed person stays away all day and is ignored by call-back; restore puts them back on the plan', () => {
    const { tod, people, presence, run, plans } = office(3, 5);
    tod.jumpToHour(10);
    run(120);
    const today = plans();
    const victim = people.find((p) => p.presence === 'in' && today.get(p.id)!.end > 17)!;
    presence.remove(victim as unknown as Person);
    expect(victim.presence).toBe('out');
    expect(presence.isRemoved(victim as unknown as Person)).toBe(true);
    for (let h = 11; h <= 15; h++) {
      tod.jumpToHour(h);
      run(30);
      presence.callAllBack();
      run(30);
      expect(victim.presence, `at ${h}:00`).toBe('out');
      expect(victim.awayKind).toBe('off');
    }
    expect(people.filter((p) => p !== victim && p.presence === 'in').length).toBeGreaterThan(0); // everybody else keeps living
    presence.restore(victim as unknown as Person);
    run(120);
    expect(presence.isRemoved(victim as unknown as Person)).toBe(false);
    expect(victim.awayKind !== 'off' || victim.presence === 'in').toBe(true);
  });
});
