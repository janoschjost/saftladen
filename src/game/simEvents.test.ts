import { describe, expect, it, vi } from 'vitest';
import { strings } from '../i18n/strings';
import { OFFICE_ACTIONS } from '../data/actions';
import { CORRIDOR_POINT } from '../render/officeModel';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import { SIGNALS } from './Chatter';
import type { Person } from './Person';
import { PET_HEIGHT } from './petPose';
import type { Sim } from './Sim';
import { CROWD_LIMIT, CROWD_RADIUS } from './Social';
import { first } from './simEvents';
import type { Walker } from './Walker';

installHeadlessDom();

/**
 * The dev events of the simulation (`simEvents.ts`), on an office without a view: whom an event picks, that it pulls
 * them out of what they do, what it sets off, and that an event which cannot run changes nothing. What the places do
 * afterwards (walk there, sit down, print): `places.test.ts`. That `?event=` and the Aktionen cards reach the events:
 * `e2e/events.spec.ts`, `e2e/feature-urls.spec.ts`, `e2e/hud.spec.ts`.
 */

const ev = strings.presence.event;

const who = (sim: Sim, id: string): Person => sim.people.find((p) => p.id === id)!;

/**
 * The office holds exactly these people, at their desks: everybody else is out and held there, so an event that
 * picks "somebody free" can only pick them. `stay` keeps them in; `free` for events that send them away.
 */
function only(sim: Sim, ids: readonly string[], hold: 'stay' | 'free' = 'stay'): Person[] {
  for (const p of sim.people) if (!ids.includes(p.id)) sim.scenario.put(p.id, 'errand');
  return ids.map((id) => {
    sim.scenario.put(id, 'desk', hold);
    return who(sim, id);
  });
}

/** One more person at their desk, on top of `only`. */
function also(sim: Sim, id: string): Person[] {
  sim.scenario.put(id, 'desk', 'stay');
  return [who(sim, id)];
}

/** Everything an event may touch: who is where doing what, and which places are taken. */
function state(sim: Sim): string {
  return JSON.stringify([
    sim.people.map((p) => [p.id, p.presence, p.awayKind, p.awayLeft, p.pos.x.toFixed(3), p.pos.z.toFixed(3), p.state, p.task?.phase ?? null, !!p.talk, !!p.meetJob, !!p.printJob, !!p.foosJob, !!p.vapeJob, !!p.phoneJob, p.petting]),
    sim.pets.map((d) => [d.pos.x.toFixed(3), d.pos.z.toFixed(3), d.barkT, !!d.petted]),
    [!!sim.meetingRoom.current, !!sim.pod.current, !!sim.kitchen.current, !!sim.phoneBooth.current, sim.toilets.queue.length, sim.toilets.cabins.map((c) => !!c.session), sim.social.active.length, !!sim.office.printer?.occupant, sim.office.foosball?.free],
  ]);
}

/** The event says "nicht möglich" and nobody and nothing is different afterwards. */
function refused(sim: Sim, id: string): void {
  const before = state(sim);
  expect(sim.events.trigger(id)).toMatch(/: nicht möglich$/);
  expect(state(sim)).toBe(before);
}

const ids = (people: readonly Person[]): string[] => people.map((p) => p.id).sort();
const PHONE = 'jan-hasler';
const VAPER = 'fabian-bucher';
const KURT = 'marco-rieser';
const DOG_OWNER = 'ramon-lenherr';
const CAT_OWNER = 'donata-manser';

