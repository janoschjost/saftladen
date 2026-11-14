import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run, STEP } from '../test/office';
import { forceRunner, simForceCtx } from './forceCtx';
import type { Person } from './Person';
import { PET_HEIGHT } from './petPose';
import { Sim } from './Sim';

installHeadlessDom();

/**
 * What the places of the office do once somebody is sent there: the same calls the dev events make (`Game`), on a
 * headless office with the scene set by `sim.scenario`. That `?event=` starts them is one wiring test in
 * `e2e/events.spec.ts`.
 */

/** These people at their desks, kept in the office for the test, pulled out of the chair for what comes next. */
function crew(sim: Sim, ...ids: string[]): Person[] {
  const people = ids.map((id) => {
    sim.scenario.put(id, 'desk', 'stay');
    return sim.people.find((p) => p.id === id)!;
  });
  people.forEach((p) => sim.drop(p));
  return people;
}

describe('places', () => {
  it('place.meeting: people called out of their chair stand up and walk to the room, nobody glides sitting', () => {
    const sim = office();
    const group = crew(sim, ...GROUP);
    expect(sim.meetingRoom.start(group, sim.nav, 'slides')).toBeTruthy();
    const gliding: string[] = [];
    let walked = 0;
    const seated = run(
      sim,
      90,
      () => sim.meetingRoom.occupants(sim.people) === group.length,
      () => {
        for (const p of group) {
          if (p.meetPhase !== 'approach' || p.moving <= 0.5) continue;
          walked++;
          if (p.sit > 0.3) gliding.push(`${p.id} sit=${p.sit.toFixed(2)}`);
        }
      },
    );
    expect(walked).toBeGreaterThan(100);
    expect(gliding).toEqual([]);
    expect(seated).toBe(true);
  });

  it('place.meeting-tv: black without a meeting, a meeting brings slides', () => {
    const sim = office();
    expect(sim.meetingRoom.tv).toBe('off');
    sim.meetingRoom.start(crew(sim, ...GROUP), sim.nav, 'slides');
    sim.step(STEP);
    expect(sim.meetingRoom.current?.screen).toBe('slides');
    expect(sim.meetingRoom.tv).toBe('off'); // still gathering: black until everybody sits
    expect(run(sim, 90, () => sim.meetingRoom.tv === 'slides')).toBe(true);
  });

  it('place.meeting-tv: a lunch round is a kart race', () => {
    const sim = office();
    sim.meetingRoom.start(crew(sim, ...GROUP.slice(0, 3)), sim.nav, 'kart');
    sim.step(STEP);
    expect(sim.meetingRoom.current?.screen).toBe('kart');
    expect(run(sim, 90, () => sim.meetingRoom.tv === 'kart')).toBe(true);
  });

  it('place.coffee-break: three go to the kitchen and chat there', () => {
    const sim = office();
    sim.scenario.clear('kitchen', 'coffee');
    expect(sim.kitchen.start(crew(sim, ...GROUP.slice(0, 3)), sim.nav)).toBeTruthy();
    expect(run(sim, 60, () => sim.kitchen.current?.phase === 'chat')).toBe(true);
  });

  it('place.booth: a phone person goes into the booth and sits down on the phone', () => {
    const sim = office();
    const [jan] = crew(sim, 'jan-hasler');
    expect(sim.phoneBooth.start(jan, sim.nav)).toBeTruthy();
    expect(run(sim, 60, () => sim.phoneBooth.current?.calling)).toBe(true);
  });

  it('place.pod: two sit down in the pod', () => {
    const sim = office();
    const two = crew(sim, ...GROUP.slice(0, 2));
    expect(sim.pod.start(two, sim.nav)).toBeTruthy();
    expect(run(sim, 60, () => sim.pod.seats.filter((s) => s.occupant && two.includes(s.occupant)).length === 2)).toBe(true);
  });

  it('place.printer: somebody walks to the printer and prints there', () => {
    const sim = office();
    sim.scenario.clear('printer');
    const [p] = crew(sim, 'oscar-grob');
    expect(p.startPrint(sim.nav)).toBe(true);
    expect(run(sim, 60, () => sim.office.printer!.occupant === p && p.printJob?.phase === 'print')).toBe(true);
  });

  it('place.foosball: two play at the table', () => {
    const sim = office();
    const [a, b] = crew(sim, ...GROUP.slice(0, 2));
    const table = sim.office.foosball!;
    expect(table.free).toBe(true);
    expect(table.start(a, b, sim.nav)).toBe(true);
    expect(table.free).toBe(false);
    expect(run(sim, 60, () => a.foosJob?.phase === 'play' && b.foosJob?.phase === 'play')).toBe(true);
  });

  it('place.toilet: the cabin is taken at once, its light turns red', () => {
    const sim = office();
    sim.scenario.clear('wc');
    const [p] = crew(sim, 'oscar-grob');
    expect(sim.toilets.go(p, sim.nav)).toBe('cabin');
    const i = sim.toilets.cabins.findIndex((c) => c.session?.person === p);
    expect(i).toBeGreaterThanOrEqual(0);
    sim.step(STEP); // the light follows on the next simulation step
    expect(sim.model.toilets.cabins[i].sign.color.getHex()).toBe(0xe0342c);
    expect(sim.toilets.cabins[i].seat.occupant).toBe(p);
  });

  it('place.toilet-queue: both cabins taken, the third person waits in front', () => {
    const sim = office();
    sim.scenario.clear('wc');
    const three = crew(sim, ...GROUP.slice(0, 3));
    expect(three.map((p) => sim.toilets.go(p, sim.nav))).toEqual(['cabin', 'cabin', 'queue']);
    const waiting = sim.toilets.queue[0].person;
    expect(waiting).toBe(three[2]);
    expect(sim.toilets.cabins.every((c) => c.session && c.session.person !== waiting)).toBe(true);
    expect(waiting.inMeeting).toBe(false);
  });

  // the pose itself (knees, hips, hands): src/game/petPose.test.ts
  for (const [id, owner, kind] of [
    ['pet.crouch', 'ramon-lenherr', 'dog'],
    ['pet.crouch-cat', 'donata-manser', 'cat'],
  ] as const) {
    // what the view eases the pose in from (`Game.posePet`): petting, standing still, not on a chair
    it(`${id}: the owner stops at the ${kind}, stands and strokes it, at its height`, () => {
      const sim = office();
      const [p] = crew(sim, owner);
      const pet = sim.pets.find((d) => d.owner === p && d.isCat === (kind === 'cat'))!;
      expect(pet.away).toBe(false);
      expect(p.petDog(pet.pos, 30, PET_HEIGHT[kind])).toBe(true);
      pet.petBy(p, 30, sim.nav);
      expect(run(sim, 5, () => p.petting && p.moving < 0.2 && p.sit < 0.05 && !p.held)).toBe(true);
      expect(p.petHeight).toBe(PET_HEIGHT[kind]);
      expect(pet.petted?.by).toBe(p);
    });
  }
});

