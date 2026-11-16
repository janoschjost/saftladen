import * as THREE from 'three';
import type { OfficeModel } from '../render/officeModel';
import { SparkFx } from '../render/sparkFx';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import { fxRandom as random } from './rng';
import type { ConversationKind, Talk } from './Social';

// own stream (`fxRandom`): a breakdown never shifts the simulation's numbers, so a seed replays everything else as before
const GAP = { min: 120, max: 300 }; // seconds between two breakdowns by themselves
const NOTICE = 2.5; // seconds of sparks before somebody comes
const RETRY = 10; // seconds before looking for a dev again when none was free
const LOST = 3; // seconds before the next dev is called when the fixer was taken away
const FIX = { min: 8, max: 14 }; // seconds of fixing
const HIT_GAP = { min: 1, max: 2.2 }; // seconds between two bangs on the case
const SWEAR_GAP = 1.5; // seconds between two curses
const RELIEF = 1.6; // seconds they stand there after it works again
const UNATTENDED = 120; // seconds it sparks with nobody to fix it before it is given up and works again (a night without devs)
const GATHER_TIMEOUT = 45; // seconds to walk to the rack
const SPARK_GAP = { min: 0.12, max: 0.6 };
const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

export const CURSES = ['🤬', '#@%&!', 'Verdammt nochmal!', 'Du Mistding!', 'Scheiss-Kiste!', '%&$#@!', 'Funktionier endlich!', 'Ich hasse dich!'];

export type RepairPhase = 'walk' | 'fix' | 'relief';

/** One repair: a dev walks to the rack, bangs on it and fiddles with it while cursing, until it works again. */
export class RackRepair implements Talk {
  readonly kind: ConversationKind = 'chat';
  phase: RepairPhase = 'walk';
  members: Person[];
  /** the front of the rack: they face it */
  readonly center: Vec2;
  /** what the speech bubble says now ('' = nothing) */
  text = '';
  /** bangs on the case so far */
  bangs = 0;
  private time = 0;
  private hitIn = 0.8;
  private swearIn = 0;
  private curse = Math.floor(random() * CURSES.length);
  private fixFor = between(FIX);
  private retryIn = 0;

  constructor(
    readonly person: Person,
    private readonly rack: ServerRack,
    private readonly stand: Vec2,
  ) {
    this.members = [person];
    this.center = rack.front;
  }

  /** false once the repair is over (done, or they were pulled away) */
  update(dt: number, nav: NavGrid): boolean {
    const p = this.person;
    if (p.talk !== this || p.held || p.controlled || p.presence !== 'in') {
      this.abort(); // dragged, steered, sent away or taken over
      return false;
    }
    this.time += dt;
    if (this.phase === 'walk') {
      const there = p.state === 'idle' && Math.hypot(this.stand.x - p.pos.x, this.stand.z - p.pos.z) < 0.7;
      if (there) {
        this.phase = 'fix';
        this.time = 0;
        p.repairOn = true;
      } else if (this.time > GATHER_TIMEOUT) {
        this.abort();
        return false;
      } else if (p.state === 'idle' && (this.retryIn -= dt) <= 0) {
        this.retryIn = 1;
        p.queueAt(nav, this.stand, this); // stopped short: try again
      }
    } else if (this.phase === 'fix') {
      if ((this.hitIn -= dt) <= 0) {
        this.hitIn = between(HIT_GAP);
        this.bangs++;
        p.repairHit = 1;
        this.rack.bang();
      }
      if ((this.swearIn -= dt) <= 0) {
        this.swearIn = SWEAR_GAP;
        this.text = CURSES[this.curse++ % CURSES.length];
      }
      if (this.time >= this.fixFor) {
        this.rack.repaired();
        p.repairOn = false;
        this.phase = 'relief';
        this.time = 0;
        this.text = 'Na also!';
      }
    } else if (this.time >= RELIEF) {
      this.finish();
      p.talk = null;
      p.timer = 0.3 + random();
      return false;
    }
    return true;
  }

  private finish(): void {
    this.person.repairOn = false;
    this.text = '';
  }

  /** Gives up where they are; the rack stays as it is (broken, then another dev is called). */
  abort(): void {
    const p = this.person;
    this.finish();
    if (p.talk !== this) return;
    p.talk = null;
    p.timer = 0.3 + random();
  }
}

/**
 * The server rack in the archive: now and then it breaks, sparks shoot out of it and its LEDs flicker red, until one of
 * the devs comes, bangs on it and swears at it, and it works again. Never starts twice at once, and only breaks while
 * a dev is there to fix it.
 */
