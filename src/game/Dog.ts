import type * as THREE from 'three';
import type { DogRig } from '../render/dogBuilder';
import { DOOR } from './Door';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import { Walker } from './Walker';
import { inLane, lieSpot } from './petSpot';
import { random } from './rng';

const FOLLOW_DISTANCE = 1.4; // dog starts running when the owner is further away than this
const HEEL_DISTANCE = 0.9; // where the dog tries to end up
const SLEEP_AFTER = 12; // seconds lying beside a seated owner before dozing off
const LIE_REACH = 1.6; // a lying spot is at most this far from the seated owner ...
const LIE_REACH_FAR = 3.2; // ... unless the seat is boxed in by furniture
const CLEARED_FOR = 40; // seconds a spot the pet had to clear for somebody stays off limits
const YIELD_NEAR = 2.4; // metres within which a held-up walker makes the pet get out of its way

export interface PetOptions {
  /** unique walker id (defaults to `dog-<owner>`) */
  id?: string;
  /** shown in the tooltip, e.g. "Office dog" / "Office cat" */
  label?: string;
  /** profile image (data URL) shown in the tooltip */
  portrait?: string | null;
  speed?: number;
  radius?: number;
  /** -1 left / 1 right of the owner (default random) */
  side?: 1 | -1;
}

/** Pets (dogs, cats) always stay with their owner: run to a spot beside them, wait, repeat. */
export class Dog extends Walker {
  speed = 2.2;
  radius = 0.3;
  readonly label: string;
  readonly portrait: string | null;
  root: THREE.Object3D;
  headHeight: number;
  id: string;
  private side: number;
  private doorWait = 0;
  private outWait = 0;
  private headingOut = false;
  private retry = 0;
  /** 0 standing .. 1 lying down (owner is seated and the pet is settled) */
  lie = 0;
  /** 0 awake .. 1 asleep (after lying a while beside the seated owner) */
  sleep = 0;
  private lying = 0;
  /** where the pet lies down while the owner sits (out of passages), null = not picked yet */
  private bed: Vec2 | null = null;
  /** spots the pet had to clear for somebody: it does not lie there again for a while */
  private cleared: { at: Vec2; t: number }[] = [];
  /** somebody is petting this pet: it trots over, stands still and wags */
  petted: { by: Person; t: number } | null = null;
  /** 0..1 eased "being petted" amount (wagging, hopping) */
  happy = 0;
  /** seconds of barking / meowing left (hops, shows a bubble) */
  barkT = 0;
  /** no new petting before this many seconds have passed */
  petCooldown = 0;

  get isCat(): boolean {
    return this.label.includes('katze');
  }

  /** Walk up to the person and enjoy the attention for `seconds`. */
  petBy(person: Person, seconds: number, nav: NavGrid): void {
    this.petted = { by: person, t: seconds };
    this.petCooldown = seconds + 25 + random() * 30;
    const a = Math.atan2(this.pos.x - person.pos.x, this.pos.z - person.pos.z);
    const spot = nav.nearestWalkable({ x: person.pos.x + Math.sin(a) * 0.65, z: person.pos.z + Math.cos(a) * 0.65 }, 3);
    if (spot) this.goTo(nav, spot);
  }

  /** Puts the pet down at `p` (dev event): it picks its lying spot afresh from there. */
  placeAt(p: Vec2): void {
    this.pos = { ...p };
    this.prev = { ...p };
    this.path = [];
    this.state = 'idle';
    this.bed = null;
    this.lie = 0;
    this.timer = 1;
  }

  /** Woof / meow at the door. */
  bark(): void {
    this.barkT = 1.7;
  }

  constructor(
    readonly name: string,
    readonly rig: DogRig,
    readonly owner: Person,
    start: { x: number; z: number },
    opts: PetOptions = {},
  ) {
    super(start);
    this.label = opts.label ?? 'Bürohund';
    this.portrait = opts.portrait ?? null;
    this.speed = opts.speed ?? this.speed;
    this.radius = opts.radius ?? this.radius;
    this.side = opts.side ?? (random() < 0.5 ? 1 : -1);
    this.root = rig.root;
    this.headHeight = rig.headHeight;
    this.id = opts.id ?? `dog-${owner.id}`;
    this.root.userData.walker = this;
    this.timer = 0;
    this.companion = owner;
    owner.pets.push(this);
  }

  /** Lying beside the seated owner: walkers' routes go around it. */
  override get obstacle(): boolean {
    return !this.away && this.lie > 0.5;
  }

  override get fixed(): boolean {
    // waiting on the porch is off the nav grid: pinned there, or the wall push snaps it back inside (#72)
    return this.away || !!this.script || (this.onPorch && this.owner.presence !== 'in');
  }

