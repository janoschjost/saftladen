import * as THREE from 'three';
import {
  buildDove,
  buildDrone,
  buildEnvelope,
  buildParcel,
  DOVE_SCALE,
  ENVELOPES,
  flap,
  HANG,
  MAIL_SPOT,
  MAILBOX_TOP,
  MAILBOXES,
  PARCEL_SPOT,
  PARCELS,
  sizeOf,
  slotAt,
  spin,
  type Dove,
  type Drone,
} from '../render/mailProps';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Desk } from './Office';
import type { Person } from './Person';
import type { Presence } from './Presence';
import { smooth } from './petPose';
import { stream } from './rng';
import { GAME_HOUR } from './Smoke';
import type { Weather } from './Weather';

/** The apprentices fetch the post: Alyosha, Jeerapat and Oscar (#202). */
export const COURIERS = ['alyosha-krajnc', 'jeerapat-wang', 'oscar-grob'];
export const isCourier = (p: Person): boolean => COURIERS.includes(p.id);

/** Seconds between two deliveries by themselves (a letter or a parcel, then the post is gone from the porch). */
const GAP = [1.5 * GAME_HOUR, 3 * GAME_HOUR];
/** Share of the deliveries that are parcels (the drone's); the rest are letters (the dove's). */
const PARCEL_SHARE = 0.35;
/** Seconds a fetcher stands at the mailbox and looks in before they take the post and go back. */
export const MAIL_STAY = 1.6;
/** Seconds the item waits for somebody to fetch it before it is put on the desk anyway. */
const WAIT_MAX = 3 * GAME_HOUR;
/** Seconds between two looks for somebody to fetch the post. */
const LOOK = 1;
/** Seconds the fetcher takes to put the item down on the desk. */
export const PUT = 1.2;
/** Seconds the walk to the desk may take; then the fetcher is taken to be there. */
const WALK_MAX = 60;

/** The dove: seconds from its start until it sits on the mailbox, until the letter is in the slot, until it takes off, until it is gone. */
export const DOVE = { land: 4, drop: 5, off: 5.6, gone: 8.8 };
/** The drone: until it hovers over the porch, until the parcel stands on the floor, until the ropes are off, until it is gone. */
export const DRONE = { over: 4.5, down: 7, free: 7.4, gone: 11.4 };

const mailDice = stream(0x6d61696c);
const between = ([a, b]: number[]) => a + mailDice() * (b - a);
const pick = <T>(list: readonly T[]): T => list[Math.floor(mailDice() * list.length)];

const lerp = THREE.MathUtils.lerp;
const ease = smooth;
const easeOut = (u: number) => 1 - (1 - u) ** 3;
const easeIn = (u: number) => u * u * u;
const part = (t: number, from: number, to: number) => Math.min(1, Math.max(0, (t - from) / (to - from)));

type Kind = 'letter' | 'parcel';
type Stage = 'arrive' | 'wait' | 'out' | 'back' | 'hand' | 'put';

interface Job {
  kind: Kind;
  /** the mailbox the dove goes to */
  box: number;
  to: Person;
  desk: Desk;
  item: THREE.Mesh;
  courier: Dove | Drone;
  stage: Stage;
  /** seconds in this stage */
  t: number;
  /** seconds since the dove / drone started */
  flight: number;
  /** the item is where it is delivered (in the mailbox, on the porch) */
  dropped: boolean;
  /** a dev event asked for it: whoever is free fetches it, whatever the plan says */
  asked: boolean;
  /** who fetches it, and the pin that walks them to the desk */
  by: Person | null;
  pin: Person['scripted'];
  look: number;
}

/**
 * The post (#202): now and then a dove drops a letter into one of the three mailboxes by the door, or a drone sets a
 * parcel down in front of them. One of the apprentices (Alyosha, Jeerapat, Oscar) goes out, takes it, carries it to the
 * desk of the person it is addressed to and puts it there, where it stays until the next working day. Rolls its own
 * dice, so the post never shifts the simulation's numbers.
 */
export class Mail {
  /** seconds until the next delivery by itself */
  timer = between(GAP) / 2;
  /** where the items stand on the desks (until the next working day) */
  readonly onDesks = new Map<Desk, THREE.Mesh>();
  private job: Job | null = null;
  /** the working day the desks were cleared for (null: not yet seen) */
  private days: number | null = null;

  constructor(
    private world: THREE.Scene,
    private people: readonly Person[],
    private presence: Presence,
    private weather: Weather,
    /** the desk somebody's post goes to (their own, else where they work) */
    private deskOf: (p: Person) => Desk | null,
  ) {}

  /** A delivery is running (from the dove's start to the item on the desk). */
  get active(): boolean {
    return !!this.job;
  }

