import type * as THREE from 'three';
import type { DogRig } from '../render/dogBuilder';
import { DOOR } from './Door';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import { Walker } from './Walker';
import { random } from './rng';

const FOLLOW_DISTANCE = 1.4; // dog starts running when the owner is further away than this
const HEEL_DISTANCE = 0.9; // where the dog tries to end up
const SLEEP_AFTER = 12; // seconds lying beside a seated owner before dozing off

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
  }

  override get fixed(): boolean {
    return this.away || !!this.script;
  }

  /** Disappear (owner is out); comes back through the door after the owner. */
  sendAway(): void {
    this.setAway(true);
    this.doorWait = 0.6;
    this.outWait = 0;
    this.headingOut = false;
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
    if (o.presence === 'out' && this.away) return true;
    if (this.away) {
      this.doorWait -= dt;
      if (this.doorWait > 0) return true;
      this.setAway(false);
      this.pos = { ...this.owner.lane.out, x: this.owner.lane.out.x + 0.2 };
      this.prev = { ...this.pos };
      this.yaw = this.prevYaw = Math.PI;
      this.startScript(this.owner.lane.in, this.speed * 0.9);
      return true;
    }
    if (this.script) {
      if (!this.runScript(dt) && o.presence !== 'in') this.sendAway(); // reached the porch
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
      if (!goal || Math.hypot(this.owner.pos.x - goal.x, this.owner.pos.z - goal.z) > FOLLOW_DISTANCE * 1.5) {
        this.decide(nav);
      }
    }
    super.update(dt, nav, others);
    this.happy += ((this.petted && this.state !== 'walk' ? 1 : 0) - this.happy) * Math.min(1, dt * 5);
    if (this.barkT > 0) this.barkT -= dt;
    if (this.petCooldown > 0) this.petCooldown -= dt;
    const settle = this.owner.sit > 0.5 && this.owner.presence === 'in' && !this.away && this.state === 'idle' && this.moving < 0.1;
    this.lie += ((settle ? 1 : 0) - this.lie) * Math.min(1, dt * 3);
    this.lying = settle ? this.lying + dt : 0;
    const asleep = settle && this.lying > SLEEP_AFTER;
    this.sleep += ((asleep ? 1 : 0) - this.sleep) * Math.min(1, dt * (asleep ? 1 : 6));
  }

  protected decide(nav: NavGrid): void {
    const o = this.owner;
    const dx = o.pos.x - this.pos.x;
    const dz = o.pos.z - this.pos.z;
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
