import { afterEach, describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import { DOOR, DOOR_LANES, fromDoorway } from './Door';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { DRY_GAP, PORCH_SPOTS, UMBRELLA_CLEAR, UMBRELLA_DIAMETER } from './Smoke';
import { cycleOf } from './TimeOfDay';

installHeadlessDom();

const SANDRO = 'sandro-hagen';
const JANNIK = 'jannik-stibi';

/** At their desks, the simulation takes over from there; nothing else is going on at the printer, kitchen, meeting room or WC. */
function atDesks(sim: Sim, ids: string[]): Person[] {
  sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
  for (const id of ids) sim.scenario.put(id, 'desk', 'free');
  return ids.map((id) => sim.person(id));
}

/** Their break is due now: out they go (once they may). */
function urge(sim: Sim, ...people: Person[]): void {
  for (const p of people) sim.smoke.urge(p);
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const onPorch = (sim: Sim) => sim.people.filter((p) => p.atPorchSpot);
/** Closest two of these people stand (Infinity for fewer than two). */
const closest = (ps: Person[]) => Math.min(Infinity, ...ps.flatMap((a, i) => ps.slice(i + 1).map((b) => dist(a.pos, b.pos))));

describe('presence.smoke: smoke breaks on the porch', () => {
  it('presence.smoke: a smoker walks out of the front door to a spot on the porch beside it, smokes there in sight, and comes back in after the break', () => {
    const sim = office();
    const [p] = atDesks(sim, [SANDRO]);
    urge(sim, p);
    expect(run(sim, 60, () => p.atPorchSpot)).toBe(true);
    expect(p.awayKind).toBe('smoke');
    expect(p.away).toBe(false); // not gone: standing out there
    expect(p.root.visible).toBe(true);
    expect(p.inOffice).toBe(false);
    expect(p.smokeLit).toBe(true);
    expect(p.pos.z).toBeGreaterThan(DOOR.z);
    expect(PORCH_SPOTS.some((s) => dist(s, p.pos) < 0.05)).toBe(true);
    // clear of both door lanes: nobody on the way in or out passes the spot
    for (const l of DOOR_LANES) expect(Math.abs(p.pos.x - l.out.x) >= 0.8 || p.pos.z > l.out.z + 1).toBe(true);
    // the break ends by itself: cigarette out, in through the door
    expect(run(sim, 70, () => p.presence === 'in')).toBe(true);
    expect(p.smokeLit).toBe(false);
    expect(p.porchSpot).toBeNull();
    expect(p.pos.z).toBeLessThan(DOOR.z);
  });

  it('presence.smoke: no break while the player holds the smoker, nor at night', () => {
    const sim = office();
    const [p] = atDesks(sim, [JANNIK]);
    p.held = true;
    urge(sim, p);
    run(sim, 20, () => false, () => expect(p.awayKind).not.toBe('smoke'));
    p.held = false;
    urge(sim, p);
    expect(run(sim, 30, () => p.awayKind === 'smoke')).toBe(true);

    const night = office({ cycle: cycleOf(22) });
    const [q] = atDesks(night, [SANDRO]);
    urge(night, q);
    expect(night.presence.maySmoke(q)).toBe(false);
    run(night, 20, () => false, () => {
      urge(night, q);
      expect(q.awayKind).not.toBe('smoke');
    });
  });

  it('presence.smoke: a smoker who goes out while another is there stands next to them and they chat', () => {
    const sim = office();
    const [a, b] = atDesks(sim, [SANDRO, JANNIK]);
    urge(sim, a);
    expect(run(sim, 60, () => a.atPorchSpot)).toBe(true);
    urge(sim, b);
    expect(run(sim, 40, () => b.atPorchSpot)).toBe(true);
    // shoulder to shoulder: close enough to talk, not inside each other
    expect(dist(a.pos, b.pos)).toBeGreaterThanOrEqual(DRY_GAP - 0.01);
    expect(dist(a.pos, b.pos)).toBeLessThan(1.1);
    expect(run(sim, 3, () => sim.smoke.chat && a.talk === sim.smoke.chat && b.talk === sim.smoke.chat)).toBe(true);
    const chat = sim.smoke.chat!;
    expect(chat.members).toEqual(expect.arrayContaining([a, b]));
    // they take turns (a bubble each)
    const speakers = new Set<Person>();
    run(sim, 12, () => false, () => sim.smoke.chat && speakers.add(sim.smoke.chat.speaker));
    expect(speakers.size).toBe(2);
    // the first one goes in: the chat is over, nobody is left talking out there
    expect(run(sim, 70, () => !sim.smoke.chat)).toBe(true);
    expect(run(sim, 70, () => a.presence === 'in' && b.presence === 'in')).toBe(true);
    expect(a.talk).toBeNull();
    expect(b.talk).toBeNull();
  });

  it('presence.smoke: calling a smoker back ends the break at once: the cigarette is out and they come in', () => {
    const sim = office();
    const [p] = atDesks(sim, [SANDRO]);
    urge(sim, p);
    expect(run(sim, 60, () => p.atPorchSpot && p.awayLeft > 10)).toBe(true);
    sim.presence.callBack(p);
    run(sim, 0.1);
    expect(p.smokeLit).toBe(false);
    expect(run(sim, 20, () => p.presence === 'in')).toBe(true);
  });

  it('weather.umbrella: in the rain everybody outdoors holds an umbrella, nobody indoors does', () => {
    const sim = office();
    const [smoker, walker] = atDesks(sim, [SANDRO, GROUP[0]]);
    sim.weather.set(true);
    urge(sim, smoker);
    expect(sim.presence.send(walker, 'errand', sim.nav)).toBe(true);
    let seenOut = 0;
    run(
      sim,
      60,
      () => smoker.atPorchSpot && walker.presence === 'out',
      () => {
        for (const p of sim.people) {
          if (p.presence === 'out' || (!p.away && p.outdoors && fromDoorway(p.pos.x, p.pos.z) > 1.5)) {
            expect(p.umbrella).toBe(true);
            if (!p.away) seenOut++;
          } else if (p.pos.z < DOOR.z - 0.05) expect(p.umbrella).toBe(false);
        }
      },
    );
    expect(smoker.atPorchSpot && smoker.umbrella).toBe(true);
    // the small meeting room sticks out in front of the wall, but it is indoors
    sim.scenario.put(GROUP[1], { x: 2.2, z: DOOR.z + 1.5 });
    run(sim, 0.1);
    expect(sim.person(GROUP[1]).pos.z).toBeGreaterThan(DOOR.z);
    expect(sim.person(GROUP[1]).umbrella).toBe(false);
    expect(seenOut).toBeGreaterThan(0); // somebody was seen walking out in the rain
    // dry again: no umbrellas
    sim.weather.set(false);
    run(sim, 0.1);
    expect(sim.people.some((p) => p.umbrella)).toBe(false);
  });

  it('weather.umbrella: in the rain nobody passes the doorframe with an open umbrella: it opens clear of the frame on the way out and is shut before it on the way in', () => {
    const sim = office();
    const [smoker, walker] = atDesks(sim, [SANDRO, GROUP[0]]);
    sim.weather.set(true);
    urge(sim, smoker);
    expect(sim.presence.send(walker, 'errand', sim.nav)).toBe(true);
    const through = { out: new Set<Person>(), in: new Set<Person>() };
    const check = () => {
      for (const p of sim.people) {
        if (p.away || fromDoorway(p.pos.x, p.pos.z) >= UMBRELLA_CLEAR) continue;
        expect(p.umbrellaAmt, `${p.id} (${p.presence}) at z ${p.pos.z.toFixed(2)}`).toBe(0);
        if (p.presence === 'leaving' && p.pos.z > DOOR.z - 0.5) through.out.add(p);
        if (p.presence === 'returning') through.in.add(p);
      }
    };
    // out: the smoker to the porch (umbrella open there), the other one away
    expect(run(sim, 60, () => smoker.atPorchSpot && smoker.umbrellaAmt === 1 && walker.away, check)).toBe(true);
    // in: the smoker after the break, the other one called back
    sim.presence.callBack(walker);
    expect(run(sim, 90, () => smoker.presence === 'in' && walker.presence === 'in', check)).toBe(true);
    expect([...through.out]).toEqual(expect.arrayContaining([smoker, walker]));
    expect([...through.in]).toEqual(expect.arrayContaining([smoker, walker]));
    // every rain spot keeps the open umbrella off the frame
    for (const s of PORCH_SPOTS.filter((s) => s.rain)) expect(fromDoorway(s.x, s.z)).toBeGreaterThanOrEqual(UMBRELLA_CLEAR);
  });
});

describe('presence.smoke: room on the porch', () => {
  /** More smokers than the porch has dry spots: the five of the team plus three flagged for the test. */
  const EXTRA = [GROUP[0], GROUP[1], GROUP[2]];
  const SMOKERS = ['jannik-stibi', 'sandro-hagen', 'ramon-lenherr', 'delya-kohler', 'jeerapat-wang', ...EXTRA];
  const flag = (on: boolean) => {
    for (const m of team) if (EXTRA.includes(m.id)) m.smoke = on;
  };
  afterEach(() => flag(false));

  /**
   * Everybody urged at once (and again while they are in): checks the spacing and the head count on the porch every
   * step until every spot is taken. A spot is taken from the moment its smoker sets off. `hold`: who stands out there
   * stays until every spot has its smoker (the walk out takes some of them longer than a break).
   */
  function crowd(rain: boolean, hold = false) {
    flag(true);
    const sim = office();
    sim.weather.set(rain);
    const smokers = atDesks(sim, SMOKERS);
    const seats = rain ? PORCH_SPOTS.filter((s) => s.rain).length : PORCH_SPOTS.length;
    const taken = () => smokers.filter((p) => p.porchSpot).length;
    let waited = false;
    const full = run(sim, 120, () => taken() === seats && (!hold || onPorch(sim).length === seats), () => {
      urge(sim, ...smokers.filter((p) => p.presence === 'in'));
      const out = onPorch(sim);
      expect(taken()).toBeLessThanOrEqual(seats);
      expect(closest(out)).toBeGreaterThanOrEqual(rain ? UMBRELLA_DIAMETER : DRY_GAP - 0.01);
      if (hold) for (const p of out) p.awayLeft = Math.max(p.awayLeft, 10);
    });
    expect(full).toBe(true);
    // the porch is full: the surplus stays in and keeps trying, never more than the spots out there
    run(sim, 10, () => false, () => {
      urge(sim, ...smokers.filter((p) => p.presence === 'in'));
      expect(taken()).toBeLessThanOrEqual(seats);
      expect(closest(onPorch(sim))).toBeGreaterThanOrEqual(rain ? UMBRELLA_DIAMETER : DRY_GAP - 0.01);
      waited ||= smokers.some((p) => !p.porchSpot && !p.onSmokeBreak);
      if (hold) for (const p of onPorch(sim)) p.awayLeft = Math.max(p.awayLeft, 10);
    });
    expect(waited).toBe(true);
    return { sim, smokers };
  }

  it('presence.smoke: dry, the porch holds its seven spots, at least 0.8 m apart; the surplus smoker waits', () => {
    expect(PORCH_SPOTS.length).toBeLessThan(SMOKERS.length);
    crowd(false);
  });

  it('presence.smoke + weather.umbrella: in the rain fewer spots, far enough apart that no two open umbrellas overlap', () => {
    expect(PORCH_SPOTS.filter((s) => s.rain).length).toBeLessThan(PORCH_SPOTS.length);
    crowd(true);
  });

  it('presence.smoke + weather.umbrella: rain starting with a full porch sends in whoever has no rain spot, nobody\'s umbrella overlaps another', () => {
    const { sim } = crowd(false, true);
    expect(onPorch(sim).length).toBe(PORCH_SPOTS.length);
    sim.weather.set(true);
    run(sim, 0.1);
    // gone from their spots at once: who stands out there stands on a rain spot
    run(sim, 6, () => false, () => {
      const out = onPorch(sim);
      expect(out.length).toBeLessThanOrEqual(PORCH_SPOTS.filter((s) => s.rain).length);
      expect(closest(out)).toBeGreaterThanOrEqual(UMBRELLA_DIAMETER);
    });
    expect(run(sim, 20, () => sim.people.filter((p) => p.onSmokeBreak).length <= PORCH_SPOTS.filter((s) => s.rain).length)).toBe(true);
  });
});
