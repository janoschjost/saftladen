import * as THREE from 'three';
import type { NavGrid } from './NavGrid';
import type { Person } from './Person';
import { onBreak } from './PetCare';
// own stream (`fxRandom`): a skirmish never shifts the simulation's numbers, so a seed replays everything else as before
import { fxRandom as random } from './rng';

/** Metres per second a dart leaves the gun with (horizontal), and gravity. */
export const DART_SPEED = 9;
export const GRAVITY = 9.8;
const FLOOR = 0.02;
/** muzzle and chest height of a person of scale 1, in metres */
const MUZZLE = 1.2;
const CHEST = 1.15;

const AIM = 0.9; // seconds from stopping to pulling the trigger
const DUCK = 1.1; // seconds somebody stays ducked after a hit
const AFTER = 1.0; // seconds everybody stands there after the last dart before they walk on
const HIT_CHANCE = 0.6;
const MAX_SHOTS = 4; // darts in one skirmish, however much they shoot back
const RANGE = { min: 2.5, max: 9 }; // metres between shooter and target for a random skirmish
const GAP = { min: 45, max: 120 }; // seconds between two random skirmishes
const RETRY = 5; // seconds before looking for a pair again when nobody was on a break
const REST = { min: 20, max: 40 }; // seconds a dart lies on the floor
const FADE = 1.5; // seconds it takes to disappear
export const MAX_DARTS = 60;

const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

export interface Shot {
  vx: number;
  vy: number;
  vz: number;
  /** seconds in the air until it passes `to` */
  t: number;
}

/** Launch velocity that takes a dart from `from` through `to` at horizontal speed `speed`. */
export function solveShot(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, speed = DART_SPEED, g = GRAVITY): Shot {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.max(0.05, Math.hypot(dx, dz));
  const t = d / speed;
  return { vx: dx / t, vz: dz / t, vy: (to.y - from.y + 0.5 * g * t * t) / t, t };
}

export type Reaction = 'back' | 'duck' | 'ignore';

/**
 * What somebody does when a dart arrives (`roll` in [0, 1)). A hit gets a reaction most of the time; a miss is
 * mostly shrugged off. Only people with a gun of their own (`armed`) shoot back.
 */
export function reactionTo(hit: boolean, armed: boolean, roll: number): Reaction {
  if (hit) {
    if (armed && roll < 0.5) return 'back';
    return roll < 0.85 ? 'duck' : 'ignore';
  }
  if (armed && roll < 0.3) return 'back';
  return roll < 0.6 ? 'duck' : 'ignore';
}

// one dart: an orange foam body with a suction cup on the tip, lying along z
const DART_GEO = (() => {
  const body = new THREE.CylinderGeometry(0.011, 0.011, 0.075, 6).rotateX(Math.PI / 2);
  const tip = new THREE.CylinderGeometry(0.016, 0.016, 0.015, 6).rotateX(Math.PI / 2).translate(0, 0, 0.045);
  return { body, tip };
})();
const DART_MAT = { body: new THREE.MeshLambertMaterial({ color: '#f08a2a' }), tip: new THREE.MeshLambertMaterial({ color: '#e8553d' }) };

/** A foam dart: flies, bounces once, lies on the floor for a while, then shrinks away. */
export class Dart {
  readonly mesh = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  state: 'fly' | 'rest' | 'fade' | 'gone' = 'fly';
  /** seconds since it left the gun */
  age = 0;
  /** seconds into the flight at which it strikes its target (null: it sails past) */
  hitAt: number | null = null;
  private bounced = false;
  private life = 0;
  private fade = FADE;

  constructor(from: { x: number; y: number; z: number }, shot: Shot, hit: boolean) {
    this.pos.set(from.x, from.y, from.z);
    this.vel.set(shot.vx, shot.vy, shot.vz);
    this.hitAt = hit ? shot.t : null;
    this.mesh.add(new THREE.Mesh(DART_GEO.body, DART_MAT.body), new THREE.Mesh(DART_GEO.tip, DART_MAT.tip));
    this.mesh.traverse((o) => (o.castShadow = true));
    this.sync();
  }

  /** Lets it fade out now (too many darts on the floor). */
  retire(): void {
    if (this.state === 'rest') this.life = 0;
  }