  get stage(): Stage | null {
    return this.job?.stage ?? null;
  }

  get kind(): Kind | null {
    return this.job?.kind ?? null;
  }

  /** Who the running delivery is addressed to, who carries it, and what it is. */
  get to(): Person | null {
    return this.job?.to ?? null;
  }

  get by(): Person | null {
    return this.job?.by ?? null;
  }

  get item(): THREE.Mesh | null {
    return this.job?.item ?? null;
  }

  /** What the carrier says while they carry it (✉️ or 📦), for the speech bubbles. */
  get bubbles(): Array<{ who: Person; text: string }> {
    const j = this.job;
    if (!j?.by || (j.stage !== 'back' && j.stage !== 'hand' && j.stage !== 'put')) return [];
    return [{ who: j.by, text: j.kind === 'letter' ? '✉️' : '📦' }];
  }

  /** The apprentices who could go for the post right now. `asked`: a dev event asks, they only have to be free. */
  couriers(asked = false): Person[] {
    return this.people.filter((p) => isCourier(p) && (asked ? this.presence.free(p) : this.presence.maySmoke(p)) && !p.inMeeting);
  }

  /** Who the post may be addressed to: everybody with a desk, but the apprentices who fetch it. */
  private addressees(): Person[] {
    return this.people.filter((p) => !isCourier(p) && this.deskOf(p));
  }

  /**
   * A dove (letter) or a drone (parcel) brings the post. False when a delivery runs already or there is nobody to
   * address it to. `to`: the addressee (else somebody picked by dice); `asked`: see `couriers`.
   */
  start(kind: Kind, asked = false, to?: Person): boolean {
    if (this.job) return false;
    const who = to ?? pick(this.addressees());
    const desk = who && this.deskOf(who);
    if (!who || !desk) return false;
    const variant = Math.floor(mailDice() * (kind === 'letter' ? ENVELOPES.length : PARCELS.length));
    const item = kind === 'letter' ? buildEnvelope(variant) : buildParcel(variant);
    const courier = kind === 'letter' ? buildDove() : buildDrone();
    courier.root.rotation.order = 'YXZ'; // heading first, then the nod
    this.world.add(courier.root);
    const j: Job = { kind, box: Math.floor(mailDice() * MAILBOXES.length), to: who, desk, item, courier, stage: 'arrive', t: 0, flight: 0, dropped: false, asked, by: null, pin: null, look: 0 };
    this.job = j;
    if (kind === 'letter') this.carryInBeak(j, courier as Dove); // in its beak until it lets go
    this.fly(j);
    return true;
  }

  /** The delivery ends at once (an action needs the people, see `makePossible`, or a new day starts): the item lands on the desk, nobody carries or runs. */
  abort(inside: (p: Person) => Vec2): void {
    const j = this.job;
    if (!j) return;
    this.job = null;
    j.courier.root.removeFromParent();
    const p = j.by;
    if (p) {
      p.mailCarry = null;
      if (j.pin && p.scripted === j.pin) p.unpin();
      if (p.onPorch && !this.presence.isKept(p)) {
        if (p.beforeDoor) p.cancelLeave();
        else p.arriveNow(inside(p));
      }
    }
    this.putOnDesk(j);
  }

  /** All the items are gone from the desks (a new working day). */
  clearDesks(): void {
    for (const m of this.onDesks.values()) m.removeFromParent();
    this.onDesks.clear();
  }

  update(dt: number, nav: NavGrid, days: number): void {
    if (days !== this.days) {
      const first = this.days === null;
      this.days = days;
      if (!first) {
        this.clearDesks();
        if (this.job) this.abort((p) => this.deskOf(p)?.approach ?? p.pos); // a day jumped by: whoever is out comes in at their desk
      }
    }
    const j = this.job;
    if (j) return this.advance(j, dt, nav);
    if ((this.timer -= dt) > 0) return;
    this.timer = between(GAP);
    // by itself: dry, and somebody to fetch it (on duty, free)
    if (this.weather.raining || !this.couriers().length) return void (this.timer = 5);
    this.start(mailDice() < PARCEL_SHARE ? 'parcel' : 'letter');
  }