  /** On the porch in front of the door (arrived there, waiting for the owner to vanish with them). */
  get onPorch(): boolean {
    return !this.script && this.pos.z > DOOR.z;
  }

  /** Disappear (together with the owner, or when the owner is gone already). Does nothing when already away. */
  sendAway(): void {
    this.outWait = 0;
    this.headingOut = false;
    if (this.away) return;
    this.setAway(true);
    this.doorWait = 0.6;
  }

  /** Appear on the porch at the same moment as the owner and walk in with them. */
  arriveWith(owner: Person): void {
    if (!this.away) return;
    this.setAway(false);
    this.pos = { ...owner.lane.out, x: owner.lane.out.x + 0.2 };
    this.prev = { ...this.pos };
    this.yaw = this.prevYaw = Math.PI;
    this.startScript(owner.lane.in, this.speed * 0.9);
  }

  /** Pets leave through the door with their owner and come back after them. */
  protected override control(dt: number, nav: NavGrid): boolean {
    const o = this.owner;
    if (o.presence === 'out' && !this.away) {
      // owner is gone: keep running to the door and leave too (give up after a while)
      this.outWait += dt;
      if (this.outWait > 8 && !this.script) this.sendAway();
    } else if (o.presence === 'in') {
      this.outWait = 0;
      this.headingOut = false;
    }
    if (this.away) {
      // normally the pet appears together with the owner (`arriveWith`); this is only the fallback when the owner is in again
      if (o.presence !== 'in') return true;
      this.doorWait -= dt;
      if (this.doorWait > 0) return true;
      this.arriveWith(o);
      return true;
    }
    if (this.script) {
      if (this.fx < 1) {
        this.moving += (0 - this.moving) * Math.min(1, dt * 8); // still materialising: wait for the show
        return true;
      }
      this.runScript(dt);
      return true;
    }
    if (this.onPorch && o.presence !== 'in') {
      // sits on the porch until the owner is out; they make us vanish together
      this.moving += (0 - this.moving) * Math.min(1, dt * 8);
      return true;
    }
    const pet = this.petted;
    if (pet) {
      if (o.presence !== 'in' || pet.by.presence !== 'in' || !pet.by.petting || this.held) {
        this.petted = null;
      } else {
        pet.t -= dt;
        if (pet.t <= 0) this.petted = null;
        else if (this.state === 'walk') return false;
        else {
          this.moving += (0 - this.moving) * Math.min(1, dt * 8);
          this.turnTo(Math.atan2(pet.by.pos.x - this.pos.x, pet.by.pos.z - this.pos.z), dt);
          return true;
        }
      }
    }
    if (o.presence === 'leaving' || o.presence === 'out') {
      if (!this.headingOut) {
        // drop whatever we were doing and run for the door
        this.headingOut = true;
        this.goTo(nav, this.owner.lane.in);
        return false;
      }
      if (this.state === 'walk') return false;
      if (Math.hypot(this.owner.lane.in.x - this.pos.x, this.owner.lane.in.z - this.pos.z) < 0.9) {
        this.startScript(this.owner.lane.out, this.speed);
        return true;
      }
      this.retry -= dt;
      if (this.retry <= 0) {
        this.retry = 0.4;
        this.goTo(nav, this.owner.lane.in);
      }
      return this.state === 'idle';
    }
    // owner changed their mind while we were already on the porch
    if (this.pos.z > DOOR.z) {
      this.startScript(this.owner.lane.in, this.speed);
      return true;
    }
    return false;
  }

  override update(dt: number, nav: NavGrid, others: readonly Walker[] = []): void {
    // while walking, re-target if the owner moved away from the current goal
    if (this.state === 'walk' && this.owner.presence === 'in' && !this.petted) {
      const goal = this.path[this.path.length - 1];
      const toBed = !!goal && !!this.bed && Math.hypot(this.bed.x - goal.x, this.bed.z - goal.z) < 0.01;
      if (!goal || (!toBed && Math.hypot(this.owner.pos.x - goal.x, this.owner.pos.z - goal.z) > FOLLOW_DISTANCE * 1.5)) {
        this.decide(nav);
      }
    }
    if (this.cleared.length) this.cleared = this.cleared.filter((c) => (c.t -= dt) > 0);
    if (this.owner.sit <= 0.5 || this.owner.presence !== 'in') this.bed = null;
    this.giveWay(nav, others);
    super.update(dt, nav, others);
    this.happy += ((this.petted && this.state !== 'walk' ? 1 : 0) - this.happy) * Math.min(1, dt * 5);
    if (this.barkT > 0) this.barkT -= dt;
    if (this.petCooldown > 0) this.petCooldown -= dt;
    const atDesk = this.owner.sit > 0.5 && this.owner.presence === 'in';
    const onPorch = this.onPorch && this.owner.presence !== 'in'; // sits down on the porch until the owner is out and vanishes with them
    const settle = (atDesk || onPorch) && !this.away && this.state === 'idle' && this.moving < 0.1;
    this.lie += ((settle ? 1 : 0) - this.lie) * Math.min(1, dt * 3);
    this.lying = settle ? this.lying + dt : 0;
    const asleep = settle && this.lying > SLEEP_AFTER;
    this.sleep += ((asleep ? 1 : 0) - this.sleep) * Math.min(1, dt * (asleep ? 1 : 6));
  }

