import * as THREE from 'three';
import type { OfficeModel } from '../render/officeModel';
import { screenMaterial, useScreen } from '../render/screens';
import type { MeetSeat } from './Meeting';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import type { ConversationKind, Talk } from './Social';
import { random } from './rng';

const SHOTS = { min: 6, max: 10 };
const RAISE = 1; // seconds from arriving to the first shot: the camera comes up
const GAP = { min: 1.2, max: 2.6 }; // seconds between two shots
const LOWER = 1.2; // seconds after the last shot before they put the camera down
const EDIT = { min: 20, max: 40 }; // seconds at the editing desk
const GATHER_TIMEOUT = 45; // seconds to walk to the shooting spot, or to the chair
const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

/** the pictures the two monitors show while somebody edits: the editing tool and the contact sheet (`screens.ts`) */
const EDITING = [
  { kind: 'design', variant: 1 },
  { kind: 'media', variant: 1 },
] as const;

export type ShootPhase = 'walk' | 'shoot' | 'sit' | 'edit' | 'leave';

/** One visit to the studio: walk to the sweep, take the shots with flash, put the camera down, sit at the desk and edit them. */
export class PhotoSession implements Talk {
  readonly kind: ConversationKind = 'chat';
  phase: ShootPhase = 'walk';
  /** pictures taken so far */
  shots = 0;
  /** how many it takes today */
  readonly total = Math.round(between(SHOTS));
  members: Person[];
  /** the product they shoot: they face it */
  readonly center: Vec2;
  private time = 0;
  private wait = RAISE;
  private retryIn = 0;

  constructor(
    readonly person: Person,
    private readonly studio: PhotoStudio,
    private readonly stand: Vec2,
    product: Vec2,
  ) {
    this.members = [person];
    this.center = product;
  }

  /** false once the visit is over (they left the chair, or were pulled out of it) */
  update(dt: number, nav: NavGrid): boolean {
    const p = this.person;
    // taken over (dragged, steered, sent away, a dev event) or finished: whatever they hold goes away
    if (p.talk !== this || p.held || p.controlled || p.presence !== 'in') {
      this.finish();
      return false;
    }
    this.time += dt;
    if (this.phase === 'walk') {
      const there = p.state === 'idle' && Math.hypot(this.stand.x - p.pos.x, this.stand.z - p.pos.z) < 0.7;
      if (there) {
        this.phase = 'shoot';
        this.time = 0;
        p.cameraOn = true;
        this.studio.showProduct(true);
      } else if (this.time > GATHER_TIMEOUT) this.abort();
      else if (p.state === 'idle' && (this.retryIn -= dt) <= 0) {
        this.retryIn = 1;
        p.queueAt(nav, this.stand, this); // stopped short: try again
      }
    } else if (this.phase === 'shoot') {
      if ((this.wait -= dt) <= 0) {
        if (this.shots < this.total) {
          this.shots++;
          p.flash = 1;
          this.wait = this.shots < this.total ? between(GAP) : LOWER;
        } else this.toDesk(nav);
      }
    } else if (this.phase === 'sit') {
      if (p.meetSeated) {
        this.phase = 'edit';
        this.wait = between(EDIT);
        p.editing = true;
        this.studio.showEditing(true);
      } else if (this.time > GATHER_TIMEOUT) this.abort();
    } else if (this.phase === 'edit' && (this.wait -= dt) <= 0) {
      this.finish();
      this.phase = 'leave';
      p.dismissMeeting(); // stands up and leaves; `update` ends once they are off the chair
    }
    return true;
  }

  private toDesk(nav: NavGrid): void {
    const p = this.person;
    p.cameraOn = false;
    this.studio.showProduct(false);
    this.phase = 'sit';
    this.time = 0;
    p.callToMeeting(nav, this.studio.seat, this);
  }

  /** Puts everything away: the camera, the product, the pictures on the monitors. */
  private finish(): void {
    const p = this.person;
    p.cameraOn = false;
    p.editing = false;
    this.studio.showProduct(false);
    this.studio.showEditing(false);
  }