describe('office', () => {
  // A lettered door (under the wall lettering) that is `open` or shut again; its letters must have moved along / be
  // back in their laid-out place (how far they are from it, m + rad).
  type Letter = { x: number; y: number; mesh: { position: { x: number; y: number }; rotation: { z: number } } };
  type DoorState = { open: number; rig: { letters?: Letter[] } };
  const lettered = (sim: Sim, want: 'open' | 'shut'): boolean =>
    (sim.doors as unknown as { states: DoorState[] }).states
      .filter((s) => s.rig.letters?.length)
      .some((s) => {
        const moved = Math.max(...s.rig.letters!.map((l) => Math.abs(l.mesh.position.x - l.x) + Math.abs(l.mesh.position.y - l.y) + Math.abs(l.mesh.rotation.z)));
        return want === 'open' ? s.open > 0.9 && moved > 0.01 : s.open < 0.001 && moved < 0.001;
      });

  it('office.door-lettering: letters move with the door and settle back when it closes', () => {
    const sim = office();
    const swing = (want: 'open' | 'shut') => run(sim, 45, () => lettered(sim, want));
    expect(sim.doors.toggleLettered()).toBe(true);
    expect(swing('open')).toBe(true);
    expect(sim.doors.toggleLettered()).toBe(false);
    expect(swing('shut')).toBe(true);
  });

  for (const [name, homes] of [
    ['normal start', false],
    ['all eight home offices taken', true],
  ] as const) {
    it(`office.coat-stands: coats on the stands = people in the office (${name}), also after people come and go`, () => {
      const sim = office({ homes });
      const pegs = sim.model.coatRacks.reduce((n, r) => n + r.pegs.length, 0);
      const check = () => {
        const inside = sim.people.filter((p) => p.presence === 'in').length;
        expect(inside).toBeGreaterThan(0);
        expect(sim.coatRacks.count).toBe(Math.min(inside, pegs));
      };
      check();
      sim.scenario.put('oscar-grob', 'errand');
      sim.scenario.put('donata-manser', 'desk');
      sim.step(STEP);
      check();
    });
  }
});