  private advance(j: Job, dt: number, nav: NavGrid): void {
    j.t += dt;
    switch (j.stage) {
      case 'arrive':
        j.flight += dt;
        this.fly(j);
        if (j.flight >= (j.kind === 'letter' ? DOVE.gone : DRONE.gone)) {
          j.courier.root.removeFromParent();
          j.stage = 'wait';
          j.t = 0;
        }
        return;
      case 'wait':
        if (j.t >= WAIT_MAX) return this.deliverNow(j);
        if ((j.look -= dt) > 0) return;
        j.look = LOOK;
        return this.send(j, nav);
      case 'out': {
        const p = j.by!;
        // picked up, steered, sent home, called away: the item stays where it is for somebody else
        if (p.held || p.presence === 'in' || p.awayKind !== 'mail' || (p.controlled && !p.scripted)) return this.giveUp(j);
        if (p.presence === 'returning' || (p.atPorchStop && p.awayLeft <= MAIL_STAY / 2)) this.take(j, p);
        return;
      }
      case 'back': {
        const p = j.by!;
        if (p.held || p.controlled) return this.deliverNow(j); // somebody took them: the item goes to the desk as it is
        if (p.presence === 'in') {
          const d = j.desk;
          p.pinTo({ at: d.approach, yaw: d.yaw, walk: true });
          j.pin = p.scripted;
          j.stage = 'hand';
          j.t = 0;
        } else if (p.awayKind !== 'mail') this.deliverNow(j); // sent home or called away on the way in
        return;
      }
      case 'hand':
      case 'put': {
        const p = j.by!;
        if (p.held || !p.inOffice || p.scripted !== j.pin) return this.deliverNow(j);
        if (j.stage === 'put') {
          if (j.t >= PUT) this.deliverNow(j);
        } else if (j.pin?.arrived || j.t >= WALK_MAX) {
          j.stage = 'put';
          j.t = 0;
        }
        return;
      }
    }
  }

  /** Looks for somebody to fetch what lies there; the first who is free and may use the door goes. */
  private send(j: Job, nav: NavGrid): void {
    if (!j.dropped || (!j.asked && this.weather.raining)) return; // by itself, only in the dry
    const free = this.couriers(j.asked);
    const first = Math.floor(mailDice() * free.length); // who is asked first, rolled on the post's own dice
    for (const p of [...free.slice(first), ...free.slice(0, first)]) {
      if (!this.presence.mailRun(p, nav, MAIL_STAY)) continue;
      p.porchSpot = MAIL_SPOT;
      j.by = p;
      j.stage = 'out';
      j.t = 0;
      return;
    }
  }

  /** The fetcher stands at the mailbox: takes the item (a letter in the hand, a parcel in both arms) and goes back in. */
  private take(j: Job, p: Person): void {
    j.item.removeFromParent();
    p.mailCarry = j.kind;
    const m = j.item;
    m.rotation.set(0, 0, 0);
    m.scale.setScalar(1);
    if (j.kind === 'letter') {
      p.rig.elbowR.add(m);
      m.position.set(0, -0.58, 0.03);
      m.rotation.set(0, Math.PI / 2, 0);
    } else {
      p.rig.body.add(m);
      m.position.set(0, 1.05, 0.22 + sizeOf(m).d / 2);
    }
    j.stage = 'back';
    j.t = 0;
  }

  /** The fetcher could not go (or was called away on the way out): the item lies there for the next. */
  private giveUp(j: Job): void {
    const p = j.by;
    if (p) {
      p.mailCarry = null;
      if (p.porchSpot === MAIL_SPOT) p.porchSpot = null;
      if (p.awayKind === 'mail') {
        if (p.beforeDoor) p.cancelLeave();
        else if (p.presence === 'out') this.presence.hurryIn(p);
      }
    }
    j.by = null;
    j.stage = 'wait';
    j.t = 0;
  }

  /** The item is on the desk now (put there, or the carrier could not make it): the delivery is over. */
  private deliverNow(j: Job): void {
    this.job = null;
    const p = j.by;
    if (p) {
      p.mailCarry = null;
      if (j.pin && p.scripted === j.pin) p.unpin();
    }
    this.putOnDesk(j);
  }

  /** On the desk top beside the keyboard, one item at a time per desk. */
  private putOnDesk({ item, desk, kind }: Job): void {
    this.onDesks.get(desk)?.removeFromParent();
    item.removeFromParent();
    const s = sizeOf(item);
    item.scale.setScalar(1);
    if (kind === 'letter') {
      item.rotation.set(-Math.PI / 2, 0, 0.3); // an envelope lies flat
      item.position.set(0.5, 0.75 + s.d / 2 + 0.002, 0.05);
    } else {
      item.rotation.set(0, 0.25, 0);
      item.position.set(0.5, 0.75 + s.h / 2, 0.05);
    }
    desk.root.add(item);
    this.onDesks.set(desk, item);
  }

  /** The dove or the drone and its item at `flight` seconds: where it is, what it does. */
  private fly(j: Job): void {
    if (j.kind === 'letter') this.flyDove(j, j.courier as Dove);
    else this.flyDrone(j, j.courier as Drone);
  }

  private carryInBeak(j: Job, d: Dove): void {
    const m = j.item;
    d.root.add(m);
    m.scale.setScalar(1 / DOVE_SCALE);
    m.position.set(0, -0.02, 0.27);
    m.rotation.set(0, Math.PI / 2, 0);
  }

