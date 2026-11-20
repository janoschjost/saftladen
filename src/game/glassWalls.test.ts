import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { office, run } from '../test/office';
import { CORRIDOR_POINT } from '../render/officeModel';
import type { Person } from './Person';
import type { Sim } from './Sim';
import { walkFree } from './walkCollision';

installHeadlessDom();

/** A glass wall along z at `x`, from `z0` to `z1` (game metres), with the doorways in it. */
interface Glass {
  name: string;
  x: number;
  z0: number;
  z1: number;
  doors: Array<[number, number]>;
}

/** The glass walls of the glass meeting room (no door: it opens onto the corridor) and of the room just inside the entrance (Wassermelonen). */
function glassWalls(sim: Sim): Glass[] {
  const door = sim.model.doors.find((d) => Math.abs(d.center.x - 4.5) < 0.1)!; // the glass door of the entrance room
  return [
    { name: 'meeting room west', x: 29, z0: 7.7, z1: 15, doors: [] },
    { name: 'meeting room east', x: 36, z0: 7.7, z1: 15, doors: [] },
    { name: 'entrance room', x: 4.5, z0: 0, z1: 15, doors: [[door.center.z - door.width / 2, door.center.z + door.width / 2]] },
  ];
}

/**
 * Watches every person from step to step and notes each move whose line goes through one of the glass walls (not the
 * step in which somebody who was out appears on the porch).
 */
function watch(sim: Sim): { crossed: string[]; each: () => void } {
  const walls = glassWalls(sim);
  const gone = (p: Person) => p.away || p.presence === 'out';
  const last = new Map(sim.people.map((p) => [p, { x: p.pos.x, z: p.pos.z, gone: gone(p) }]));
  const crossed: string[] = [];
  const each = () => {
    for (const p of sim.people) {
      const a = last.get(p)!;
      const b = p.pos;
      for (const w of walls) {
        const ua = a.x - w.x;
        const ub = b.x - w.x;
        if (ua * ub > 0 || (ua === 0 && ub === 0) || a.gone || gone(p)) continue; // a step onto the glass line counts too
        const z = a.z + ((b.z - a.z) * ua) / (ua - ub);
        if (z > w.z0 && z < w.z1 && !w.doors.some(([d0, d1]) => z > d0 && z < d1)) crossed.push(`${p.id} through ${w.name} at z ${z.toFixed(2)} (${a.x.toFixed(2)},${a.z.toFixed(2)} -> ${b.x.toFixed(2)},${b.z.toFixed(2)})`);
      }
      a.x = b.x;
      a.z = b.z;
      a.gone = gone(p);
    }
  };
  return { crossed, each };
}

describe('move.collision: glass walls', () => {
  it('move.collision: the glass walls of the meeting room and the entrance room are solid on the nav grid, their doors and the whole room stay reachable', () => {
    const sim = office();
    for (const w of glassWalls(sim)) {
      for (let z = w.z0 + 0.25; z < w.z1; z += 0.5) {
        if (w.doors.some(([d0, d1]) => z > d0 - 0.25 && z < d1 + 0.25)) continue;
        expect(sim.nav.lineClear({ x: w.x - 0.3, z }, { x: w.x + 0.3, z }), `${w.name} at z ${z}`).toBe(false);
      }
    }
    // both halves of the meeting room (either side of the table) and every chair's floor are reached through the door
    for (const s of sim.model.meeting.seats) expect(sim.nav.openNear(s, CORRIDOR_POINT, 2), `seat ${s.x},${s.z}`).not.toBeNull();
    expect(sim.nav.opens({ x: 35.25, z: 11 }, CORRIDOR_POINT)).toBe(true);
  });

  it('move.collision + place.meeting: nobody walks through the glass of the meeting room on the way in, while it runs or on the way out', () => {
    const sim = office();
    const { crossed, each } = watch(sim);
    expect(sim.events.trigger('meeting-room')).toMatch(/Besprechung/);
    const meeting = sim.meetingRoom.current!;
    expect(run(sim, 120, () => meeting.phase === 'session', each)).toBe(true);
    expect(run(sim, 30 * 60, () => !sim.meetingRoom.current && meeting.members.every((p) => !p.inMeeting), each)).toBe(true);
    run(sim, 60, () => false, each); // and out of the room
    expect(crossed).toEqual([]);
  });

  it('move.collision + presence.remote-greet: somebody who gets up from a desk behind the entrance-room glass to greet the visitor goes round through its door', () => {
    const sim = office();
    const ramon = sim.person('ramon-lenherr');
    const zlatko = sim.person('zlatko-pesic');
    sim.presence.setVisit(zlatko, true);
    sim.presence.callBack(zlatko);
    expect(run(sim, 90 * 60, () => zlatko.presence === 'returning')).toBe(true);
    // as the visitor walks in, Ramon is alone in the office at desk 5 behind the glass, so he is the one who walks over
    for (const p of sim.people) if (p !== ramon && p !== zlatko) sim.scenario.put(p.id, 'home');
    sim.office.assign(ramon, 5);
    sim.scenario.put(ramon.id, 'desk', 'free');
    expect(ramon.pos.x).toBeLessThan(4.5);
    const { crossed, each } = watch(sim);
    const door = glassWalls(sim).find((w) => w.name === 'entrance room')!.doors[0];
    let called = false;
    let throughDoor = false;
    // greeted ("Zlatko! 🎉" over Ramon), then pinned to a spot next to the visitor until he gets there
    expect(
      run(sim, 5 * 60, () => called && ramon.scripted?.arrived, () => {
        each();
        called ||= sim.welcome.call?.who === ramon;
        throughDoor ||= Math.abs(ramon.pos.x - 4.5) < 0.2 && ramon.pos.z > door[0] && ramon.pos.z < door[1];
      }),
    ).toBe(true);
    expect(ramon.pos.x).toBeGreaterThan(4.5); // on the visitor's side of the glass
    expect(Math.hypot(ramon.pos.x - zlatko.pos.x, ramon.pos.z - zlatko.pos.z)).toBeLessThan(2);
    expect(throughDoor).toBe(true);
    expect(crossed).toEqual([]);
  });

  it('move.collision + view.walk: the walk-mode player still bumps into the glass walls', () => {
    const sim = office();
    for (const w of glassWalls(sim)) {
      const z = w.doors.length ? w.doors[0][0] - 1 : (w.z0 + w.z1) / 2;
      let free = true;
      for (let x = w.x - 0.6; x <= w.x + 0.6; x += 0.05) free &&= walkFree(x, z, 0.3, sim.walkColliders);
      expect(free, w.name).toBe(false);
    }
  });
});