// `dev.forceState` on a real office (the panel buttons themselves: e2e/force-state.spec.ts)
describe('dev.force', () => {
  const ok = (r: string, label: string) => {
    expect(r).toContain(label);
    expect(r).not.toContain('nicht möglich');
  };
  const forced = () => {
    const sim = office();
    return { sim, force: forceRunner(simForceCtx(sim, () => {})) }; // no player steering anybody
  };

  it('dev.force: sends a person to a meeting, then the sim goes on; a second meeting is refused', () => {
    const { sim, force } = forced();
    crew(sim, ...GROUP);
    ok(force('oscar-grob', 'meeting'), 'Meeting');
    const oscar = sim.people.find((p) => p.id === 'oscar-grob')!;
    expect(run(sim, 90, () => oscar.meetSeated)).toBe(true); // the sim takes over: walks there and sits down
    expect(sim.meetingRoom.current?.members.includes(oscar)).toBe(true);
    const other = sim.people.find((p) => p.inOffice && !sim.meetingRoom.current!.members.includes(p))!;
    expect(force(other.id, 'meeting')).toContain('nicht möglich');
    expect(sim.meetingRoom.current!.members.includes(other)).toBe(false);
  });

  it('dev.force: unknown person only reports', () => {
    expect(forced().force('nobody', 'desk')).toContain('unbekannt');
  });

  it('dev.force: desk, errand and coffee break take effect; away or already there is refused', () => {
    const { sim, force } = forced();
    const [a, b, c] = crew(sim, ...GROUP.slice(0, 3));
    sim.scenario.put('michael-eberle', 'desk', 'free');
    expect(force('michael-eberle', 'desk')).toContain('nicht möglich (sitzt schon am Platz)');
    ok(force(a.id, 'desk'), 'Am Platz');
    expect(a.task).toBeTruthy();
    sim.scenario.release(b.id); // a scene's 'stay' keeps them in: let the force send them out
    ok(force(b.id, 'errand'), 'Besorgung');
    expect(run(sim, 30, () => b.presence !== 'in')).toBe(true);
    sim.scenario.clear('printer', 'coffee', 'kitchen');
    ok(force(c.id, 'break'), 'Pause');
    expect(sim.kitchen.current?.members.includes(c)).toBe(true);
    expect(force(b.id, 'desk')).toContain('nicht möglich'); // away
    expect(b.inOffice).toBe(false);
  });

  it('dev.force: wc sends a person to a free cabin, nicht möglich when both are taken', () => {
    const { sim, force } = forced();
    sim.scenario.clear('wc');
    const [a, b, c] = crew(sim, ...GROUP.slice(0, 3));
    ok(force(a.id, 'wc'), 'WC');
    ok(force(b.id, 'wc'), 'WC');
    expect(sim.toilets.cabins.every((k) => k.session)).toBe(true);
    expect(force(c.id, 'wc')).toContain('nicht möglich'); // no queue, nothing changes
    expect(sim.toilets.queue.length).toBe(0);
    expect(force(a.id, 'wc')).toContain('nicht möglich'); // already in a cabin
  });

  it('dev.force: somebody away is refused with the reason', () => {
    const { sim, force } = forced();
    sim.scenario.put('oscar-grob', 'errand');
    expect(force('oscar-grob', 'desk')).toContain('(nicht im Büro)');
  });
});
