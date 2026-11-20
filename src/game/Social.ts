import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { Traffic } from './Traffic';
import { Chat, SIGNALS, pick, playBeat } from './Chatter';
import { random } from './rng';

export type ConversationKind = 'chat' | 'discussion';

/** What a talking walker needs to know about its group (a Conversation, or a Meeting in the meeting room). */
export interface Talk {
  kind: ConversationKind;
  center: Vec2;
  members: Person[];
  /** who is talking right now (listeners turn towards them) */
  speaker?: Person;
  /** a chat standing about on the floor: its members shuffle aside for somebody with right of way (`Walker.rightOfWay`) */
  giveWay?: boolean;
}

/** Pick who talks next: never the current speaker, and in groups the previous speaker answers more often than a random bystander. */
export function nextSpeaker(members: readonly Person[], current: Person, previous: Person | null): Person {
  const others = members.filter((m) => m !== current);
  if (!others.length) return current;
  if (previous && previous !== current && others.includes(previous) && random() < 0.45) return previous;
  return others[Math.floor(random() * others.length)];
}

const LINK_DISTANCE = 1.7; // people closer than this count as "meeting"
export const MAX_GROUP = 6;
const CHECK_INTERVAL = 0.5; // seconds between social checks
const GRACE = 3; // seconds after spawn before the first check
const GATHER_TIMEOUT = 6;

/**
 * Chance per check that a meeting turns into a conversation, by group size.
 * Two people passing each other stop now and then (friends much more readily); bigger groups almost always start talking.
 */
const START_CHANCE = [0, 0, 0.15, 0.18, 0.35, 0.5, 0.6];
const JOIN_CHANCE = 0.15;
const PASSAGE_CLEAR = 1; // members of a talk stand at least this far (m) from a doorway or corridor, where there is room elsewhere (#265)
export const CROWD_RADIUS = 2.2; // a talk is only started or joined if no more than CROWD_LIMIT bodies stand this close
export const CROWD_LIMIT = 5;
const CLEAR_DISTANCE = 4; // how far people walk off when they make room instead of talking
const MIN_GROUP_SPACING = 3.2; // new conversations keep this far from running ones (no blobs of 10+ people)

const SEEK_CHANCE = 0.06; // per check and free person: walk over to somebody else who is free, for a chat
const SEEK_FRIEND = 4; // how much likelier a close friend (affinity 1) is picked than a stranger
const SEEK_RANGE = 20;
const SEEK_TIME = 25; // seconds a walk-over may take before it is given up
const SEEK_REACH = LINK_DISTANCE + 0.4; // this close to the one they went to, the chat starts
const LEAVE_CHANCE = 0.12; // per turn in a group of three or more, once the talk is past its middle: somebody says bye and drifts off
const SWITCH_AFTER = 5; // turns before the talk may wander off to another topic
const BOND_DECAY = 0.9997; // per check, friendships fade back towards their base
const PAUSE = [0.25, 0.7]; // silence between two turns
const BYE_TIME = 1.5;

const pairKey = (a: Person, b: Person): string => (a.member.id < b.member.id ? `${a.member.id}|${b.member.id}` : `${b.member.id}|${a.member.id}`);

/** How well two people get on, 0..1. Grows with every conversation they have, fades slowly; friends talk longer and look each other up. */
export class Affinity {
  private extra = new Map<string, number>();

  /** what they have in common from the start: same job, both have a dog */
  private base(a: Person, b: Person): number {
    return (a.member.role === b.member.role ? 0.12 : 0) + (a.member.dog && b.member.dog ? 0.2 : 0);
  }

  get(a: Person, b: Person): number {
    return Math.min(1, this.base(a, b) + (this.extra.get(pairKey(a, b)) ?? 0));
  }

  bond(a: Person, b: Person, v: number): void {
    const k = pairKey(a, b);
    this.extra.set(k, Math.min(0.9, (this.extra.get(k) ?? 0) + v));
  }

  fade(f: number): void {
    for (const [k, v] of this.extra) {
      if (v * f < 0.01) this.extra.delete(k);
      else this.extra.set(k, v * f);
    }
  }