  step(dt: number): void {
    switch (this.state) {
      case 'fly': {
        this.age += dt;
        if (this.hitAt !== null && this.age >= this.hitAt) {
          // strikes the target and drops off it
          this.vel.set(-this.vel.x * 0.12 + (random() - 0.5) * 0.6, 1, -this.vel.z * 0.12 + (random() - 0.5) * 0.6);
          this.hitAt = null;
        }
        this.vel.y -= GRAVITY * dt;
        this.pos.addScaledVector(this.vel, dt);
        if (this.pos.y <= FLOOR) {
          this.pos.y = FLOOR;
          if (!this.bounced && this.vel.y < -1.5) {
            this.vel.set(this.vel.x * 0.45, -this.vel.y * 0.3, this.vel.z * 0.45);
            this.bounced = true;
          } else {
            this.vel.set(0, 0, 0);
            this.state = 'rest';
            this.life = between(REST);
            this.mesh.rotation.set(0, random() * Math.PI * 2, 0); // lies flat, any way round
          }
        }
        break;
      }
      case 'rest':
        if ((this.life -= dt) <= 0) this.state = 'fade';
        break;
      case 'fade':
        this.fade -= dt;
        if (this.fade <= 0) this.state = 'gone';
        break;
    }
    this.sync();
  }

  private sync(): void {
    this.mesh.position.copy(this.pos);
    if (this.state === 'fly' && this.vel.lengthSq() > 0.01) {
      // nose along the flight path
      this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    }
    this.mesh.scale.setScalar(this.state === 'fade' ? Math.max(0.001, this.fade / FADE) : 1);
  }
}

interface Fight {
  shooter: Person;
  target: Person;
  stage: 'aim' | 'fly' | 'react';
  t: number;
  /** seconds from the shot to the dart arriving, and whether it will hit */
  flight: number;
  hit: boolean;
  shots: number;
  /** how long the reaction lasts before the fight is over / the target's answer starts */
  react: Reaction;
}

/**
 * Nerf skirmishes: the devs carry foam dart guns and, now and then, shoot at somebody on their break. The target
 * ducks, shoots back (if they carry a gun too) or ignores it. Darts land on the floor, lie there a while and fade.
 * Only people on a break take part (no desk, talk, meeting or errand), see `onBreak`.
 */
export class Nerf {
  readonly darts: Dart[] = [];
  private fights: Fight[] = [];
  private timer = between(GAP) / 2;

  constructor(private scene: THREE.Scene) {}

  /** a skirmish is running */
  get active(): boolean {
    return this.fights.length > 0;
  }

  /** `a` stops, aims at `b` and shoots; false when `a` cannot stop right now. Does not check range or who is on a break. */
  start(a: Person, b: Person): boolean {
    if (a === b || this.fights.some((f) => f.shooter === a || f.target === a || f.shooter === b || f.target === b)) return false;
    if (!this.aim(a, b, AIM + 1)) return false;
    this.fights.push({ shooter: a, target: b, stage: 'aim', t: 0, flight: 0, hit: false, shots: 0, react: 'ignore' });
    return true;
  }