export class ServerRack {
  state: 'ok' | 'broken' = 'ok';
  current: RackRepair | null = null;
  readonly sparks: SparkFx;
  private stand: Vec2;
  private timer = between(GAP) / 2;
  private notice = 0;
  private unattended = 0;
  private spark = 0;
  private clock = 0;
  private readonly at = new THREE.Vector3();

  constructor(
    private model: OfficeModel['serverRack'],
    scene: THREE.Scene,
    nav: NavGrid,
    /** pulls somebody out of everything they do (desk, conversation, phone box, queue) */
    private pull: (p: Person) => void,
    /** somebody a WC, the phone box or a meeting holds: not to be had for something on the spot */
    private tiedUp: (p: Person) => boolean,
  ) {
    this.sparks = new SparkFx(scene);
    this.stand = this.standFor(nav);
  }

  /** Where somebody stands to fix it, on a free cell. */
  private standFor(nav: NavGrid): Vec2 {
    const s = this.model.stand;
    return nav.nearestWalkable(s, 3) ?? { x: s.x, z: s.z };
  }

  /** The room editor moved the furniture and the nav grid was rebuilt. */
  relayout(nav: NavGrid): void {
    this.stand = this.standFor(nav);
  }

  /** The point on the rack's front where the sparks come out (it moves with the rack in the room editor). */
  get front(): Vec2 {
    this.model.spark.getWorldPosition(this.at);
    return { x: this.at.x, z: this.at.z };
  }

  /** Works, and nobody is on their way to it. */
  get free(): boolean {
    return this.state === 'ok' && !this.current;
  }

  /** Devs who could come to fix it, in a random order: in the office, in nobody's hands, not in a meeting or a talk. */
  fixers(people: readonly Person[]): Person[] {
    return people
      .filter((p) => p.member.look.nerf && p.inOffice && !p.held && !p.controlled && !p.talk && !p.playerChat && !p.inMeeting && !this.tiedUp(p))
      .map((p) => ({ p, k: random() })) // every dev in the office is as likely as any other
      .sort((a, b) => a.k - b.k)
      .map((x) => x.p);
  }

  /** It breaks: sparks and red LEDs, until somebody fixes it. */
  breakDown(): void {
    if (this.state === 'broken') return;
    this.state = 'broken';
    this.notice = NOTICE;
    this.unattended = 0;
    this.spark = 0;
    this.sparks.burst(this.sparkAt(), this.outward(), 14);
  }

  /** Sends `person` (already dropped from desk / conversation) to fix it. Null unless it is broken and nobody is on it. */
  start(person: Person, nav: NavGrid): RackRepair | null {
    if (this.state !== 'broken' || this.current) return null;
    const repair = new RackRepair(person, this, this.stand);
    this.current = repair;
    person.queueAt(nav, this.stand, repair);
    return repair;
  }

  /** A bang on the case: a burst of sparks. */
  bang(): void {
    this.sparks.burst(this.sparkAt(), this.outward(), 12);
  }

  /** It works again. */
  repaired(): void {
    this.state = 'ok';
    this.timer = between(GAP);
  }

  private sparkAt(): THREE.Vector3 {
    return this.model.spark.getWorldPosition(this.at);
  }

  /** Horizontal unit vector from the rack out towards where people stand. */
  private outward(): Vec2 {
    const f = this.front;
    const dx = this.model.stand.x - f.x;
    const dz = this.model.stand.z - f.z;
    const d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    this.clock += dt;
    this.sparks.update(dt);
    const repair = this.current;
    if (repair && !repair.update(dt, nav)) {
      this.current = null;
      if (this.state === 'broken') this.notice = LOST; // taken away halfway: the next dev comes
    }
    this.model.leds(this.state === 'broken', this.clock);
    if (this.state === 'ok') {
      if ((this.timer -= dt) > 0) return;
      if (!this.fixers(people).length) {
        this.timer = RETRY;
        return;
      }
      this.breakDown();
      return;
    }
    if ((this.spark -= dt) <= 0) {
      this.spark = between(SPARK_GAP);
      this.sparks.burst(this.sparkAt(), this.outward(), 2 + Math.floor(random() * 4));
    }
    if (this.current || (this.notice -= dt) > 0) return;
    const [dev] = this.fixers(people);
    if (!dev) {
      this.notice = RETRY;
      this.unattended += RETRY;
      if (this.unattended >= UNATTENDED) this.repaired();
      return;
    }
    this.unattended = 0;
    this.pull(dev);
    this.start(dev, nav);
  }

  /** Fixes it at once and sends the fixer away (dev event, game reset). */
  abort(): void {
    this.current?.abort();
    this.current = null;
    if (this.state === 'broken') this.repaired();
  }
}