describe('dev events on the Sim', () => {
  it('dev.events: a Sim has its events without a game, an unknown id only reports', () => {
    const sim = office();
    expect(sim.events.list().map((e) => e.id)).toEqual(expect.arrayContaining(['meeting-room', 'pod', 'coffee', 'phone-booth', 'toilet', 'printer', 'foosball', 'nerf', 'boombox', 'pet-dog', 'pet-cat', 'door-lettering', 'errand', 'home', 'remote-visit', 'all-back']));
    expect(sim.events.trigger('nope')).toBe('unbekannt: nope');
  });

  it('place.meeting (meeting-room): five people are pulled from their chairs, stand up and walk to the room, nobody glides sitting; a second meeting takes the room over, nobody free (held by a scene) is refused', () => {
    const sim = office();
    const group = only(sim, GROUP);
    expect(run(sim, 20, () => group.every((p) => p.sit > 0.9))).toBe(true);
    expect(sim.events.trigger('meeting-room')).toMatch(/^Besprechung mit 5: /);
    expect(ids(sim.meetingRoom.current!.members)).toEqual(ids(group));
    expect(sim.meetingRoom.current!.screen).toBe('slides');
    expect(group.every((p) => p.meetJob && p.task?.phase !== 'work')).toBe(true);
    // the room is taken: the meeting is ended on the spot and a new one starts
    const first = sim.meetingRoom.current!;
    expect(sim.events.trigger('meeting-room')).toMatch(/^Besprechung mit 5: /);
    expect(sim.meetingRoom.current).not.toBe(first);
    // out of the chair first: nobody walks to the room in the seated pose
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

    const empty = office();
    only(empty, []);
    refused(empty, 'meeting-room');
  });

  it('place.meeting (meeting-room): with three chairs empty only three are pulled from their desks', () => {
    const sim = office();
    const group = only(sim, GROUP);
    expect(run(sim, 20, () => group.every((p) => p.task?.phase === 'work'))).toBe(true);
    const seats = sim.meetingRoom.seats;
    seats.slice(3).forEach((s) => (s.occupant = who(sim, PHONE))); // somebody sits on the others
    expect(sim.events.trigger('meeting-room')).toMatch(/^Besprechung mit 3: /);
    const members = sim.meetingRoom.current!.members;
    expect(members).toHaveLength(3);
    expect(group.filter((p) => p.task?.phase === 'work')).toEqual(group.filter((p) => !members.includes(p)));
  });

  it('place.meeting-tv (meeting-kart): three start a kart round; a taken room is cleared first', () => {
    const sim = office();
    const group = only(sim, GROUP.slice(0, 3));
    expect(sim.events.trigger('meeting-kart')).toMatch(/^Kart-Runde mit 3: /);
    expect(sim.meetingRoom.current!.screen).toBe('kart');
    expect(ids(sim.meetingRoom.current!.members)).toEqual(ids(group));
    expect(sim.events.trigger('meeting-kart')).toMatch(/^Kart-Runde mit 3: /);
  });

  it('dev.events (meeting-room-status, meeting-room-end): status reports, end sends everybody out; without a meeting end is refused', () => {
    const sim = office();
    only(sim, GROUP);
    expect(sim.events.trigger('meeting-room-status')).toBe('keine Besprechung');
    refused(sim, 'meeting-room-end');
    sim.events.trigger('meeting-room');
    expect(sim.events.trigger('meeting-room-status')).toMatch(/^gather \w+:/);
    expect(sim.events.trigger('meeting-room-end')).toBe('Besprechung beendet');
    expect(run(sim, 60, () => !sim.meetingRoom.current)).toBe(true);
  });

  for (const [feature, kind, owner] of [
    ['pet.crouch', 'dog', DOG_OWNER],
    ['pet.crouch-cat', 'cat', CAT_OWNER],
  ] as const) {
    it(`${feature} (pet-${kind}): the owner leaves the desk and strokes the ${kind}; an owner who is out is called in; a meeting or the WC queue they are in is cleared for it`, () => {
      const sim = office();
      const [p] = only(sim, [owner]);
      const pet = sim.pets.find((d) => d.owner === p && d.isCat === (kind === 'cat'))!;
      expect(sim.events.trigger(`pet-${kind}`)).toBe(`${first(p)} streichelt ${pet.name}`);
      expect(p.petting).toBe(true);
      expect(p.petHeight).toBe(PET_HEIGHT[kind]);
      expect(p.task?.phase).not.toBe('work');
      expect(pet.petted?.by).toBe(p);
      // the pet comes to the spot in front of the person (0.65 m, or the nearest free floor to it) and stays there
      // while stroked, it does not walk off (#100)
      const standing: number[] = [];
      run(
        sim,
        20,
        () => false,
        () => {
          if (pet.state !== 'walk') standing.push(Math.hypot(pet.pos.x - p.pos.x, pet.pos.z - p.pos.z));
        },
      );
      expect(standing.length).toBeGreaterThan(15 * 60);
      expect(Math.max(...standing)).toBeLessThan(1);
      expect(pet.petted?.by).toBe(p);

      const empty = office();
      only(empty, []);
      refused(empty, `pet-${kind}`);

      // every owner of such a pet is out: one is called in for the next try (#125)
      const away = office();
      const owners = [...new Set(away.pets.filter((d) => d.isCat === (kind === 'cat')).map((d) => d.owner))];
      for (const o of owners) away.scenario.put(o.id, 'home', 'free');
      expect(owners.every((o) => o.awayLeft > 0)).toBe(true);
      expect(away.events.trigger(`pet-${kind}`)).toMatch(/ streichelt /);
      expect(owners.filter((o) => o.presence === 'in')).toHaveLength(1);

      // the owner sits in a meeting: it is ended for them (nobody else could stroke)
      const busy = office();
      only(busy, [owner, GROUP[0]]);
      busy.events.trigger('meeting-room');
      expect(who(busy, owner).inMeeting).toBe(true);
      expect(busy.events.trigger(`pet-${kind}`)).toMatch(/ streichelt /);
      expect(who(busy, owner).inMeeting).toBe(false);

      // in a coffee break they can be had: the break ends for them
      const coffee = office();
      const [drinker] = only(coffee, [owner, GROUP[0]]);
      coffee.scenario.clear('kitchen', 'coffee');
      coffee.events.trigger('coffee');
      expect(drinker.talk).toBeTruthy();
      expect(coffee.events.trigger(`pet-${kind}`)).toMatch(/ streichelt /);
      expect(drinker.petting).toBe(true);

      // and out of the queue in front of the WC
      const queue = office();
      const [waiting, a, b] = only(queue, [owner, GROUP[0], GROUP[1]]);
      queue.scenario.clear('wc');
      expect([a, b, waiting].map((x) => (queue.drop(x), queue.toilets.go(x, queue.nav)))).toEqual(['cabin', 'cabin', 'queue']);
      expect(queue.events.trigger(`pet-${kind}`)).toMatch(/ streichelt /);
      expect(queue.toilets.queue).toHaveLength(0);
    });
  }

  it('pet.make-way (pet-passage): the pet of a seated owner is put into a passage and pointed at; refused when no owner sits', () => {
    const pointed: Walker[] = [];
    const sim = office({ point: (w) => pointed.push(w) });
    const [p] = only(sim, [DOG_OWNER]);
    expect(run(sim, 20, () => p.sit > 0.5)).toBe(true);
    const pet = sim.pets.find((d) => d.owner === p)!;
    expect(sim.events.trigger('pet-passage')).toBe(`${pet.name} liegt im Durchgang`);
    const c = sim.nav.toCell(pet.pos);
    expect(sim.traffic.passages.atIndex(c.cz * sim.nav.cols + c.cx)).toBeGreaterThanOrEqual(0);
    expect(pointed).toEqual([pet]);

    const empty = office();
    only(empty, []);
    refused(empty, 'pet-passage');
  });

  it('place.pod (pod, pod-end): two sit down in the pod, a second pair takes it over; pod-end empties it and is refused when empty', () => {
    const sim = office();
    const two = only(sim, GROUP.slice(0, 2));
    refused(sim, 'pod-end');
    expect(sim.events.trigger('pod')).toMatch(/ setzen sich ins Holzhaus$/);
    expect(ids(sim.pod.current!.members)).toEqual(ids(two));
    expect(two.every((p) => p.task?.phase !== 'work')).toBe(true);
    const first = sim.pod.current!;
    expect(sim.events.trigger('pod')).toMatch(/ setzen sich ins Holzhaus$/);
    expect(sim.pod.current).not.toBe(first);
    expect(sim.events.trigger('pod-end')).toBe('Holzhaus wird verlassen');
    expect(run(sim, 60, () => !sim.pod.current)).toBe(true);
  });

  it('place.coffee-break (coffee, coffee-end): two start a break and nobody else is pulled from the desk, a second one clears the kitchen first; coffee-end ends it and is refused without one', () => {
    const sim = office();
    const three = only(sim, GROUP.slice(0, 3));
    sim.scenario.clear('kitchen', 'coffee');
    expect(run(sim, 20, () => three.every((p) => p.task?.phase === 'work'))).toBe(true);
    refused(sim, 'coffee-end');
    expect(sim.events.trigger('coffee')).toMatch(/^Kaffeepause: /);
    const members = sim.kitchen.current!.members;
    expect(members).toHaveLength(2);
    expect(three.filter((p) => p.task?.phase === 'work')).toEqual(three.filter((p) => !members.includes(p)));
    const first = sim.kitchen.current!;
    expect(sim.events.trigger('coffee')).toMatch(/^Kaffeepause: /);
    expect(sim.kitchen.current).not.toBe(first);
    expect(sim.events.trigger('coffee-end')).toBe('Kaffeepause beendet');
    expect(run(sim, 60, () => !sim.kitchen.current)).toBe(true);
  });

  for (const [id, n] of [
    ['meeting-chat', 2],
    ['meeting-small', 4],
    ['meeting-big', 6],
  ] as const) {
    it(`social.start (${id}): ${n} people leave their desks for a talk in the corridor; refused with one person in the office`, () => {
      const sim = office();
      const crew = only(sim, [...GROUP, PHONE].slice(0, n));
      expect(sim.events.trigger(id)).toMatch(new RegExp(`^Meeting mit ${n}: `));
      expect(sim.social.active).toHaveLength(1);
      expect(ids(sim.social.active[0].members)).toEqual(ids(crew));
      expect(crew.every((p) => p.task?.phase !== 'work')).toBe(true);

      const alone = office();
      only(alone, [GROUP[0]]);
      refused(alone, id);
    });
  }

  it('social.join (talk-join): somebody free joins the running talk and greets first; refused without a talk', () => {
    const sim = office();
    const crew = only(sim, GROUP.slice(0, 3));
    refused(sim, 'talk-join');
    sim.events.trigger('meeting-chat');
    const conv = sim.social.active[0];
    const [c] = crew.filter((p) => !conv.members.includes(p));
    expect(sim.events.trigger('talk-join')).toBe(`${first(c)} stösst dazu`);
    expect(ids(conv.members)).toEqual(ids(crew));
    expect(c.task?.phase).not.toBe('work');
    expect(run(sim, 30, () => conv.speaker === c && !!conv.text)).toBe(true);
    expect(conv.text).toBe(SIGNALS.join.symbol);
  });

  it('social.crowd (crowd): six stand packed in the corridor at once, start no talk and are sent off; refused with five in the office', () => {
    const sim = office();
    const crowd = only(sim, [...GROUP, PHONE]);
    refused(sim, 'crowd'); // in the quiet start nobody would notice the crowd
    run(sim, 4);
    expect(sim.events.trigger('crowd')).toMatch(/^Gedränge: /);
    expect(sim.traffic.bodiesNear(CORRIDOR_POINT, CROWD_RADIUS)).toBe(CROWD_LIMIT + 1);
    expect(run(sim, 1, () => sim.social.active.length > 0)).toBe(false);
    expect(crowd.every((p) => p.socialCooldown > 0)).toBe(true);

    const five = office();
    only(five, GROUP);
    refused(five, 'crowd');
    run(five, 4);
    refused(five, 'crowd'); // past the quiet start nobody held out is brought in
  });

  it('actions.force (printer): with somebody at the printer, the event stops that job (paper gone, free again) and somebody else prints', () => {
    const sim = office();
    const [busy] = only(sim, [...GROUP], 'free');
    sim.scenario.clear('printer');
    expect(busy.startPrint(sim.nav)).toBe(true);
    expect(run(sim, 60, () => sim.office.printer!.occupant === busy && busy.printJob?.phase === 'print')).toBe(true);
    expect(sim.events.trigger('printer')).toMatch(/ druckt$/);
    const user = sim.office.printer!.occupant;
    expect(user).toBeTruthy();
    expect(sim.people.filter((o) => o.printJob)).toEqual([user]); // one job, the old one is not left behind
    if (user !== busy) expect(busy.printJob).toBeNull();
  });

  it('actions.force (printer): every card of the Aktionen sheet happens at the start of seeds 1 to 5', () => {
    for (let seed = 1; seed <= 5; seed++) {
      for (const a of OFFICE_ACTIONS) {
        const sim = office({}, seed);
        expect(sim.events.trigger(a.eventId), `seed ${seed}, ${a.id}`).not.toMatch(/: nicht möglich$/);
      }
    }
  });

  it('actions.force (talk-join, crowd): without a talk, or in the quiet start, they are refused and a running meeting keeps going; crowd with too few free clears the meeting, talk-join never', () => {
    const sim = office();
    only(sim, [...GROUP, PHONE], 'free');
    expect(sim.events.trigger('meeting-room')).toMatch(/^Besprechung mit 5: /);
    const meeting = sim.meetingRoom.current;
    refused(sim, 'talk-join'); // clearing places cannot start a talk
    refused(sim, 'crowd'); // nor end the quiet start
    expect(sim.meetingRoom.current).toBe(meeting);
    // past the quiet start too few are free: that is cleared as for any action, the meeting ends
    run(sim, 4);
    expect(sim.events.trigger('crowd')).toMatch(/^Gedränge: /);
    expect(sim.meetingRoom.current).toBeNull();

    // a talk runs and everybody else sits in the meeting: still refused, clearing would end the talk too
    const busy = office();
    only(busy, [...GROUP, PHONE, KURT], 'free');
    expect(busy.events.trigger('meeting-room')).toMatch(/^Besprechung mit 5: /);
    expect(run(busy, 90, () => busy.meetingRoom.occupants(busy.people) === 5)).toBe(true); // seated: tied up
    expect(busy.events.trigger('meeting-chat')).toMatch(/^Meeting mit 2: /);
    const [talk, room] = [busy.social.active[0], busy.meetingRoom.current];
    refused(busy, 'talk-join');
    expect(busy.social.active[0]).toBe(talk);
    expect(busy.meetingRoom.current).toBe(room);
  });

  it('dev.events (break-talks): every running talk ends', () => {
    const sim = office();
    const crew = only(sim, GROUP.slice(0, 4));
    sim.events.trigger('meeting-small');
    expect(crew.every((p) => p.talk)).toBe(true);
    expect(sim.events.trigger('break-talks')).toBe('1 Gespräche beendet');
    expect(crew.every((p) => !p.talk)).toBe(true);
  });

  for (const [feature, kind, id, busy] of [
    ['place.vape', 'vape', VAPER, (p: Person) => !!p.vapeJob],
    ['place.phone-walk', 'phone', PHONE, (p: Person) => !!p.phoneJob],
  ] as const) {
    it(`${feature} (${kind}-${id}): starts at once and points at them; out of the office they are called back; refused while the player holds them`, () => {
      const pointed: Walker[] = [];
      const sim = office({ point: (w) => pointed.push(w) });
      const [p] = only(sim, [id]);
      expect(sim.events.trigger(`${kind}-${id}`)).toMatch(new RegExp(`^${first(p)} (dampft|telefoniert)$`));
      expect(busy(p)).toBe(true);
      expect(pointed).toEqual([p]);

      const held = office();
      only(held, [id])[0].held = true;
      refused(held, `${kind}-${id}`);

      const out = office();
      out.scenario.put(id, 'errand', 'free');
      expect(out.events.trigger(`${kind}-${id}`)).toBe(ev.calledBack(first(p)));
      expect(who(out, id).awayLeft).toBe(0);
    });
  }

  it('place.booth (phone-booth, phone-booth-end): a phone person goes into the booth, a second call sends the first out; with no phone person in, one is brought in', () => {
    const sim = office();
    const [jan] = only(sim, [PHONE, GROUP[0]]);
    refused(sim, 'phone-booth-end');
    expect(sim.events.trigger('phone-booth')).toBe('Jan geht telefonieren in die Kabine');
    expect(sim.phoneBooth.current!.members).toEqual([jan]);
    expect(jan.task?.phase).not.toBe('work');
    expect(sim.events.trigger('phone-booth')).toBe('Jan geht telefonieren in die Kabine');
    expect(sim.events.trigger('phone-booth-end')).toBe('Kabine wird verlassen');
    expect(run(sim, 60, () => !sim.phoneBooth.current)).toBe(true);

    // the only phone person is in the player's hands: not taken
    const steered = office();
    only(steered, [PHONE, GROUP[0]])[0].controlled = true;
    refused(steered, 'phone-booth');

    // nobody with a phone in the office: one of them appears and goes in
    const none = office();
    for (const p of none.people) if (p.member.look.phone) none.scenario.put(p.id, 'errand', 'free');
    const away = none.people.filter((p) => p.member.look.phone);
    expect(away.every((p) => p.awayLeft > 0)).toBe(true);
    expect(none.events.trigger('phone-booth')).toMatch(/ geht telefonieren in die Kabine$/);
    expect(away.filter((p) => p.presence === 'in')).toHaveLength(1);
    expect(none.phoneBooth.current).not.toBeNull();
  });

  it('place.toilet (toilet, toilet-end): two take the cabins, two wait, the fifth empties the room first; toilet-end empties the room and is refused when empty', () => {
    const sim = office();
    only(sim, GROUP);
    sim.scenario.clear('wc');
    refused(sim, 'toilet-end');
    expect([1, 2, 3, 4].map(() => sim.events.trigger('toilet').replace(/^\S+ /, ''))).toEqual(['geht aufs WC', 'geht aufs WC', 'wartet vor dem WC', 'wartet vor dem WC']);
    const inside = [...sim.toilets.cabins.map((c) => c.session!.person), ...sim.toilets.queue.map((w) => w.person)];
    expect(new Set(inside).size).toBe(4); // four different people: nobody already there was picked again
    expect(sim.events.trigger('toilet')).toMatch(/ (geht aufs WC|wartet vor dem WC)$/);
    expect(sim.events.trigger('toilet-end')).toBe('WCs werden verlassen');
    expect(sim.toilets.queue).toHaveLength(0);
    expect(run(sim, 60, () => sim.toilets.cabins.every((c) => !c.session))).toBe(true);
  });

  it('place.printer (printer): somebody leaves the desk to print; while the printer is taken the job is cleared (actions.force) and a new one starts', () => {
    const sim = office();
    const [p] = only(sim, [GROUP[0]]);
    sim.scenario.clear('printer');
    expect(sim.events.trigger('printer')).toBe('Oscar druckt');
    expect(sim.office.printer!.occupant).toBe(p);
    expect(p.printJob).toBeTruthy();
    expect(p.task?.phase).not.toBe('work');
    expect(sim.events.trigger('printer')).toBe('Oscar druckt'); // the only one free: his old job ends, a new one starts
    expect(sim.people.filter((o) => o.printJob)).toEqual([p]);
  });

  it('place.foosball (foosball): two leave their desks for the table; refused while it is taken or with one person in', () => {
    const sim = office();
    const two = only(sim, GROUP.slice(0, 2));
    expect(sim.events.trigger('foosball')).toMatch(/ spielen Kicker$/);
    expect(two.every((p) => p.foosJob && p.task?.phase !== 'work')).toBe(true);
    expect(sim.office.foosball!.free).toBe(false);
    refused(sim, 'foosball');

    const alone = office();
    only(alone, [GROUP[0]]);
    refused(alone, 'foosball');
  });

  it('play.nerf (nerf): a dev with a gun and the nearest free person: the dev aims at them; a running skirmish is stopped and started again; without a dev in the office one is brought in', () => {
    const sim = office();
    const dev = sim.people.find((p) => p.member.look.nerf)!;
    const other = sim.people.find((p) => !p.member.look.nerf)!;
    only(sim, [dev.id, other.id]);
    expect(sim.events.trigger('nerf')).toBe(`${first(dev)} schiesst auf ${first(other)}`);
    expect(sim.nerf.active).toBe(true);
    expect(dev.task?.phase).not.toBe('work');

    // nobody with a gun in the office: one of them appears
    const none = office();
    for (const p of none.people) if (p.member.look.nerf) none.scenario.put(p.id, 'errand', 'free');
    const away = none.people.filter((p) => p.member.look.nerf);
    expect(away.every((p) => p.awayLeft > 0)).toBe(true);
    expect(none.events.trigger('nerf')).toMatch(/ schiesst auf /);
    expect(away.filter((p) => p.presence === 'in').length).toBeGreaterThanOrEqual(1);
    expect(none.nerf.active).toBe(true);
  });

  it('play.boombox (boombox): Sandro pulls out the boombox wherever he is, Donata may stay at her desk; a running scene starts over; the two appear when they are away; plays again although she took it today', () => {
    const sim = office();
    const [dj, boss] = only(sim, ['sandro-hagen', 'donata-manser']);
    expect(run(sim, 20, () => dj.sit > 0.9 && boss.sit > 0.9)).toBe(true);
    expect(sim.events.trigger('boombox')).toBe(`${first(dj)} packt die Boombox aus`);
    expect(sim.boombox.stage).toBe('play');
    expect(sim.boombox.timer).toBeGreaterThanOrEqual(300); // the gag by itself only after its gap
    expect(dj.task).toBeNull(); // up from his desk
    expect(dj.boomPose).toBe('play');
    expect(boss.working).toBe(true); // she notices only after a few seconds
    // again while it plays: it starts over
    expect(sim.events.trigger('boombox')).toBe(`${first(dj)} packt die Boombox aus`);
    expect(sim.boombox.stage).toBe('play');
    expect(run(sim, 90, () => sim.boombox.onDesk)).toBe(true);
    // taken away today, the event plays it again
    expect(sim.boombox.taken).toBe(true);
    expect(sim.events.trigger('boombox')).toBe(`${first(dj)} packt die Boombox aus`);
    expect(sim.boombox.onDesk).toBeNull();
    expect(sim.boombox.mesh.parent).toBe(dj.rig.body);

    // the two away: they appear in the office and it starts at once
    const away = office();
    only(away, []);
    for (const id of ['sandro-hagen', 'donata-manser']) away.scenario.put(id, 'errand', 'free');
    const pair = [who(away, 'sandro-hagen'), who(away, 'donata-manser')];
    expect(away.events.trigger('boombox')).toBe(`${first(pair[0])} packt die Boombox aus`);
    expect(pair.every((p) => p.inOffice)).toBe(true);
    expect(away.boombox.stage).toBe('play');
  });

  it('office.door-lettering (door-lettering): opens the lettered doors, the next call shuts them', () => {
    const sim = office();
    expect(sim.events.trigger('door-lettering')).toBe('Beschriftete Türen gehen auf');
    expect(sim.events.trigger('door-lettering')).toBe('Beschriftete Türen gehen zu');
  });

  for (const kind of ['errand', 'home'] as const) {
    it(`presence.manual (${kind}): somebody free walks out; refused with nobody in the office`, () => {
      const sim = office();
      const [p] = only(sim, [GROUP[0]], 'free');
      expect(sim.events.trigger(kind)).toBe(ev.leaves[kind]('Oscar'));
      expect(p.presence).toBe('leaving');
      expect(p.awayKind).toBe(kind);

      const empty = office();
      only(empty, []);
      refused(empty, kind);
    });
  }

  it('presence.remote-visit (remote-visit): the remote worker is called to the office for a visit; refused once he is there', () => {
    const sim = office();
    const p = sim.presence.remoteWorker!;
    expect(p.presence).toBe('out');
    expect(sim.presence.isVisitor(p)).toBe(false);
    expect(sim.events.trigger('remote-visit')).toBe(ev.visits(first(p)));
    expect(sim.presence.isVisitor(p)).toBe(true);
    expect(run(sim, 120, () => p.inOffice)).toBe(true);
    refused(sim, 'remote-visit');
  });

  it('pet.owner (pet-errand): somebody with a pet walks out; with no owner in, one is called back', () => {
    const sim = office();
    const [p] = only(sim, [DOG_OWNER], 'free');
    expect(sim.events.trigger('pet-errand')).toBe(ev.leaves.errand('Ramon'));
    expect(p.presence).toBe('leaving');
    expect(p.awayKind).toBe('errand');

    // the first owner stands in a talk: the next one goes
    const talk = office();
    const [chatting, other] = only(talk, talk.people.filter((o) => o.pets.length).slice(0, 2).map((o) => o.id), 'free');
    const [listener] = also(talk, GROUP[0]);
    talk.social.start([chatting, listener], { ...chatting.pos }, talk.nav);
    expect(chatting.talk).toBeTruthy();
    expect(talk.events.trigger('pet-errand')).toBe(ev.leaves.errand(first(other)));
    expect(chatting.presence).toBe('in');

    // the first owner is held in the office by a scene: the next one goes
    const held = office();
    const pair = held.people.filter((o) => o.pets.length).slice(0, 2);
    only(held, [pair[0].id]);
    held.scenario.put(pair[1].id, 'desk', 'free');
    expect(held.events.trigger('pet-errand')).toBe(ev.leaves.errand(first(pair[1])));
    expect(pair[0].presence).toBe('in');

    const none = office();
    const owners = none.people.filter((o) => o.pets.length);
    for (const o of owners) none.scenario.put(o.id, 'errand', 'free');
    expect(owners.every((o) => o.awayLeft > 0)).toBe(true);
    expect(none.events.trigger('pet-errand')).toMatch(/ geht raus$/);
  });

  it('pet.announce (door-greet): the pets in the office bark or meow, those outside do not', () => {
    const sim = office();
    only(sim, [DOG_OWNER, CAT_OWNER]);
    const inside = sim.pets.filter((d) => !d.away);
    expect(inside.length).toBeGreaterThanOrEqual(2);
    // each awake pet answers a call with 60%: a few calls and somebody has
    for (let i = 0; i < 10; i++) expect(sim.events.trigger('door-greet')).toBe('Die Tiere melden sich');
    expect(inside.some((d) => d.barkT > 0)).toBe(true);
    expect(sim.pets.filter((d) => d.away).every((d) => d.barkT === 0)).toBe(true);
  });

  it('kurt.behavior (kurt-walkout): Marco leaves his desk for home; out of the office he is called back first; pulled out of a meeting', () => {
    const sim = office();
    const [marco] = only(sim, [KURT], 'free');
    expect(sim.events.trigger('kurt-walkout')).toBe(strings.alterEgo.event.off);
    expect(marco.presence).toBe('leaving');
    expect(marco.awayKind).toBe('off');

    const out = office();
    out.scenario.put(KURT, 'errand', 'free');
    expect(who(out, KURT).awayLeft).toBeGreaterThan(0);
    expect(out.events.trigger('kurt-walkout')).toBe(strings.alterEgo.event.off);
    expect(who(out, KURT).presence).toBe('leaving');

    const busy = office();
    only(busy, [KURT, ...GROUP.slice(0, 4)], 'free');
    busy.events.trigger('meeting-room');
    expect(who(busy, KURT).meetJob).toBeTruthy();
    expect(busy.events.trigger('kurt-walkout')).toBe(strings.alterEgo.event.off);
    expect(who(busy, KURT).meetJob).toBeFalsy();
  });

  for (const [feature, id, kind] of [
    ['kurt.home', 'kurt-home', 'home'],
    ['kurt.screen', 'kurt-screen', 'errand'],
  ] as const) {
    it(`${feature} (${id}): Marco is out at once, ${kind === 'home' ? 'in the home office as Kurt' : 'on an errand'}`, () => {
      const sim = office();
      const [marco] = only(sim, [KURT], 'free');
      expect(sim.events.trigger(id)).toBe(strings.alterEgo.event[kind]);
      expect(marco.presence).toBe('out');
      expect(marco.awayKind).toBe(kind);
      expect(marco.homeAlter).toBe(kind === 'home');
    });
  }

  it('presence.manual (all-back): everybody who is out is called back', () => {
    const sim = office();
    for (const id of GROUP) sim.scenario.put(id, 'errand', 'free');
    const out = GROUP.map((id) => who(sim, id));
    expect(out.every((p) => p.awayLeft > 0)).toBe(true);
    expect(sim.events.trigger('all-back')).toBe(ev.allReturn);
    expect(out.every((p) => p.awayLeft === 0)).toBe(true);
  });

  it('move.passages (passage-meeting): two people walk at a narrow passage from both ends: one waits beside it while the other comes through, then both are through; with nobody free it is refused', () => {
    const sim = office();
    const pair = only(sim, GROUP.slice(0, 2));
    expect(sim.events.trigger('passage-meeting')).toMatch(/ begegnen sich im Durchgang$/);
    const passages = sim.traffic.passages;
    expect(pair.every((p) => p.state === 'walk' && p.path.length > 0)).toBe(true);
    const goal = pair.map((p) => p.path.at(-1)!);
    const through = (p: Person, i: number) => Math.hypot(p.pos.x - goal[i].x, p.pos.z - goal[i].z) < 0.5;
    const done = pair.map(() => false);
    let waited = false; // one stood waiting while the other was in the passage
    run(sim, 40, () => done.every(Boolean), () => {
      pair.forEach((p, i) => (done[i] ||= through(p, i)));
      const inside = pair.map((p) => passages.at(p.pos));
      if (pair.some((p, i) => p.yielding && inside[1 - i] >= 0)) waited = true;
      expect(inside[0] >= 0 && inside[0] === inside[1]).toBe(false); // never both in the same passage
    });
    expect(done).toEqual([true, true]);
    expect(waited).toBe(true);
    for (const p of sim.people) if (p.inOffice) sim.scenario.put(p.id, 'errand');
    refused(sim, 'passage-meeting');
  });

  it('move.passages (passage-meeting): with nobody in the office it brings two in and runs (actions.force); on a floor without a passage it is refused and clears nothing', () => {
    const allOut = (s: Sim) => s.people.forEach((p) => s.scenario.put(p.id, 'errand', 'free')); // out, but free to be brought in
    const sim = office();
    allOut(sim);
    expect(sim.events.trigger('passage-meeting')).toMatch(/ begegnen sich im Durchgang$/);
    expect(sim.people.filter((p) => p.inOffice).length).toBeGreaterThanOrEqual(2);

    const empty = office();
    allOut(empty);
    vi.spyOn(empty.traffic.passages, 'atIndex').mockReturnValue(-1); // nothing narrow anywhere
    refused(empty, 'passage-meeting');
  });
});