  /** Gives up where they are: still at the sweep they go about their day, at the chair they stand up. */
  abort(): void {
    const p = this.person;
    this.finish();
    if (this.phase === 'leave' || p.talk !== this) return;
    if (p.inMeeting) p.dismissMeeting();
    else {
      p.talk = null;
      p.timer = 0.3 + random();
    }
  }
}

/** The photo studio: one person at a time shoots a product with flash on the sweep, then edits the pictures at the desk. */
export class PhotoStudio {
  readonly seat: MeetSeat;
  current: PhotoSession | null = null;
  private stand: Vec2;
  private lit = 0;
  private screens: Array<{ mesh: OfficeModel['photoStudio']['screens'][number]; off: THREE.Material }>;
  private editing = false;

  constructor(
    private model: OfficeModel['photoStudio'],
    nav: NavGrid,
  ) {
    this.stand = this.standFor(nav);
    this.seat = { seat: { x: model.seat.x, z: model.seat.z }, approach: this.approachFor(nav), yaw: model.seat.yaw, occupant: null };
    this.screens = model.screens.map((mesh) => ({ mesh, off: mesh.material as THREE.Material }));
  }

  /** The photographer's spot, on a free cell. */
  private standFor(nav: NavGrid): Vec2 {
    const s = this.model.stand;
    return nav.nearestWalkable(s, 3) ?? { x: s.x, z: s.z };
  }

  /** The free cell behind the chair (its back is to the south-east), where people walk to before sitting down. */
  private approachFor(nav: NavGrid): Vec2 {
    const s = this.model.seat;
    const back = { x: -Math.sin(s.yaw), z: -Math.cos(s.yaw) };
    for (const dist of [1.0, 1.3, 0.8, 1.6]) {
      const p = { x: s.x + back.x * dist, z: s.z + back.z * dist };
      const c = nav.toCell(p);
      if (nav.walkable(c.cx, c.cz)) return nav.center(c.cx, c.cz);
    }
    return nav.nearestWalkable({ x: s.x + back.x, z: s.z + back.z }, 4) ?? { x: s.x + back.x, z: s.z + back.z };
  }

  /** The room editor moved the furniture and the nav grid was rebuilt. */
  relayout(nav: NavGrid): void {
    this.stand = this.standFor(nav);
    this.seat.seat.x = this.model.seat.x;
    this.seat.seat.z = this.model.seat.z;
    this.seat.yaw = this.model.seat.yaw;
    const approach = this.approachFor(nav);
    this.seat.approach.x = approach.x;
    this.seat.approach.z = approach.z;
  }

  /** Nobody shoots or edits. */
  get free(): boolean {
    return !this.current && !this.seat.occupant;
  }

  /** Where the product stands on the sweep (it moves with the table when the room editor moves it). */
  get product(): Vec2 {
    const at = new THREE.Vector3();
    this.model.product.getWorldPosition(at);
    return { x: at.x, z: at.z };
  }

  /** Sends `person` (already dropped from desk / conversation) to the studio. Null if it is taken. */
  start(person: Person, nav: NavGrid): PhotoSession | null {
    if (!this.free) return null;
    const session = new PhotoSession(person, this, this.stand, this.product);
    this.current = session;
    person.queueAt(nav, this.stand, session);
    return session;
  }

  showProduct(on: boolean): void {
    this.model.product.visible = on;
  }

  /** The monitors show the editing tool (or go dark). */
  showEditing(on: boolean): void {
    if (on === this.editing) return;
    this.editing = on;
    this.screens.forEach((s, i) => {
      const old = s.mesh.material as THREE.Material;
      const show = on ? screenMaterial(EDITING[i % EDITING.length].kind, EDITING[i % EDITING.length].variant) : s.off;
      if (old === show) return;
      if (old !== s.off) useScreen(old, -1);
      if (show !== s.off) useScreen(show, 1);
      s.mesh.material = show;
    });
  }

  update(dt: number, nav: NavGrid): void {
    const s = this.current;
    if (s && !s.update(dt, nav)) this.current = null;
    const flash = this.current?.person.flash ?? 0;
    if (flash !== this.lit) this.model.flash((this.lit = flash));
  }

  /** Empties the studio (dev event, game reset). */
  abort(): void {
    this.current?.abort();
  }
}
