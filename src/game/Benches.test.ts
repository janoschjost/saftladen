import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** Every desk is taken (by somebody who never moves), so whoever comes in next finds none. */
function fillDesks(sim: Sim): void {
  const dummy = { working: false, yieldDesk() {} } as unknown as Person;
  for (const d of sim.office.desks) d.occupant = dummy;
}

/** Everybody who was called back is in, give or take a smoker still on the way (they come and go on their own). */
const allIn = (sim: Sim) => sim.people.filter((p) => p.presence !== 'in').length <= 2;

/** Everybody called back with every desk taken, once all are in and a few have sat down. */
function crowded(seed = 1): Sim {
  const sim = office({}, seed);
  fillDesks(sim);
  sim.presence.callAllBack();
  expect(run(sim, 200, () => allIn(sim)), `seed ${seed}: everybody in`).toBe(true);
  expect(run(sim, 60, () => sim.people.some((p) => p.benchSeated)), `seed ${seed}: somebody sits`).toBe(true);
  return sim;
}

describe('office.overflow-seats: no desk free, sit down instead of wandering', () => {
  it('office.overflow-seats: after "Alle zurückholen" with every desk taken, people sit on the bar stools and work on the laptop (seeds 1-3)', () => {
    for (const seed of [1, 2, 3]) {
      const sim = crowded(seed);
      const stools = sim.office.benches!.seats;
      expect(stools.length).toBe(4);
      expect(run(sim, 60, () => stools.every((s) => s.occupant)), `seed ${seed}: every stool taken`).toBe(true);
      expect(run(sim, 30, () => stools.every((s) => s.occupant?.meetSeated)), `seed ${seed}: all seated`).toBe(true);
      // sitting means sitting: on their seat, working on the laptop
      for (const s of stools) {
        const p = s.occupant!;
        expect(Math.hypot(p.pos.x - s.seat.x, p.pos.z - s.seat.z)).toBeLessThan(0.05);
        expect(p.sit).toBe(1);
        expect(p.seatLift, 'up on the stool, so the arms rest on the bar').toBeGreaterThan(0.2);
        expect(p.laptop).toBe(true);
      }
    }
  });

  it('office.overflow-seats: a laptop stands on the bar only in front of somebody who sits at it', () => {
    const sim = crowded();
    const stools = sim.office.benches!.seats;
    const model = sim.model.benches;
    run(sim, 5);
    stools.forEach((s, i) => expect(model[i].laptop.parts.every((m) => m.visible), `stool ${i}`).toBe(!!s.occupant?.laptop));
    expect(stools.some((s) => s.occupant?.laptop)).toBe(true);
  });

  it('office.overflow-seats: somebody next to a free stool sits down within 10 s', () => {
    const sim = office({}, 1);
    fillDesks(sim);
    const p = sim.person('oscar-grob');
    const stool = sim.office.benches!.seats[0];
    sim.scenario.put(p.id, { x: stool.approach.x, z: stool.approach.z }, 'free');
    p.moveOn();
    expect(run(sim, 10, () => p.benchSeated)).toBe(true);
  });

  it('office.overflow-seats: a meeting takes its chairs back: the sitters get up and the meeting runs as usual', () => {
    const sim = crowded();
    expect(run(sim, 90, () => sim.meetingRoom.seats.some((s) => s.occupant?.benched))).toBe(true);
    sim.meetingRoom.abort(sim.nav);
    const group = sim.people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob).slice(0, 4);
    expect(group.length).toBe(4);
    const meeting = sim.meetingRoom.start(group, sim.nav);
    expect(meeting).not.toBeNull();
    expect(run(sim, 90, () => meeting!.phase === 'session')).toBe(true);
    for (const p of group) expect(p.meetSeated).toBe(true);
    // nobody sits at a chair of the room but the meeting: the overflow sitters left it
    for (const s of sim.meetingRoom.seats) expect(!s.occupant || group.includes(s.occupant)).toBe(true);
  });

  it('office.overflow-seats: nobody gets stuck on the bar when several sitters stand up at once (seeds 1-4)', () => {
    for (const seed of [1, 2, 3, 4]) {
      const sim = office({}, seed);
      sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
      sim.events.trigger('desks-full');
      expect(run(sim, 240, () => sim.office.benches!.seats.every((s) => s.occupant?.benchSeated)), `seed ${seed}: stools full`).toBe(true);
      run(sim, 60);
      const seats = sim.office.benches!.seats;
      const sitters = seats.map((s) => s.occupant!);
      // the gaps between two stools are not floor to stand in: nobody can wander in and jam the lane behind them
      for (let i = 1; i < seats.length; i++) {
        const c = sim.nav.toCell({ x: (seats[i - 1].seat.x + seats[i].seat.x) / 2, z: seats[i].seat.z });
        expect(sim.nav.walkable(c.cx, c.cz), `gap ${i}`).toBe(false);
      }
      sim.events.trigger('meeting-room');
      run(sim, 40);
      for (const p of sitters) {
        if (p.benchSeated) continue; // found a stool again, fine
        const stuck = seats.some((s) => Math.hypot(p.pos.x - s.seat.x, p.pos.z - s.seat.z) < 1.2) && p.moving < 0.2;
        expect(stuck, `seed ${seed}: ${p.id} stands still at the bar`).toBe(false);
      }
    }
  });

  it('office.overflow-seats: a freed desk is taken by a sitter, who stands up and walks over to it', () => {
    const sim = crowded();
    run(sim, 60, () => false); // the sitters have sat a while
    const sitters = sim.people.filter((p) => p.benched);
    // a few desks free up (others who find none walk to them too, so one desk alone may not reach a sitter)
    const freed = sim.office.desks.slice(0, 6);
    for (const d of freed) d.occupant = null;
    const taker = () => sitters.find((p) => p.task && freed.includes(p.task.desk));
    expect(run(sim, 300, () => taker()?.working)).toBe(true);
    const sitter = taker()!;
    expect(sitter.benched).toBe(false);
    expect(sim.people.filter((p) => p.task?.desk === sitter.task!.desk)).toEqual([sitter]); // one desk, one person
  });

  it('office.overflow-seats: the desk set aside for a sitter is free again when they are pulled off the seat', () => {
    const sim = crowded();
    const p = sim.people.find((q) => q.benchSeated)!;
    const desk = sim.office.desks[5];
    desk.occupant = p; // what `Benches.update` does
    p.leaveBench(desk);
    sim.pull(p); // dragged away before they got up
    expect(desk.occupant).toBeNull();
  });

  it('office.overflow-seats: somebody on a stool is sent out like anybody else (lunch, going home)', () => {
    const sim = crowded();
    const p = sim.people.find((q) => q.benchSeated)!;
    const seat = p.meetJob!.seat;
    expect(sim.presence.send(p, 'errand', sim.nav)).toBe(true);
    expect(p.benched).toBe(false);
    expect(seat.occupant).toBeNull();
    expect(p.presence).toBe('leaving');
  });

  it('office.overflow-seats: the dev event desks-full seats the team at every desk and the rest end up on the stools', () => {
    const sim = office({}, 1);
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    expect(sim.events.trigger('desks-full')).toMatch(/^Alle Schreibtische besetzt/);
    expect(run(sim, 240, () => sim.people.some((p) => p.benchSeated))).toBe(true);
  });

  it('office.overflow-seats: after desks-full the stools stay taken with real desk sitters, and nobody is handed a desk the moment they sit', () => {
    const sim = office({}, 1);
    sim.scenario.clear('printer', 'coffee', 'kitchen', 'meeting', 'wc');
    sim.events.trigger('desks-full');
    expect(run(sim, 240, () => sim.office.benches!.seats.every((s) => s.occupant?.benchSeated))).toBe(true);
    const sitters = sim.office.benches!.seats.map((s) => s.occupant!);
    // a minute on, the same people still sit there and every desk is still taken
    run(sim, 60, () => false);
    for (const [i, s] of sim.office.benches!.seats.entries()) expect(s.occupant, `stool ${i}`).toBe(sitters[i]);
    expect(sim.office.desks.every((d) => d.occupant)).toBe(true);
  });

  it('office.overflow-seats: a free desk waits until the sitter has sat for a while, then goes to them', () => {
    const sim = office({}, 1);
    fillDesks(sim);
    const p = sim.person('oscar-grob');
    const stool = sim.office.benches!.seats[0];
    sim.scenario.put(p.id, { x: stool.approach.x, z: stool.approach.z }, 'stay');
    p.moveOn();
    expect(run(sim, 10, () => p.benchSeated)).toBe(true);
    for (const d of sim.office.desks) d.occupant = null;
    run(sim, 20, () => !p.benchSeated);
    expect(p.benchSeated, 'sat down a moment ago: stays').toBe(true);
    expect(run(sim, 120, () => !p.benchSeated)).toBe(true);
    expect(sim.office.desks.some((d) => d.occupant === p)).toBe(true);
  });
});
