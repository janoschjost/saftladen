import { strings } from '../i18n/strings';
import { CORRIDOR_POINT } from '../render/officeModel';
import type { Dog } from './Dog';
import type { Person } from './Person';
import { PET_HEIGHT } from './petPose';
import { random } from './rng';
import type { Sim } from './Sim';

export const first = (p: Person): string => p.member.name.split(' ')[0];
const firsts = (group: Person[], sep = ', '): string => group.map(first).join(sep);

/**
 * The dev events that only touch the simulation: who an event picks, how it pulls them out of what they do, and what
 * it sets off. They run on a `Sim` alone (tests), and the game shows them in the dev panel, the Aktionen sheet and
 * behind `?event=`. Events that need the view (weather setting, the home office rooms) are registered by `Game`.
 *
 * An event that cannot run returns null and leaves everybody as they were. The exceptions call somebody back who has
 * to be in the office for it (`phone-booth`, `pet-dog`, `pet-cat`, `pet-errand`, `kurt-walkout`): the next try finds them there.
 */
export function registerSimEvents(sim: Sim): void {
  const { events, people, pets, nav, presence } = sim;
  /** in the office and not in anybody's hands (the player's, a scene's) */
  const isFree = (p: Person) => p.inOffice && !p.held && !p.controlled;
  const free = () => people.filter(isFree);
  /**
   * Sits in a meeting, the pod, the phone box or a WC cabin, or waits in front of the WC: `drop` does not get them
   * out of there at once, so they are not to be had for something on the spot. (A chat or a coffee break it ends.)
   */
  const tiedUp = (p: Person) => p.inMeeting || sim.toilets.queue.some((w) => w.person === p);
  /** Pulls a person out of their conversation / desk / printer run so an event can take over. */
  const drop = (p: Person) => sim.drop(p);
  const pickFree = (n: number, fit: (p: Person) => boolean = () => true): Person[] =>
    free()
      .filter(fit)
      .sort(() => random() - 0.5)
      .slice(0, n);

  /**
   * A group event: up to `n` free people, as many as the place has `room` for, are pulled out of what they do and
   * sent there. Nobody is pulled who would not get a place.
   */
  const gather = (id: string, label: string, n: number, room: () => number, start: (group: Person[]) => unknown, text: (group: Person[]) => string) =>
    events.register({
      id,
      group: 'Meetings',
      label,
      run: () => {
        const places = Math.min(n, room());
        if (places < 2) return null; // before anybody is picked: a refusal rolls no dice either
        const group = pickFree(places);
        if (group.length < 2) return null;
        group.forEach(drop);
        return start(group) ? text(group) : null;
      },
    });
  const inRoom = (screen: 'slides' | 'kart', what: string) =>
    [() => sim.meetingRoom.emptySeats, (group: Person[]) => sim.meetingRoom.start(group, nav, screen), (group: Person[]) => `${what} mit ${group.length}: ${firsts(group)}`] as const;
  gather('meeting-room', 'Besprechungsraum (5)', 5, ...inRoom('slides', 'Besprechung'));
  gather('meeting-kart', 'Mittags-Mariokart (3)', 3, ...inRoom('kart', 'Kart-Runde'));
  events.register({
    id: 'meeting-room-status',
    group: 'Meetings',
    label: 'Besprechung: Status',
    run: () => {
      const m = sim.meetingRoom.current;
      return m ? `${m.phase} ${m.members.map((p) => `${first(p)}:${p.meetPhase}/${p.state}/${p.path.length}@${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`).join(' ')}` : 'keine Besprechung';
    },
  });
  events.register({
    id: 'meeting-room-end',
    group: 'Meetings',
    label: 'Besprechung beenden',
    run: () => {
      const m = sim.meetingRoom.current;
      if (!m) return null;
      m.members.forEach((p) => p.dismissMeeting());
      return 'Besprechung beendet';
    },
  });
  /** Calls back the owner of the first of these pets who is out or on the way out; the event is retried until they and the pet are in. */
  const callBackOwner = (ofThese: readonly Dog[]) => {
    const out = ofThese.find((d) => d.owner.presence === 'out' || d.owner.presence === 'leaving')?.owner;
    if (out) presence.callBack(out);
  };
  /** The pets that come to the office today (`pet.schedule`). */
  const comingToday = () => pets.filter((d) => d.comesToday && !d.removed);
  for (const kind of ['dog', 'cat'] as const) {
    events.register({
      id: `pet-${kind}`,
      group: 'Tiere',
      label: kind === 'dog' ? 'Hund streicheln' : 'Katze streicheln',
      run: () => {
        const ofKind = pets.filter((d) => d.isCat === (kind === 'cat') && !d.removed);
        // every pet of this kind stays home today: one comes in after all
        if (!ofKind.some((d) => d.comesToday) && ofKind.length) ofKind[0].comesToday = true;
        const coming = ofKind.filter((d) => d.comesToday);
        // a pet that is not busy itself, and not an owner in a meeting, the phone box or at the WC: they would be
        // called out and still could not stroke
        const pet = coming.find((d) => !d.away && !d.fixed && !d.petted && !d.held && isFree(d.owner) && !tiedUp(d.owner));
        if (!pet) {
          if (coming.some((d) => d.owner.inOffice)) return null; // an owner is in, just busy (or their pet is): try again in a moment
          callBackOwner(coming);
          return null;
        }
        const p = pet.owner;
        drop(p);
        if (!p.petDog(pet.pos, 30, PET_HEIGHT[kind])) return null;
        pet.petBy(p, 30, nav);
        return `${first(p)} streichelt ${pet.name}`;
      },
    });
  }
  events.register({
    id: 'pet-owner',
    group: 'Tiere',
    label: 'Wer hat heute ein Tier dabei?',
    run: () => {
      const owner = people.find((p) => p.inOffice && p.pets.some((d) => d.comesToday && !d.away));
      if (!owner) {
        callBackOwner(comingToday());
        return null;
      }
      sim.point(owner);
      const today = presence.petsToday.map((t) => `${t.pet} (${t.owner.split(' ')[0]})`);
      return `Heute einmal im Büro: ${today.join(', ') || 'keine Tiere'}`;
    },
  });
  events.register({
    id: 'pet-passage',
    group: 'Tiere',
    label: 'Tier in einen Durchgang setzen',
    run: () => {
      // a pet of a seated owner is put into the nearest passage: it gets up and lies down beside the owner again, out of the way
      const pet = pets.find((d) => !d.away && !d.held && d.owner.inOffice && d.owner.sit > 0.5);
      if (!pet) {
        callBackOwner(comingToday()); // nobody with a pet in: they come back, the event is retried
        return null;
      }
      const o = nav.toCell(pet.owner.pos);
      let best: { x: number; z: number } | null = null;
      let bestD = Infinity;
      for (let dz = -8; dz <= 8; dz++) {
        for (let dx = -8; dx <= 8; dx++) {
          const cx = o.cx + dx;
          const cz = o.cz + dz;
          if (!nav.walkable(cx, cz) || sim.traffic.passages.atIndex(cz * nav.cols + cx) < 0) continue;
          const d = Math.hypot(dx, dz);
          if (d >= 2 && d < bestD) {
            bestD = d;
            best = nav.center(cx, cz);
          }
        }
      }
      if (!best) return null;
      pet.placeAt(best);
      sim.point(pet);
      return `${pet.name} liegt im Durchgang`;
    },
  });
  gather(
    'pod',
    'Zwei ins Holzhaus',
    2,
    () => (sim.pod.free ? 2 : 0),
    (group) => sim.pod.start(group, nav),
    (group) => `${firsts(group, ' + ')} setzen sich ins Holzhaus`,
  );
  events.register({
    id: 'pod-end',
    group: 'Meetings',
    label: 'Holzhaus leeren',
    run: () => {
      const s = sim.pod.current;
      if (!s) return null;
      s.abort();
      return 'Holzhaus wird verlassen';
    },
  });
  // two: the kitchen takes no more, a third would be pulled from the desk for nothing
  gather(
    'coffee',
    'Kaffeepause (2)',
    2,
    () => (sim.kitchen.free ? 2 : 0),
    (group) => sim.kitchen.start(group, nav),
    (group) => `Kaffeepause: ${firsts(group)}`,
  );
  events.register({
    id: 'coffee-end',
    group: 'Meetings',
    label: 'Kaffeepause beenden',
    run: () => {
      const b = sim.kitchen.current;
      if (!b) return null;
      b.end();
      return 'Kaffeepause beendet';
    },
  });
  const inCorridor = [() => Infinity, (group: Person[]) => sim.social.start(group, { ...CORRIDOR_POINT }, nav), (group: Person[]) => `Meeting mit ${group.length}: ${firsts(group)}`] as const;
  gather('meeting-chat', 'Gespräch (2)', 2, ...inCorridor);
  gather('meeting-small', 'Meeting (4)', 4, ...inCorridor);
  gather('meeting-big', 'Meeting (6)', 6, ...inCorridor);
  events.register({
    id: 'break-talks',
    group: 'Meetings',
    label: 'Gespräche beenden',
    run: () => {
      const n = sim.social.active.length;
      sim.social.active.slice().forEach((c) => c.members.slice().forEach((m) => sim.social.leave(m)));
      return `${n} Gespräche beendet`;
    },
  });

  /** Somebody's own habit (vape, phone): out of the office they are called back first, the next try starts it. */
  const habit = (kind: 'vape' | 'phone', label: (name: string) => string, start: (p: Person) => void) => {
    for (const p of people.filter((o) => o.member.look[kind])) {
      events.register({
        id: `${kind}-${p.id}`,
        group: 'Aktionen',
        label: label(first(p)),
        run: () => {
          if (!p.inOffice) {
            presence.callBack(p);
            return strings.presence.event.calledBack(first(p));
          }
          if (p.held) return null;
          drop(p);
          start(p);
          sim.point(p);
          return label(first(p));
        },
      });
    }
  };
  habit('vape', (name) => `${name} dampft`, (p) => p.startVape(2));
  habit('phone', (name) => `${name} telefoniert`, (p) => p.startPhone(nav));
  events.register({
    id: 'phone-booth',
    group: 'Aktionen',
    label: 'Jemand telefoniert in der Kabine',
    run: () => {
      if (!sim.phoneBooth.free) return null;
      const p = pickFree(1).find((o) => o.member.look.phone) ?? people.find((o) => o.member.look.phone && isFree(o) && !o.talk && !o.meetJob);
      if (!p) {
        // only phone people use the booth: call one back, the next try (e.g. `?event=phone-booth` retries) sends them in
        const away = people.find((o) => o.member.look.phone && o.presence === 'out');
        if (away) presence.callBack(away);
        return null;
      }
      drop(p);
      return sim.phoneBooth.start(p, nav) ? `${first(p)} geht telefonieren in die Kabine` : null;
    },
  });
  events.register({
    id: 'phone-booth-end',
    group: 'Aktionen',
    label: 'Telefonkabine leeren',
    run: () => {
      const s = sim.phoneBooth.current;
      if (!s) return null;
      s.abort();
      return 'Kabine wird verlassen';
    },
  });
  events.register({
    id: 'toilet',
    group: 'Aktionen',
    label: 'Jemand geht aufs WC (Gameboy)',
    run: () => {
      if (!sim.toilets.hasRoom) return null;
      // not somebody in a talk or a meeting, and so not whoever sits in a cabin or waits in front already
      const [p] = pickFree(1, (o) => !o.talk && !o.inMeeting);
      if (!p) return null;
      drop(p);
      const r = sim.toilets.go(p, nav);
      return r === 'cabin' ? `${first(p)} geht aufs WC` : r === 'queue' ? `${first(p)} wartet vor dem WC` : null;
    },
  });
  events.register({
    id: 'toilet-end',
    group: 'Aktionen',
    label: 'WCs leeren',
    run: () => {
      if (!sim.toilets.cabins.some((c) => c.session) && !sim.toilets.queue.length) return null;
      sim.toilets.abort();
      return 'WCs werden verlassen';
    },
  });
  events.register({
    id: 'printer',
    group: 'Aktionen',
    label: 'Jemand druckt',
    run: () => {
      const p = pickFree(1)[0];
      if (!p?.canPrint) return null;
      drop(p);
      return p.startPrint(nav) ? `${first(p)} druckt` : null;
    },
  });
  events.register({
    id: 'foosball',
    group: 'Aktionen',
    label: 'Zwei spielen Kicker',
    run: () => {
      const f = sim.office.foosball;
      if (!f?.free) return null;
      const [a, b] = pickFree(2);
      if (!b) return null;
      drop(a);
      drop(b);
      return f.start(a, b, nav) ? `${first(a)} und ${first(b)} spielen Kicker` : null;
    },
  });
  events.register({
    id: 'nerf',
    group: 'Aktionen',
    label: 'Nerf-Gefecht',
    run: () => {
      if (sim.nerf.active) return null;
      const shooter = free()
        .filter((o) => o.member.look.nerf)
        .sort(() => random() - 0.5)[0];
      if (!shooter) {
        // only the devs carry guns: call one back, the next try (e.g. `?event=nerf` retries) starts the fight
        const away = people.find((o) => o.member.look.nerf && o.presence === 'out');
        if (away) presence.callBack(away);
        return null;
      }
      const target = free()
        .filter((o) => o !== shooter)
        .sort((x, y) => Math.hypot(x.pos.x - shooter.pos.x, x.pos.z - shooter.pos.z) - Math.hypot(y.pos.x - shooter.pos.x, y.pos.z - shooter.pos.z))[0];
      if (!target) return null;
      drop(shooter);
      drop(target);
      if (!sim.nerf.start(shooter, target)) return null;
      sim.point(shooter);
      return `${first(shooter)} schiesst auf ${first(target)}`;
    },
  });
  events.register({
    id: 'door-lettering',
    group: 'Aktionen',
    label: 'Beschriftete Türen auf / zu',
    run: () => (sim.doors.toggleLettered() ? 'Beschriftete Türen gehen auf' : 'Beschriftete Türen gehen zu'),
  });

  const ev = strings.presence.event;
  for (const kind of ['errand', 'home'] as const) {
    events.register({
      id: kind,
      group: ev.group,
      label: ev.someoneLeaves[kind],
      run: () => {
        const p = pickFree(1)[0];
        // a full home office: somebody gives up their room for them (and comes back to the office)
        return p && presence.send(p, kind, nav, true) ? ev.leaves[kind](first(p)) : null;
      },
    });
  }
  events.register({
    id: 'remote-visit',
    group: ev.group,
    label: ev.remoteVisit,
    run: () => {
      const p = presence.remoteWorker;
      if (!p || p.inOffice) return null; // already here
      presence.setVisit(p, true);
      presence.callBack(p);
      return ev.visits(first(p));
    },
  });
  events.register({
    id: 'pet-errand',
    group: ev.group,
    label: 'Jemand mit Haustier geht raus',
    run: () => {
      const p = people.find((o) => o.pets.length && presence.free(o)); // free to walk out: not in a talk, not held by a scene
      if (!p) {
        // nobody with a pet in: call one back, the event is retried until they are here
        const out = people.find((o) => o.pets.length && o.presence === 'out');
        if (out) presence.callBack(out);
        return null;
      }
      return presence.send(p, 'errand', nav) ? ev.leaves.errand(first(p)) : null;
    },
  });
  events.register({
    id: 'door-greet',
    group: 'Tiere',
    label: 'Tiere begrüssen (Tür)',
    run: () => {
      sim.petCare.greet(pets);
      return 'Die Tiere melden sich';
    },
  });
  // Kurt (#32): Marco goes home as Kurt (spin, poof, out of the door); or right away in the home office as Kurt, or out on
  // an errand (his empty desk shows Kurt from 08:30 to 17:00); back after two minutes
  for (const [id, kind] of [['kurt-walkout', 'off'], ['kurt-home', 'home'], ['kurt-screen', 'errand']] as const) {
    events.register({
      id,
      group: ev.group,
      label: strings.alterEgo.label[kind],
      run: () => {
        const p = people.find((o) => o.member.alterEgo);
        if (!p) return null;
        if (kind === 'off' && p.presence === 'out') {
          presence.callBack(p); // the next try (e.g. `?event=` retries) sends him off again
          return null;
        }
        if (p.presence === 'leaving' || p.presence === 'returning') return null;
        if (p.presence === 'in') {
          if (!presence.free(p)) return null; // tied up (meeting, foosball, ...): not out of the middle of it
          drop(p);
        }
        if (kind === 'off') {
          if (!presence.goHome(p, nav, 120)) return null;
        } else {
          presence.awayNow(p, kind, 120);
          if (kind === 'home') p.homeAlter = true;
        }
        return strings.alterEgo.event[kind];
      },
    });
  }
  events.register({
    id: 'all-back',
    group: ev.group,
    label: strings.presence.panel.callAllBack,
    run: () => {
      presence.callAllBack();
      return ev.allReturn;
    },
  });
}