  private flyDove(j: Job, d: Dove): void {
    const t = j.flight;
    const m = MAILBOXES[j.box];
    // sits on the lid, looking along it, its beak over the slot
    const land = { x: m.x - 0.1, y: MAILBOX_TOP + 0.13, z: m.z + 0.14 };
    const from = { x: m.x + 9, y: 7, z: m.z + 11 };
    const to = { x: m.x - 10, y: 8, z: m.z + 14 };
    const root = d.root;
    // the letter goes into the slot
    if (!j.dropped && t >= DOVE.drop) {
      j.dropped = true;
      const s = slotAt(j.box);
      j.item.removeFromParent();
      j.item.scale.setScalar(1);
      j.item.position.set(s.x, s.y, s.z + sizeOf(j.item).h / 2 - 0.04); // lies in the slot, half of it out
      j.item.rotation.set(-Math.PI / 2 + 0.25, 0, (mailDice() - 0.5) * 0.3);
      this.world.add(j.item);
    }
    let yaw = Math.PI / 2;
    let rate = 0;
    root.rotation.x = 0;
    if (t < DOVE.land) {
      const u = easeOut(t / DOVE.land);
      const wobble = Math.sin(u * 11) * 0.25 * (1 - u);
      root.position.set(lerp(from.x, land.x, u) + wobble, lerp(from.y, land.y, u) + Math.sin(u * 7) * 0.2 * (1 - u), lerp(from.z, land.z, u));
      // heads for the box, then turns along the lid for the landing
      yaw = lerp(Math.atan2(land.x - from.x, land.z - from.z), Math.PI / 2, easeIn(part(t, DOVE.land - 1.2, DOVE.land)));
      rate = 5 * (1 - part(t, DOVE.land - 0.4, DOVE.land));
    } else if (t < DOVE.off) {
      root.position.set(land.x, land.y, land.z);
      // bows its head when it lets go
      if (t > DOVE.drop - 0.6 && t < DOVE.drop + 0.3) root.rotation.x = 0.35;
    } else {
      const u = easeIn(part(t, DOVE.off, DOVE.gone));
      root.position.set(lerp(land.x, to.x, u), lerp(land.y, to.y, u) + Math.sin(u * 3) * 0.3, lerp(land.z, to.z, u));
      yaw = lerp(Math.PI / 2, Math.atan2(to.x - land.x, to.z - land.z), ease(part(t, DOVE.off, DOVE.off + 0.8)));
      rate = 6;
    }
    root.rotation.y = yaw;
    flap(d, t, rate);
  }

  private flyDrone(j: Job, d: Drone): void {
    const t = j.flight;
    const s = sizeOf(j.item);
    const hang = (HANG + 0.04) * d.root.scale.y; // top of the parcel below the drone's centre
    const rest = hang + s.h; // drone height with the parcel on the floor
    const over = { x: PARCEL_SPOT.x, y: 3.4, z: PARCEL_SPOT.z };
    const from = { x: PARCEL_SPOT.x + 8, y: 5.5, z: PARCEL_SPOT.z + 10 };
    const to = { x: PARCEL_SPOT.x - 10, y: 7, z: PARCEL_SPOT.z + 12 };
    const root = d.root;
    if (t < DRONE.over) {
      const u = easeOut(t / DRONE.over);
      root.position.set(lerp(from.x, over.x, u), lerp(from.y, over.y, u), lerp(from.z, over.z, u));
      root.rotation.z = Math.sin(u * Math.PI) * 0.12; // leans into the flight
    } else if (t < DRONE.down) {
      const u = ease(part(t, DRONE.over, DRONE.down));
      root.position.set(over.x, lerp(over.y, rest, u), over.z);
      root.rotation.z = 0;
    } else {
      const u = easeIn(part(t, DRONE.free, DRONE.gone));
      root.position.set(lerp(over.x, to.x, u), lerp(rest, to.y, Math.min(1, u * 1.6)), lerp(over.z, to.z, u));
      root.rotation.z = -Math.sin(u * Math.PI) * 0.12;
    }
    root.rotation.y = 0;
    spin(d, t);
    d.ropes.visible = t < DRONE.free;
    // the parcel hangs under it until it stands on the floor
    const m = j.item;
    if (t < DRONE.down) {
      if (!m.parent) this.world.add(m);
      m.position.set(root.position.x, root.position.y - hang - s.h / 2, root.position.z);
      m.rotation.y = 0;
    } else if (!j.dropped) {
      j.dropped = true;
      m.position.set(PARCEL_SPOT.x, s.h / 2, PARCEL_SPOT.z);
    }
  }
}
