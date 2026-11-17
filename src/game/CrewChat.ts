import { TOPICS, type Phase, type Topic } from '../data/chatBlocks';
import type { Person } from './Person';
import { stream } from './rng';
import type { Sim } from './Sim';
import { first } from './simEvents';
import { pickFrom, speak } from './voice';

/** One message in the crew chat. */
export interface ChatMessage {
  /** running number, unique per game */
  n: number;
  /** who wrote it (person id) */
  by: string;
  text: string;
  topic: Topic;
  /** game clock when it was posted ("09:41") and the weekday (0 = Monday): the panel's time and day divider */
  time: string;
  weekday: number;
  /** simulation seconds when it was posted */
  at: number;
}

/** seconds of game time between two idle lines */
const IDLE = { min: 20, max: 60 };
/** seconds a message stays in the writer's speech bubble */
export const CHAT_BUBBLE = 4;
/** messages kept (the panel shows the latest) */
const KEEP = 200;
/** seconds until somebody answers an ask */
const REPLY = { min: 2, max: 5 };
/** at most one hello / goodbye every this many seconds (mornings would flood the chat otherwise) */
const GREETING_GAP = 20;

/**
 * The crew chat (#195): people write German messages in their own voice (`voice.ts`) when something happens in the
 * office (coffee break, meeting, server rack, rain, a remote visit, arrivals and goodbyes, lunch, ...) and now and then
 * an idle line. Watches the simulation instead of being called from it, so the places stay as they are. Rolls its dice
 * on a side stream of the seed: the simulation plays out as if the chat did not exist.
 *
 * Nobody writes while they are away or in the home office, unless the event is about them (arriving, leaving).
 */
export class CrewChat {
  readonly messages: ChatMessage[] = [];
  private readonly rng = stream(0xc4a7);
  private n = 0;
  private time = 0;
  private idleIn = this.between(IDLE);
  private lastGreeting = -Infinity;
  private pending: Array<{ at: number; p: Person; topic: Topic; phase: Phase; who?: string }> = [];
  private listeners: Array<(m: ChatMessage) => void> = [];
  /** what the watched places held at the last step (null: not looked yet) */
  private seen: ReturnType<CrewChat['places']> | null = null;
  /** what each person was and did at the last step, updated in place */
  private was = new Map<Person, { presence: Person['presence']; kind: Person['awayKind']; job: Job | undefined }>();

  constructor(private sim: Sim) {
    for (const topic of TOPICS) {
      sim.events.register({
        id: `chat-${topic}`,
        group: 'Chat',
        label: `Chat: ${topic}`,
        run: () => {
          const p = this.pickFrom(this.writers());
          return p ? `${first(p)}: ${this.post(p, topic, topic === 'random' || topic === 'complaint' ? 'during' : 'ask').text}` : null;
        },
      });
    }
  }

  /** Called with every new message (the panel). */
  onMessage(fn: (m: ChatMessage) => void): void {
    this.listeners.push(fn);
  }

  /** `p` writes a line about `topic`. */
  post(p: Person, topic: Topic, phase?: Phase, who?: string): ChatMessage {
    const tod = this.sim.tod;
    const m: ChatMessage = { n: ++this.n, by: p.id, text: speak(p, topic, this.rng, { phase, who }), topic, time: tod.clock, weekday: tod.weekday, at: this.time };
    this.messages.push(m);
    if (this.messages.length > KEEP) this.messages.splice(0, this.messages.length - KEEP);
    for (const l of this.listeners) l(m);
    return m;
  }

  /** People who wrote in the last `CHAT_BUBBLE` seconds and are in the office: their latest line (the speech bubble). */
  get speaking(): Array<{ who: Person; text: string }> {
    const last = this.messages.at(-1);
    if (!last || this.time - last.at >= CHAT_BUBBLE) return [];
    const out = new Map<Person, string>();
    for (let i = this.messages.length - 1; i >= 0 && this.time - this.messages[i].at < CHAT_BUBBLE; i--) {
      const p = this.sim.people.find((o) => o.id === this.messages[i].by);
      if (p && !p.away && p.presence !== 'out' && !out.has(p)) out.set(p, this.messages[i].text);
    }
    return [...out].map(([who, text]) => ({ who, text }));
  }

