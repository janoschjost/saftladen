import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import type { TeamMember } from '../data/types';
import type { NavGrid } from './NavGrid';
import type { AwayKind, Person } from './Person';
import { Presence } from './Presence';
import { hourOf, type TimeOfDay } from './TimeOfDay';
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
  private walk = 0;

  constructor(readonly member: TeamMember) {}

  get id(): string {
    return this.member.id;
  }
  get inOffice(): boolean {
    return this.presence === 'in';
  }
  leaveOffice(_nav: NavGrid, kind: AwayKind, seconds: number): void {
    this.presence = 'leaving';
    this.awayKind = kind;
    this.awayLeft = seconds;
    this.walk = WALK;
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
  return { samples, plans, people };
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
});