  /** Looks for a shooter and a target on a break within range, in line of sight. */
  find(people: readonly Person[], nav: NavGrid): [Person, Person] | null {
    const shooters = people.filter((p) => p.member.look.nerf && onBreak(p) && p.sit < 0.05).sort(() => random() - 0.5);
    for (const s of shooters) {
      const targets = people
        .filter((t) => {
          const d = Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z);
          return t !== s && onBreak(t) && t.sit < 0.05 && d >= RANGE.min && d <= RANGE.max && nav.lineClear(s.pos, t.pos);
        })
        .sort(() => random() - 0.5);
      if (targets.length) return [s, targets[0]];
    }
    return null;
  }

  update(dt: number, people: readonly Person[], nav: NavGrid): void {
    for (const d of this.darts) d.step(dt);
    for (let i = this.darts.length - 1; i >= 0; i--) {
      if (this.darts[i].state !== 'gone') continue;
      this.scene.remove(this.darts[i].mesh);
      this.darts.splice(i, 1);
    }
    this.fights = this.fights.filter((f) => this.advance(f, dt));
    if (this.fights.length) return;
    if ((this.timer -= dt) > 0) return;
    const pair = this.find(people, nav);
    if (!pair || !this.start(...pair)) {
      this.timer = RETRY;
      return;
    }
    this.timer = between(GAP);
  }

  /** Stops `a`, turns them to `b` and raises the gun. */
  private aim(a: Person, b: Person, seconds: number): boolean {
    if (!a.talkTo({ x: b.pos.x, z: b.pos.z }, seconds, false)) return false;
    a.nerfKind = 'aim';
    a.nerfOn = true;
    a.speaking = false;
    return true;
  }

  /** One step of a fight; false when it is over. */
  private advance(f: Fight, dt: number): boolean {
    const { shooter: s, target: t } = f;
    if (!s.playerChat || !s.nerfOn || s.held || s.controlled || (f.stage === 'aim' && (!t.inOffice || t.held))) return this.end(f);
    f.t += dt;
    if (f.stage === 'aim') {
      s.playerChat.at = { x: t.pos.x, z: t.pos.z }; // keeps the target in the sights
      s.playerChat.t = Math.max(s.playerChat.t, 0.5);
      if (t.nerfOn && t.playerChat) t.playerChat.t = Math.max(t.playerChat.t, 0.5); // the one who just shot back keeps standing
      if (f.t >= AIM) this.fire(f);
    } else if (f.stage === 'fly') {
      if (f.t >= f.flight) this.arrive(f);
    } else if (f.t >= (f.react === 'back' ? 0.35 : f.react === 'duck' ? DUCK : AFTER)) {
      if (f.react === 'back') {
        // the target pulls out their own gun: roles swap
        f.shooter = t;
        f.target = s;
        f.stage = 'aim';
        f.t = 0;
        return true;
      }
      return this.end(f);
    }
    return true;
  }

  private fire(f: Fight): void {
    const { shooter: s, target: t } = f;
    const dx = t.pos.x - s.pos.x;
    const dz = t.pos.z - s.pos.z;
    const yaw = Math.atan2(dx, dz);
    const from = { x: s.pos.x + Math.sin(yaw) * 0.5, y: MUZZLE * s.root.scale.y, z: s.pos.z + Math.cos(yaw) * 0.5 };
    // aim where the target will be when the dart gets there
    const lead = Math.hypot(dx, dz) / DART_SPEED;
    const aim = { x: t.pos.x + (t.pos.x - t.prev.x) * 60 * lead, z: t.pos.z + (t.pos.z - t.prev.z) * 60 * lead };
    f.hit = random() < HIT_CHANCE;
    if (!f.hit) {
      // sails past to the side
      const side = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
      aim.x += Math.cos(yaw) * side;
      aim.z -= Math.sin(yaw) * side;
    }
    const shot = solveShot(from, { x: aim.x, y: CHEST * t.root.scale.y, z: aim.z });
    const dart = new Dart(from, shot, f.hit);
    this.darts.push(dart);
    this.scene.add(dart.mesh);
    if (this.darts.length > MAX_DARTS) this.darts.find((d) => d.state === 'rest')?.retire();
    s.nerfKick = 1;
    f.shots++;
    f.flight = shot.t;
    f.stage = 'fly';
    f.t = 0;
    if (s.playerChat) s.playerChat.t = Math.max(s.playerChat.t, shot.t + AFTER);
  }

  /** The dart reaches its target: ducks, answers or shrugs it off. */
  private arrive(f: Fight): void {
    const { shooter: s, target: t } = f;
    const armed = !!t.member.look.nerf && f.shots < MAX_SHOTS;
    f.react = reactionTo(f.hit, armed, random());
    f.stage = 'react';
    f.t = 0;
    if (f.react === 'back') {
      if (!this.aim(t, s, AIM + 1)) f.react = 'ignore';
    } else if (f.react === 'duck') {
      if (t.talkTo({ x: s.pos.x, z: s.pos.z }, DUCK + 0.4, false)) {
        t.nerfKind = 'duck';
        t.nerfOn = true;
        t.speaking = false;
      } else f.react = 'ignore';
    }
  }

  /** Lets both walk on (their stop ends in a moment); always false. */
  private end(f: Fight): boolean {
    for (const p of [f.shooter, f.target]) if (p.playerChat && p.nerfOn) p.playerChat.t = Math.min(p.playerChat.t, 0.3);
    return false;
  }
}