  /** the closest friendship inside a group */
  max(group: readonly Person[]): number {
    let m = 0;
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) m = Math.max(m, this.get(group[i], group[j]));
    return m;
  }

  /** how close somebody is to a group on average */
  towards(p: Person, group: readonly Person[]): number {
    const others = group.filter((m) => m !== p);
    return others.length ? others.reduce((t, m) => t + this.get(p, m), 0) / others.length : 0;
  }
}

/** The test a talk uses to keep its members out of the way of people passing (by a doorway or corridor of `traffic`). */
const clearOf = (traffic?: Traffic) => (traffic ? (q: Vec2) => traffic.passages.near(q, PASSAGE_CLEAR) : undefined);

export class Conversation {
  readonly giveWay = true;
  members: Person[];
  kind: ConversationKind;
  center: Vec2;
  phase: 'gather' | 'talk' | 'bye' = 'gather';
  speaker: Person;
  /** empty during the short pauses between turns */
  text = '';
  chat: Chat;
  private previous: Person | null = null;
  private leaving: Person | null = null;
  private joiner: Person | null = null;
  private switched = false;
  private byeTime = 0;
  private gatherTime = 0;
  private time = 0;
  private speakerTimer = 0;
  private duration: number;

  constructor(
    members: Person[],
    center: Vec2,
    private nav: NavGrid,
    private affinity: Affinity = new Affinity(),
    /** true for a spot where somebody standing is in the way of people passing (in or by a doorway or corridor) */
    private inTheWay: (p: Vec2) => boolean = () => false,
  ) {
    this.members = members;
    this.center = center;
    this.kind = members.length > 2 ? 'discussion' : 'chat';
    this.chat = new Chat();
    // friends have more to say
    this.duration = (this.kind === 'chat' ? 6 + random() * 7 : 10 + random() * 10) * (1 + affinity.max(members) * 0.8);
    this.speaker = members[0];
    this.assignSlots(nav);
    for (const m of members) m.talk = this;
  }

  private ringRadius(n = this.members.length): number {
    return Math.max(0.55, 0.45 / Math.sin(Math.PI / n)) + 0.05;
  }

