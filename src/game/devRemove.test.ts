import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import type { Person } from './Person';
import type { Sim } from './Sim';

installHeadlessDom();

/** `dev.remove`: taking people and pets out of the sim and back (#89). The panel toggles and the reload are in `e2e/devpanel.spec.ts`. */

const person = (sim: Sim, id: string): Person => sim.people.find((p) => p.id === id)!;

describe('dev.remove', () => {
  it('dev.remove: a seated person is gone at once, their desk is free, they stay away through a call-back; restore puts them back in the sim', () => {
    const sim = office();
    sim.scenario.put('oscar-grob', 'desk', 'stay');
    const oscar = person(sim, 'oscar-grob');
    expect(run(sim, 30, () => oscar.task?.phase === 'work')).toBe(true);
    expect(sim.office.desks.some((d) => d.occupant === oscar)).toBe(true);

    expect(sim.setRemoved('oscar-grob', true)).toContain('raus');
    expect(sim.removedIds).toEqual(['oscar-grob']);
    expect(oscar.presence).toBe('out');
    expect(run(sim, 2, () => !oscar.root.visible)).toBe(true); // hidden on the next step
    expect(oscar.task).toBeFalsy();
    expect(sim.office.desks.some((d) => d.occupant === oscar)).toBe(false);

    // the others keep living; the removed one stays away, also through a call-all-back
    run(sim, 3);
    sim.presence.callAllBack();
    run(sim, 30);
    expect(oscar.presence).toBe('out');
    expect(oscar.awayKind).toBe('off');
    expect(sim.people.filter((p) => p !== oscar && p.inOffice).length).toBeGreaterThan(0);

    // restore: back on today's plan, in through the door, or (full office) an errand / home office spell like everybody else
    expect(sim.setRemoved('oscar-grob', false)).toContain('dabei');
    expect(sim.removedIds).toEqual([]);
    expect(run(sim, 60, () => oscar.awayKind !== 'off')).toBe(true);
  });

  it('dev.remove: a person in the meeting room frees their seat, nobody else waits for them', () => {
    const sim = office();
    const group = GROUP.map((id) => {
      sim.scenario.put(id, 'desk', 'stay');
      return person(sim, id);
    });
    group.forEach((p) => sim.drop(p));
    expect(sim.meetingRoom.start(group, sim.nav, 'slides')).toBeTruthy();
    expect(run(sim, 5, () => group.some((p) => p.inMeeting))).toBe(true);

    const gone = group[0];
    sim.setRemoved(gone.id, true);
    sim.step(1 / 60);
    expect(gone.inMeeting).toBe(false);
    expect(gone.talk).toBeFalsy();
    expect(sim.meetingRoom.current?.members.includes(gone) ?? false).toBe(false);
    expect(sim.meetingRoom.seats.some((s) => s.occupant === gone)).toBe(false);
    // the rest still sit down: nobody is left gathering for the removed person
    expect(run(sim, 90, () => !sim.meetingRoom.current || group.every((p) => p === gone || p.meetSeated || !p.inMeeting))).toBe(true);
    expect(sim.meetingRoom.seats.some((s) => s.occupant === gone)).toBe(false);
  });

  it('dev.remove: a pet is hidden and stays away although its owner is in; restore brings it back', () => {
    const sim = office();
    const dog = sim.pets[0];
    sim.scenario.put(dog.owner.id, 'desk', 'stay');
    sim.step(1 / 60);

    expect(sim.setRemoved(dog.id, true)).toContain('raus');
    expect(sim.removedIds).toEqual([dog.id]);
    expect(run(sim, 20, () => dog.away)).toBe(true);
    run(sim, 10);
    expect(dog.away).toBe(true);
    expect(dog.owner.inOffice).toBe(true);

    sim.setRemoved(dog.id, false);
    expect(sim.removedIds).toEqual([]);
    expect(run(sim, 60, () => !dog.away)).toBe(true);
  });
});