  /**
   * Somebody is held up and we stand (or lie) in their way: get up and move to a free spot off their route and out of
   * passages (we do not lie there again for a while). Without such a spot the usual shuffling aside (`stepAside`) does it.
   */
  private giveWay(nav: NavGrid, others: readonly Walker[]): void {
    if (this.state !== 'idle' || this.away || this.script || this.petted || this.held || this.owner.presence !== 'in') return;
    const w = others.find(
      (o) =>
        o !== this &&
        !o.away &&
        !this.ignores(o) &&
        o.stuck &&
        Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z) < YIELD_NEAR &&
        inLane(this.pos, this.radius, o.pos, o.path, o.radius + 0.1),
    );
    if (!w) return;
    if (!this.cleared.some((c) => Math.hypot(c.at.x - this.pos.x, c.at.z - this.pos.z) < 0.3)) this.cleared.push({ at: { ...this.pos }, t: CLEARED_FOR });
    const avoid = [...this.cleared.map((c) => c.at), w.pos, ...w.path];
    const spot = lieSpot(nav, this.passageAt(), this.owner.pos, this.pos, LIE_REACH, avoid);
    if (!spot) return;
    if (this.bed) this.bed = spot;
    this.goTo(nav, spot);
  }

  private passageAt(): ((p: Vec2) => number) | null {
    const passages = this.traffic?.passages;
    return passages ? (p) => passages.at(p) : null;
  }

  /** The spot to lie down at beside the seated owner: never in a passage, nor where we had to make way before. */
  private pickBed(nav: NavGrid): Vec2 | null {
    const o = this.owner;
    const a = o.yaw + (this.side * Math.PI) / 2;
    const ideal = { x: o.pos.x + Math.sin(a) * HEEL_DISTANCE, z: o.pos.z + Math.cos(a) * HEEL_DISTANCE };
    const avoid = this.cleared.map((c) => c.at);
    const near = lieSpot(nav, this.passageAt(), o.pos, ideal, LIE_REACH, avoid);
    if (near) return near;
    // boxed in (no free floor close to the seat): the nearest free floor a bit further off, still out of the passages
    const free = nav.nearestWalkable(ideal, 8);
    return free && lieSpot(nav, this.passageAt(), o.pos, free, LIE_REACH_FAR, avoid);
  }

  protected decide(nav: NavGrid): void {
    const o = this.owner;
    const dx = o.pos.x - this.pos.x;
    const dz = o.pos.z - this.pos.z;
    if (o.sit > 0.5 && o.presence === 'in') {
      this.bed ??= this.pickBed(nav);
      const bed = this.bed;
      if (bed && Math.hypot(bed.x - this.pos.x, bed.z - this.pos.z) > 0.3) {
        this.goTo(nav, bed);
        if (this.state !== 'walk') {
          // cannot get there (yet: e.g. still standing in the owner's seat): pick again in a moment
          this.cleared.push({ at: bed, t: 2 });
          this.bed = null;
        }
        this.timer = 0.15;
        return;
      }
      if (bed) {
        this.turnTo(Math.atan2(dx, dz), 0.3);
        this.timer = 0.2;
        return;
      }
      // no free spot off the passages: fall back to the plain heel spot
    }
    if (Math.hypot(dx, dz) > FOLLOW_DISTANCE) {
      // aim for a point beside/behind the owner, relative to their facing
      const a = o.yaw + Math.PI + this.side * 0.9;
      // heel spot may be inside a desk: settle for the closest free cell
      const spot = nav.nearestWalkable({ x: o.pos.x + Math.sin(a) * HEEL_DISTANCE, z: o.pos.z + Math.cos(a) * HEEL_DISTANCE });
      if (spot) this.goTo(nav, spot);
      this.timer = 0.15;
    } else {
      this.turnTo(Math.atan2(dx, dz), 0.3);
      if (random() < 0.05) this.side *= -1;
      this.timer = 0.2;
    }
  }

  protected override idleTime(): number {
    return 0.1;
  }
}
