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
 * Two people passing each other rarely stop; bigger groups almost always start talking.
 */
const START_CHANCE = [0, 0, 0.04, 0.18, 0.35, 0.5, 0.6];
const JOIN_CHANCE = 0.15;
export const CROWD_RADIUS = 2.2; // a talk is only started or joined if no more than CROWD_LIMIT bodies stand this close
export const CROWD_LIMIT = 5;
const CLEAR_DISTANCE = 4; // how far people walk off when they make room instead of talking
const MIN_GROUP_SPACING = 3.2; // new conversations keep this far from running ones (no blobs of 10+ people)

const SEEK_CHANCE = 0.02; // per check and free person: walk over to a friend
const SEEK_MIN = 0.3; // how close a friendship has to be before somebody goes looking for them
const SEEK_RANGE = 16;
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

export class Conversation {
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
    const a0 = Math.atan2(sorted[0].pos.z - c.z, sorted[0].pos.x - c.x);
    const r = this.ringRadius(n);
    sorted.forEach((m, i) => {
      const a = a0 + (i * Math.PI * 2) / n;
      m.walkTo(nav, { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r });
    });
  }

  join(p: Person, nav: NavGrid): void {
    this.joiner = p;
    const a = random() * Math.PI * 2;
    const r = this.ringRadius(this.members.length + 1);
    this.members.push(p);
    p.talk = this;
    p.walkTo(nav, { x: this.center.x + Math.cos(a) * r, z: this.center.z + Math.sin(a) * r });
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

  private centroid(group: readonly Person[]): Vec2 {
    return { x: group.reduce((t, m) => t + m.pos.x, 0) / group.length, z: group.reduce((t, m) => t + m.pos.z, 0) / group.length };
  }

  /** Everybody walks off to a quiet spot elsewhere and sits out of conversations for a while. */
  private clearOut(group: readonly Person[], nav: NavGrid, traffic: Traffic): void {
    for (const m of group) {
      m.socialCooldown = 6 + random() * 6;
      m.walkTo(nav, traffic.wanderSpot(m, 10, CLEAR_DISTANCE));
    }
  }

  /** Past the quiet start after spawn, in which nobody starts, joins or clears out of a talk. */
  get checking(): boolean {
    return this.clock >= GRACE;
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
  start(group: Person[], center: Vec2, nav: NavGrid): Conversation {
    const c = new Conversation(group, center, nav, this.affinity);
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

    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.task && !p.printJob && !p.foosJob && !p.vapeJob && !p.snackLeft && !p.phoneJob && p.socialCooldown <= 0);

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
      if (traffic && traffic.bodiesNear(this.centroid(group), CROWD_RADIUS) > CROWD_LIMIT) {
        // too many people in one spot: nobody starts a chat, they clear the way
        this.clearOut(group, nav, traffic);
        continue;
      }
      const gx = group.reduce((t, m) => t + m.pos.x, 0) / group.length;
      const gz = group.reduce((t, m) => t + m.pos.z, 0) / group.length;
      if (this.active.some((c) => Math.hypot(c.center.x - gx, c.center.z - gz) < MIN_GROUP_SPACING)) continue;
      // friends stop for a chat much more readily than strangers
      if (random() >= Math.min(0.9, START_CHANCE[Math.min(group.length, MAX_GROUP)] * (1 + this.affinity.max(group) * 4))) continue;
      const cx = group.reduce((s, m) => s + m.pos.x, 0) / group.length;
      const cz = group.reduce((s, m) => s + m.pos.z, 0) / group.length;
      let center = { x: Math.min(Math.max(cx, 2), nav.cols * nav.cell - 2), z: Math.min(Math.max(cz, 2), nav.rows * nav.cell - 2) };
      // gather where it is quiet, not in the middle of a crowd
      if (traffic) center = traffic.openSpotNear(center, 1.5, group);
      this.active.push(new Conversation(group, center, nav, this.affinity));
    }

    if (traffic) this.seekFriends(free, nav, traffic);
  }

  /** Now and then somebody who is free looks up a good friend and walks over for a chat. */
  private seekFriends(free: readonly Person[], nav: NavGrid, traffic: Traffic): void {
    for (const p of free) {
      if (p.talk || (this.seekUntil.get(p) ?? 0) > this.clock || random() >= SEEK_CHANCE) continue;
      let best: Person | null = null;
      let bestAffinity = SEEK_MIN;
      for (const o of free) {
        if (o === p || o.talk) continue;
        const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z);
        if (d < LINK_DISTANCE + 0.5 || d > SEEK_RANGE) continue;
        const a = this.affinity.get(p, o);
        if (a > bestAffinity) {
          best = o;
          bestAffinity = a;
        }
      }
      if (!best) continue;
      this.seekUntil.set(p, this.clock + 15 + random() * 15);
      p.walkTo(nav, traffic.openSpotNear(best.pos, 1.1, [p, best]));
    }
  }
}
