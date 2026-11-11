import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { Traffic } from './Traffic';

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
  if (previous && previous !== current && others.includes(previous) && Math.random() < 0.45) return previous;
  return others[Math.floor(Math.random() * others.length)];
}

export const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

const LINK_DISTANCE = 1.7; // people closer than this count as "meeting"
const MAX_GROUP = 6;
const CHECK_INTERVAL = 0.5; // seconds between social checks
const GATHER_TIMEOUT = 6;

/**
 * Chance per check that a meeting turns into a conversation, by group size.
 * Two people passing each other rarely stop; bigger groups almost always start talking.
 */
const START_CHANCE = [0, 0, 0.04, 0.18, 0.35, 0.5, 0.6];
const JOIN_CHANCE = 0.15;
const CROWD_RADIUS = 2.2; // a talk is only started or joined if no more than CROWD_LIMIT bodies stand this close
const CROWD_LIMIT = 5;
const CLEAR_DISTANCE = 4; // how far people walk off when they make room instead of talking
const MIN_GROUP_SPACING = 3.2; // new conversations keep this far from running ones (no blobs of 10+ people)

const BUBBLES_DISCUSSION = ['!', '?', '…', '!?', '…', 'Genau!', 'Aber…', 'Nein, so nicht.', 'Hmm.', 'Eben!', 'Wirklich?'];
const BUBBLES_CHAT = ['…', 'Echt?', 'Haha', 'Stimmt.', 'Mhm', 'Ach ja…', 'Krass!', 'Na klar', 'Hm?', 'Ah, okay.'];
const BUBBLES_BYE = ['Bis später!', 'Ciao!', 'Muss weiter.', 'Dann los!', 'Tschüss!', 'Bis gleich!'];
const PAUSE = [0.25, 0.7]; // silence between two turns
const BYE_TIME = 1.5;

export class Conversation {
  members: Person[];
  kind: ConversationKind;
  center: Vec2;
  phase: 'gather' | 'talk' | 'bye' = 'gather';
  speaker: Person;
  /** empty during the short pauses between turns */
  text = '';
  private previous: Person | null = null;
  private byeTime = 0;
  private gatherTime = 0;
  private time = 0;
  private speakerTimer = 0;
  private duration: number;

  constructor(members: Person[], center: Vec2, nav: NavGrid) {
    this.members = members;
    this.center = center;
    this.kind = members.length > 2 ? 'discussion' : 'chat';
    this.duration = this.kind === 'chat' ? 6 + Math.random() * 7 : 10 + Math.random() * 10;
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
    const a = Math.random() * Math.PI * 2;
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
        this.speakerTimer = PAUSE[0] + Math.random() * (PAUSE[1] - PAUSE[0]);
      } else {
        const next = nextSpeaker(this.members, this.speaker, this.previous);
        this.previous = this.speaker;
        this.speaker = next;
        this.speakerTimer = 1.2 + Math.random() * 2;
        this.text = pick(this.kind === 'chat' ? BUBBLES_CHAT : BUBBLES_DISCUSSION);
        for (const m of this.members) m.speaking = m === this.speaker;
      }
    }
    if (this.time >= this.duration) {
      // wrap up: one last line, then everybody goes their way
      this.phase = 'bye';
      this.byeTime = BYE_TIME;
      this.speaker = pick(this.members);
      this.text = pick(BUBBLES_BYE);
      for (const m of this.members) m.speaking = m === this.speaker;
    }
    return true;
  }

  end(): void {
    for (const m of this.members) {
      m.talk = null;
      m.speaking = false;
      m.socialCooldown = 20 + Math.random() * 25;
      m.timer = 0.3 + Math.random();
    }
  }
}

/** Detects meetings and turns some of them into chats and discussions. */
export class Social {
  active: Conversation[] = [];
  private checkTimer = 3; // grace period after spawn
  
  private centroid(group: readonly Person[]): Vec2 {
    return { x: group.reduce((t, m) => t + m.pos.x, 0) / group.length, z: group.reduce((t, m) => t + m.pos.z, 0) / group.length };
  }

  /** Everybody walks off to a quiet spot elsewhere and sits out of conversations for a while. */
  private clearOut(group: readonly Person[], nav: NavGrid, traffic: Traffic): void {
    for (const m of group) {
      m.socialCooldown = 6 + Math.random() * 6;
      m.walkTo(nav, traffic.wanderSpot(m, 10, CLEAR_DISTANCE));
    }
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
    const c = new Conversation(group, center, nav);
    this.active.push(c);
    return c;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid, traffic?: Traffic): void {
    this.active = this.active.filter((c) => {
      if (c.update(dt)) return true;
      c.end();
      return false;
    });

    this.checkTimer -= dt;
    if (this.checkTimer > 0) return;
    this.checkTimer = CHECK_INTERVAL;

    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.meetJob && !p.task && !p.printJob && !p.foosJob && !p.vapeJob && !p.phoneJob && p.socialCooldown <= 0);

    // others may join a running conversation
    for (const c of this.active) {
      if (c.members.length >= MAX_GROUP) continue;
      for (const p of free) {
        if (p.talk) continue;
        if (Math.hypot(p.pos.x - c.center.x, p.pos.z - c.center.z) < LINK_DISTANCE + 0.8 && Math.random() < JOIN_CHANCE) {
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
      if (Math.random() >= START_CHANCE[Math.min(group.length, MAX_GROUP)]) continue;
      const cx = group.reduce((s, m) => s + m.pos.x, 0) / group.length;
      const cz = group.reduce((s, m) => s + m.pos.z, 0) / group.length;
      let center = { x: Math.min(Math.max(cx, 2), nav.cols * nav.cell - 2), z: Math.min(Math.max(cz, 2), nav.rows * nav.cell - 2) };
      // gather where it is quiet, not in the middle of a crowd
      if (traffic) center = traffic.openSpotNear(center, 1.5, group);
      this.active.push(new Conversation(group, center, nav));
    }
  }
}