  private assignSlots(nav: NavGrid): void {
    const c = this.center;
    const n = this.members.length;
    const sorted = [...this.members].sort((a, b) => Math.atan2(a.pos.z - c.z, a.pos.x - c.x) - Math.atan2(b.pos.z - c.z, b.pos.x - c.x));
    const r = this.ringRadius(n);
    const spot = (a: number) => ({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
    // turn the ring (from where the first one stands) until everybody has a spot they can reach that is not in the way of
    // those who pass; a spot nobody can walk to leaves them standing wherever they got stuck, often in a doorway (#265)
    const start = Math.atan2(sorted[0].pos.z - c.z, sorted[0].pos.x - c.x);
    const bad = (a0: number) => sorted.some((_, i) => this.unfit(nav, spot(a0 + (i * Math.PI * 2) / n)));
    let a0 = start;
    for (let k = 0; k < 12 && bad(a0); k++) a0 += (Math.PI * 2) / 12;
    if (bad(a0)) a0 = start; // no such turn: as it was
    sorted.forEach((m, i) => m.walkTo(nav, spot(a0 + (i * Math.PI * 2) / n)));
  }

  /** A spot to stand at that is no good: a wall or furniture there, or in the way of people passing. */
  private unfit(nav: NavGrid, p: Vec2): boolean {
    const { cx, cz } = nav.toCell(p);
    return !nav.walkable(cx, cz) || this.inTheWay(p);
  }

  join(p: Person, nav: NavGrid): void {
    this.joiner = p;
    const r = this.ringRadius(this.members.length + 1);
    const spot = () => {
      const a = random() * Math.PI * 2;
      return { x: this.center.x + Math.cos(a) * r, z: this.center.z + Math.sin(a) * r };
    };
    let at = spot();
    for (let k = 0; k < 8 && this.unfit(nav, at); k++) at = spot(); // somewhere around the centre that is free and not by a door
    this.members.push(p);
    p.talk = this;
    p.walkTo(nav, at);
    if (this.members.length > 2 && this.kind === 'chat') {
      this.kind = 'discussion';
      this.duration += 5;
    }
  }

  /** returns false when the conversation is over */
  update(dt: number): boolean {
    // dragged or broken-off members leave
    this.members = this.members.filter((m) => {
      if (!m.held && !m.controlled) return true;
      m.talk = null;
      m.speaking = false;
      m.socialCooldown = 8;
      return false;
    });
    if (this.members.length < 2) return false;

    if (this.phase === 'gather') {
      this.gatherTime += dt;
      if (this.members.every((m) => m.state === 'idle') || this.gatherTime > GATHER_TIMEOUT) this.phase = 'talk';
      return true;
    }

    if (this.phase === 'bye') {
      this.byeTime -= dt;
      return this.byeTime > 0;
    }

    this.time += dt;
    this.speakerTimer -= dt;
    if (this.speakerTimer <= 0) {
      if (this.text) {
        // turn over: a short silence, then somebody else answers
        this.text = '';
        for (const m of this.members) m.speaking = false;
        this.speakerTimer = PAUSE[0] + random() * (PAUSE[1] - PAUSE[0]);
        if (this.leaving) this.dropMember(this.leaving);
      } else {
        this.turn();
      }
    }
    if (this.time >= this.duration) {
      // wrap up: one last line, then everybody goes their way
      this.phase = 'bye';
      this.byeTime = BYE_TIME;
      this.speaker = pick(this.members);
      this.text = SIGNALS.bye.symbol;
      playBeat(this.speaker, this.members, SIGNALS.bye.reaction, 'wave');
      for (const m of this.members) m.speaking = m === this.speaker;
    }
    return true;
  }

  /** Somebody speaks up: the newcomer greets, a bored member says bye, the topic wanders off, or the talk simply goes on. */
  private turn(): void {
    const previous = this.speaker;
    let speaker: Person;
    let text: string;
    const joiner = this.joiner && this.members.includes(this.joiner) ? this.joiner : null;
    this.joiner = null;
    if (joiner) {
      speaker = joiner;
      text = SIGNALS.join.symbol;
      playBeat(speaker, this.members, SIGNALS.join.reaction, 'wave');
    } else if (this.members.length >= 3 && !this.leaving && this.time > this.duration * 0.5 && random() < LEAVE_CHANCE) {
      // the one who is the least close to the others is the first to go
      const rest = this.members.filter((m) => m !== previous);
      speaker = rest.reduce((a, b) => (this.affinity.towards(b, this.members) < this.affinity.towards(a, this.members) ? b : a));
      text = SIGNALS.bye.symbol;
      playBeat(speaker, this.members, SIGNALS.bye.reaction, 'wave');
      this.leaving = speaker;
    } else if (!this.switched && this.chat.turns >= SWITCH_AFTER && random() < 0.3) {
      this.switched = true;
      speaker = nextSpeaker(this.members, previous, this.previous);
      text = SIGNALS.topic.symbol;
      playBeat(speaker, this.members, SIGNALS.topic.reaction, 'surprise');
      this.chat = new Chat();
    } else {
      speaker = nextSpeaker(this.members, previous, this.previous);
      text = this.chat.next(speaker, this.members, this.kind);
    }
    this.previous = previous;
    this.speaker = speaker;
    this.text = text;
    this.speakerTimer = 1.2 + random() * 2;
    for (const m of this.members) m.speaking = m === speaker;
  }

  /** One member walks off during the talk; the rest close the gap. */
  private dropMember(p: Person): void {
    this.leaving = null;
    const i = this.members.indexOf(p);
    if (i < 0) return;
    this.members.splice(i, 1);
    p.talk = null;
    p.speaking = false;
    p.socialCooldown = 12 + random() * 15;
    p.timer = 0.3;
    if (this.members.length >= 2) this.assignSlots(this.nav);
  }

  end(): void {
    // a good talk brings people closer
    const gain = 0.03 + 0.05 * Math.min(1, this.time / this.duration);
    if (this.time > 2) for (let i = 0; i < this.members.length; i++) for (let j = i + 1; j < this.members.length; j++) this.affinity.bond(this.members[i], this.members[j], gain);
    for (const m of this.members) {
      m.talk = null;
      m.speaking = false;
      m.socialCooldown = 20 + random() * 25;
      m.timer = 0.3 + random();
    }
  }
}

/** Detects meetings and turns some of them into chats and discussions. */
export class Social {
  active: Conversation[] = [];
  readonly affinity = new Affinity();
  private checkTimer = GRACE;
  private clock = 0;
  private seekUntil = new Map<Person, number>();
  /** walk-overs on their way: who went to whom, until when */
  private seeking = new Map<Person, { to: Person; until: number }>();
  /** somebody is coming in through the door */
  private rush = false;

  private centroid(group: readonly Person[]): Vec2 {
    return { x: group.reduce((t, m) => t + m.pos.x, 0) / group.length, z: group.reduce((t, m) => t + m.pos.z, 0) / group.length };
  }

  /** Everybody walks off to a quiet spot elsewhere and sits out of conversations for a while. */
  private clearOut(group: readonly Person[], nav: NavGrid, traffic: Traffic): void {
    for (const m of group) {
      m.socialCooldown = 6 + random() * 6;
      if (m.task) continue; // on the way to their desk anyway
      m.walkTo(nav, traffic.wanderSpot(m, 10, CLEAR_DISTANCE));
    }
  }

  /** Past the quiet start after spawn, in which nobody starts, joins or clears out of a talk. */
  get checking(): boolean {
    return this.clock >= GRACE;
  }

  /** Whom `p` is walking over to for a chat, if anybody. */
  walkingOverTo(p: Person): Person | null {
    return this.seeking.get(p)?.to ?? null;
  }

  get chattingCount(): number {
    return this.active.reduce((n, c) => n + c.members.length, 0);
  }

  /** Dev: take one person out of whatever conversation they are in. */
  leave(p: Person): void {
    for (const c of this.active) {
      const i = c.members.indexOf(p);
      if (i < 0) continue;
      c.members.splice(i, 1);
      p.talk = null;
      p.speaking = false;
      p.socialCooldown = 8;
    }
  }

  /** Dev: start a conversation right now (members must already have dropped what they were doing). */
  start(group: Person[], center: Vec2, nav: NavGrid, traffic?: Traffic): Conversation {
    const c = new Conversation(group, center, nav, this.affinity, clearOf(traffic));
    this.active.push(c);
    return c;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid, traffic?: Traffic): void {
    this.clock += dt;
    this.active = this.active.filter((c) => {
      if (c.update(dt)) return true;
      c.end();
      return false;
    });

    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = CHECK_INTERVAL;
    this.affinity.fade(BOND_DECAY);

    // while somebody comes in through the door nobody starts a chat or walks over to somebody: the hallway stays clear (rush hours)
    this.rush = people.some((p) => p.presence === 'returning');
    // somebody on the way to a walk-over (or waiting for one) is spoken for: `arrive` starts their talk
    const free = people.filter((p) => this.available(p) && !this.engaged(p));

    // others may join a running conversation
    for (const c of this.active) {
      if (c.members.length >= MAX_GROUP) continue;
      for (const p of free) {
        if (p.talk) continue;
        if (Math.hypot(p.pos.x - c.center.x, p.pos.z - c.center.z) < LINK_DISTANCE + 0.8 && random() < JOIN_CHANCE * (1 + this.affinity.towards(p, c.members) * 3)) {
          if (traffic && traffic.bodiesNear(c.center, CROWD_RADIUS) > CROWD_LIMIT) {
            this.clearOut([p], nav, traffic); // too packed already: make room instead
            continue;
          }
          if (p.task) p.interrupt();
          c.join(p, nav);
          if (c.members.length >= MAX_GROUP) break;
        }
      }
    }

    // new meetings: connected groups of free people standing close together
    const seen = new Set<Person>();
    for (const start of free) {
      if (seen.has(start) || start.talk) continue;
      const group = [start];
      seen.add(start);
      for (let i = 0; i < group.length && group.length < MAX_GROUP; i++) {
        for (const o of free) {
          if (seen.has(o) || o.talk) continue;
          if (Math.hypot(o.pos.x - group[i].pos.x, o.pos.z - group[i].pos.z) < LINK_DISTANCE) {
            seen.add(o);
            group.push(o);
            if (group.length >= MAX_GROUP) break;
          }
        }
      }
      if (group.length < 2) continue;
      // friends stop for a chat much more readily than strangers
      this.begin(group, nav, traffic, Math.min(0.9, START_CHANCE[Math.min(group.length, MAX_GROUP)] * (1 + this.affinity.max(group) * 4)));
    }

    if (traffic) {
      this.arrive(nav, traffic);
      this.seekCompany(free, nav, traffic);
    }
  }

  /** Starts a talk for `group` (with `chance`) at a quiet spot nearby; not in a crowd (they clear the way instead), not next to a running talk. */
  private begin(group: Person[], nav: NavGrid, traffic?: Traffic, chance = 1): void {
    const c = this.centroid(group);
    if (traffic && traffic.bodiesNear(c, CROWD_RADIUS) > CROWD_LIMIT) {
      this.clearOut(group, nav, traffic);
      return;
    }
    if (this.active.some((a) => Math.hypot(a.center.x - c.x, a.center.z - c.z) < MIN_GROUP_SPACING) || random() >= chance) return;
    for (const m of group) if (m.task) m.interrupt(); // on the way to their desk: the desk can wait
    let center = { x: Math.min(Math.max(c.x, 2), nav.cols * nav.cell - 2), z: Math.min(Math.max(c.z, 2), nav.rows * nav.cell - 2) };
    // gather where it is quiet, not in the middle of a crowd
    if (traffic) center = traffic.openSpotNear(center, 1.5, group);
    this.active.push(new Conversation(group, center, nav, this.affinity, clearOf(traffic)));
  }

  /** Who went over to somebody: once there the two start talking; somebody who got busy on the way (or took too long) calls it off. */
  private arrive(nav: NavGrid, traffic: Traffic): void {
    for (const [p, s] of this.seeking) {
      const o = s.to;
      if (!p.freeToChat || !o.freeToChat || s.until < this.clock) {
        this.seeking.delete(p);
        continue;
      }
      if (this.rush) continue; // they wait until the hallway is clear
      if (Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) < SEEK_REACH) {
        this.seeking.delete(p);
        this.begin([p, o], nav, traffic);
        continue;
      }
      if (p.state === 'idle') p.walkTo(nav, traffic.openSpotNear(o.pos, 1.1, [p, o])); // they moved on: follow
      if (o.state === 'idle') o.timer = Math.max(o.timer, 1); // and the other one waits for them
    }
  }

  /**
   * Now and then somebody on a break walks over to somebody else who is free (standing about with a coffee, in the
   * kitchen, on the way back to the desk) for a chat; good friends are picked much more often. Busy people (desk,
   * meeting, call, toilet, held, steered, brewing at the machine) are never in `free`, so nobody goes to them.
   */
  private seekCompany(free: readonly Person[], nav: NavGrid, traffic: Traffic): void {
    for (const p of free) if (!p.talk && !this.engaged(p) && (this.seekUntil.get(p) ?? 0) <= this.clock && random() < SEEK_CHANCE) this.walkOver(p, free, nav, traffic);
  }

  /** free for a chat, and nobody is coming in right now */
  private available(p: Person): boolean {
    return p.freeToChat && !this.rush;
  }

  /** on the way to somebody, or waiting for somebody to come over */
  private engaged(p: Person): boolean {
    if (this.seeking.has(p)) return true;
    for (const s of this.seeking.values()) if (s.to === p) return true;
    return false;
  }

  /** `p` walks over to somebody else on a break (of `people`) for a chat, now; whom, or null when nobody is free nearby. */
  walkOver(p: Person, people: readonly Person[], nav: NavGrid, traffic: Traffic): Person | null {
    if (!this.available(p) || this.engaged(p)) return null;
    const near = people.filter((o) => {
      if (o === p || !this.available(o) || this.engaged(o)) return false;
      const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
      return d >= SEEK_REACH && d <= SEEK_RANGE;
    });
    if (!near.length) return null;
    const weights = near.map((o) => 1 + this.affinity.get(p, o) * SEEK_FRIEND);
    let r = random() * weights.reduce((t, w) => t + w, 0);
    const to = near.find((_, i) => (r -= weights[i]) < 0) ?? near[near.length - 1];
    this.seekUntil.set(p, this.clock + 15 + random() * 15);
    this.seeking.set(p, { to, until: this.clock + SEEK_TIME });
    for (const m of [p, to]) if (m.task) m.interrupt(); // the desk can wait
    // both meet at a quiet spot next to the one who is gone to (not in a doorway or a corridor), who then waits there
    const spot = traffic.openSpotNear(to.pos, 1.1, [p, to]);
    p.walkTo(nav, spot);
    to.walkTo(nav, spot);
    return to;
  }
}