  update(dt: number): void {
    this.time += dt;
    const sim = this.sim;
    const seen = this.seen;
    const now = this.places();
    this.seen = now;
    if (!seen) {
      // the first look only takes stock: whatever runs at the start was not just started
      for (const p of sim.people) this.was.set(p, { presence: p.presence, kind: p.awayKind, job: this.jobOf(p) });
      return;
    }

    // coffee break / meeting / pod: one asks, another answers, one sums up when it is over
    this.group(seen.coffee, now.coffee, 'coffee');
    const kart = (now.meeting ?? seen.meeting)?.screen === 'kart';
    this.group(seen.meeting, now.meeting, kart ? 'play' : 'meeting');
    this.group(seen.pod, now.pod, 'play');

    // server rack: a colleague asks, the dev curses while fixing it and reports when it runs again
    const rack = sim.serverRack.current;
    if (rack && now.rack !== seen.rack) {
      const asker = this.pickFrom(this.writers().filter((p) => p !== rack.person));
      if (asker && this.rng() < 0.6) this.post(asker, 'server', 'ask');
    }
    if (rack && now.rackPhase !== seen.rackPhase) {
      if (now.rackPhase === 'fix') this.post(rack.person, 'server', 'during');
      if (now.rackPhase === 'relief') this.post(rack.person, 'server', 'after');
    }

    // a remote visit: the visitor says hello, the one who calls out answers
    const call = sim.welcome.call;
    if (call && now.call !== seen.call) {
      const visitor = sim.presence.remoteWorker;
      if (visitor?.inOffice) this.post(visitor, 'greeting', 'ask');
      this.later(call.who, 'greeting', 'during', visitor ? first(visitor) : undefined);
    }

    // lunch break and rain: somebody in the office says something
    if (now.lunch !== seen.lunch) {
      const p = this.pickFrom(this.writers());
      if (p) this.post(p, 'lunch', now.lunch ? 'ask' : 'after');
      const other = now.lunch ? this.pickFrom(this.writers().filter((o) => o !== p)) : undefined;
      if (other) this.later(other, 'lunch', 'reply');
    }
    if (now.rain !== seen.rain) {
      const p = this.pickFrom(this.writers());
      if (p) this.post(p, 'rain', now.rain ? 'ask' : 'after');
    }

    // arrivals and goodbyes (not from the home office: that is a day at home, the chat hears of them when they come in)
    for (const p of sim.people) {
      const was = this.was.get(p)!;
      const job = this.jobOf(p);
      const arrived = p.presence === 'in' && was.presence !== 'in' && was.kind === 'off';
      const leaves = p.presence === 'leaving' && was.presence === 'in' && p.awayKind === 'off';
      if ((arrived || leaves) && this.time - this.lastGreeting > GREETING_GAP && this.rng() < 0.5) {
        this.lastGreeting = this.time;
        this.post(p, 'greeting', arrived ? 'ask' : 'after');
      }
      // what somebody just started: printer, kicker, the WC, a pet
      if (job && job !== was.job && this.rng() < JOB_CHANCE[job]) this.post(p, JOB_TOPIC[job], job === 'foosball' ? 'ask' : 'during');
      was.presence = p.presence;
      was.kind = p.awayKind;
      was.job = job;
    }

    if (this.pending.length) {
      const due = this.pending.filter((x) => x.at <= this.time);
      this.pending = this.pending.filter((x) => x.at > this.time);
      for (const r of due) if (this.canWrite(r.p)) this.post(r.p, r.topic, r.phase, r.who);
    }

    if ((this.idleIn -= dt) <= 0) {
      this.idleIn = this.between(IDLE);
      // preferably somebody with nothing else on, else whoever is in (typing under the table)
      const p = this.pickFrom(this.writers().filter((o) => !o.talk && !o.inMeeting)) ?? this.pickFrom(this.writers());
      if (p) this.post(p, this.rng() < 0.25 ? 'complaint' : 'random', 'during');
    }
  }

  /** A group place: a new group asks (first member) and gets an answer (second); the end gets a reaction now and then. */
  private group(before: Group | null, after: Group | null, topic: Topic): void {
    if (after && after !== before && after.members.length) {
      this.post(after.members[0], topic, 'ask');
      if (after.members[1]) this.later(after.members[1], topic, 'reply');
    }
    if (before && before !== after && this.rng() < 0.5) {
      // one of the group if one is still around, else whoever is in
      const p = this.pickFrom(before.members.filter((m) => this.canWrite(m))) ?? this.pickFrom(this.writers());
      if (p) this.post(p, topic, 'after');
    }
  }

  private later(p: Person, topic: Topic, phase: Phase, who?: string): void {
    this.pending.push({ at: this.time + this.between(REPLY), p, topic, phase, who });
  }

  private jobOf(p: Person): Job | undefined {
    if (p.printJob) return 'printer';
    if (p.foosJob) return 'foosball';
    if (p.petting) return 'pet';
    return this.sim.toilets.cabins.some((c) => c.session?.person === p) ? 'toilet' : undefined;
  }

  private places() {
    const s = this.sim;
    return {
      coffee: s.kitchen.current,
      meeting: s.meetingRoom.current,
      pod: s.pod.current,
      rack: s.serverRack.current,
      rackPhase: s.serverRack.current?.phase,
      call: s.welcome.call,
      lunch: s.presence.lunch,
      rain: s.weather.raining,
    };
  }

  /** In the office, not taken out of the sim by a dev. */
  private canWrite(p: Person): boolean {
    return p.inOffice && !p.away && !this.sim.presence.isRemoved(p);
  }

  private writers(): Person[] {
    return this.sim.people.filter((p) => this.canWrite(p));
  }

  private pickFrom<T>(list: readonly T[]): T | undefined {
    return list.length ? pickFrom(list, this.rng) : undefined;
  }

  private between({ min, max }: { min: number; max: number }): number {
    return min + this.rng() * (max - min);
  }
}

/** a coffee break, a meeting, the pod: who takes part */
type Group = { readonly members: readonly Person[] };
type Job = 'printer' | 'foosball' | 'toilet' | 'pet';
const JOB_TOPIC: Record<Job, Topic> = { printer: 'printer', foosball: 'play', toilet: 'toilet', pet: 'pet' };
/** how often somebody says something when they start it */
const JOB_CHANCE: Record<Job, number> = { printer: 0.3, foosball: 0.4, toilet: 0.15, pet: 0.3 };
