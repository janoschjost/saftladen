import type { OfficeModel } from '../render/officeModel';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';

/** Where one person stands in the kitchen coffee circle. */
export interface CoffeeSpot {
  stand: Vec2;
  /** facing the middle of the circle */
  yaw: number;
  occupant: Person | null;
}

const FIRST = { min: 30, max: 60 }; // seconds after game start
const PAUSE = { min: 90, max: 180 }; // seconds between two coffee breaks
const STAY = { min: 25, max: 45 }; // seconds the group chats once everybody holds a cup
const GROUP = { min: 2, max: 4 };
const RING = 0.75; // metres from the circle centre to each person
const GATHER_TIMEOUT = 60;
const BUBBLES = ['…', '…', '!', '?'];

const between = ({ min, max }: { min: number; max: number }) => min + Math.random() * (max - min);

/** A few people drinking a coffee together in the kitchen: walk over, stand in a circle with a cup, chat, leave together. */
export class CoffeeBreak implements Talk {
  readonly kind: ConversationKind = 'chat';
  phase: 'gather' | 'chat' | 'leaving' = 'gather';
  speaker: Person;
  text = '…';
  private time = 0;
  private speakerTimer = 0;
  private readonly stay = between(STAY);

  constructor(
    public members: Person[],
    readonly center: Vec2,
  ) {
    this.speaker = members[0];
  }

  /** false once everybody has left */
  update(dt: number): boolean {
    this.members = this.members.filter((m) => m.talk === this && m.inCoffee);
    if (this.members.length === 0) return false;
    this.time += dt;

    if (this.phase === 'gather') {
      if (this.members.length < 2) return this.end();
      if (this.members.every((m) => m.coffeeReady)) {
        this.phase = 'chat';
        this.time = 0;
      } else if (this.time > GATHER_TIMEOUT) {
        for (const m of this.members) if (!m.coffeeReady) m.cancelCoffee();
      }
      return true;
    }

    if (this.phase === 'chat') {
      this.speakerTimer -= dt;
      if (this.speakerTimer <= 0) {
        const others = this.members.filter((m) => m !== this.speaker);
        this.speaker = others[Math.floor(Math.random() * others.length)] ?? this.speaker;
        this.speakerTimer = 2 + Math.random() * 3;
        this.text = BUBBLES[Math.floor(Math.random() * BUBBLES.length)];
        for (const m of this.members) m.speaking = m === this.speaker;
      }
      if (this.time >= this.stay || this.members.length < 2) this.end();
    }
    return true;
  }

  /** Everybody lowers the cup and goes. */
  end(): boolean {
    this.phase = 'leaving';
    for (const m of this.members) {
      m.speaking = false;
      m.dismissCoffee();
    }
    return true;
  }
}

/** The kitchen: scheduler for coffee breaks. */
export class Kitchen {
  current: CoffeeBreak | null = null;
  private timer = between(FIRST);

  constructor(private model: OfficeModel['kitchen']) {}

  /** Calls `people` to the kitchen (they must be free). Returns the break, or null when one is already on or there is no room. */
  start(people: Person[], nav: NavGrid): CoffeeBreak | null {
    if (this.current || people.length < 2) return null;
    const c = this.model.center;
    const group = people.slice(0, GROUP.max);
    // spread the circle around the centre starting where the first person comes from: walks cross less
    const sorted = [...group].sort((a, b) => Math.atan2(a.pos.z - c.z, a.pos.x - c.x) - Math.atan2(b.pos.z - c.z, b.pos.x - c.x));
    const a0 = Math.atan2(sorted[0].pos.z - c.z, sorted[0].pos.x - c.x);
    const placed: Array<{ p: Person; spot: CoffeeSpot }> = [];
    sorted.forEach((p, i) => {
      const a = a0 + (i * Math.PI * 2) / sorted.length;
      const stand = nav.nearestWalkable({ x: c.x + Math.cos(a) * RING, z: c.z + Math.sin(a) * RING }, 3);
      if (stand) placed.push({ p, spot: { stand: { ...stand }, yaw: Math.atan2(c.x - stand.x, c.z - stand.z), occupant: null } });
    });
    if (placed.length < 2) return null;
    const brk = new CoffeeBreak(
      placed.map((x) => x.p),
      c,
    );
    for (const { p, spot } of placed) p.callToCoffee(nav, spot, brk);
    this.current = brk;
    return brk;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    if (this.current) {
      if (!this.current.update(dt)) {
        this.current = null;
        this.timer = between(PAUSE);
      }
      return;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 10;
    const free = people.filter((p) => p.inOffice && !p.held && !p.controlled && !p.talk && !p.meetJob && !p.printJob && !p.foosJob && !p.vapeJob && !p.phoneJob && !p.playerChat);
    const n = Math.min(free.length, Math.round(GROUP.min + Math.random() * (GROUP.max - GROUP.min)));
    if (n < GROUP.min) return;
    if (this.start(free.sort(() => Math.random() - 0.5).slice(0, n), nav)) this.timer = 0;
  }
}
