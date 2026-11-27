import * as THREE from 'three';
import type { NavGrid, Vec2 } from './NavGrid';
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

const AIM = { min: 0.6, max: 0.9 }; // seconds from stopping to pulling the trigger
const COOL = { min: 0.4, max: 1.1 }; // seconds somebody stands there after a shot
const DUCK = 1.1; // seconds somebody stays ducked after a hit
const DUEL = { min: 10, max: 20 }; // seconds a duel lasts
const MOVE_MAX = 2.2; // seconds to get to the next spot at the longest
const SIDESTEP = { min: 1, max: 2.2 }; // metres to the next spot
const HIT_CHANCE = 0.6;
const FLINCH = 0.7; // a hit makes the target duck this often
const RANGE = { min: 2.5, max: 9 }; // metres between the two fighters
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

type Stage = 'move' | 'aim' | 'cool' | 'duck';

/** One of the two in a duel: they walk to a spot, stand and aim, shoot, stand a moment, and walk on. */
interface Fighter {
  p: Person;
  foe: Person;
  stage: Stage;
  t: number;
  /** seconds the stage lasts */
  len: number;
  /** their pin: the walk and the stand; a different one means somebody else took them */
  pin: Person['scripted'];
}

/** a dart in the air that will strike `target` */
interface Flight {
  target: Fighter;
  left: number;
  hit: boolean;
}

interface Duel {
  fighters: [Fighter, Fighter];
  flights: Flight[];
  /** seconds since it began, and how long it lasts */
  clock: number;
  length: number;
}

/**
 * Nerf duels: the two devs carry foam dart guns and, now and then, two of them on a break shoot at each other for
 * 10–20 seconds: both stand and aim, shoot, move to another spot and shoot again. A hit sometimes makes the target
 * duck. Darts land on the floor, lie there a while and fade. Only people on a break take part (no desk, talk,
 * meeting or errand), see `onBreak`.
 */
export class Nerf {
  readonly darts: Dart[] = [];
  private duel: Duel | null = null;
  private timer = between(GAP) / 2;

  constructor(private scene: THREE.Scene) {}

  /** a duel is running */
  get active(): boolean {
    return this.duel !== null;
  }

  /** `a` and `b` stop what they do and start shooting at each other; false when one of them cannot. Does not check range or who is on a break. */
  start(a: Person, b: Person): boolean {
    if (this.duel || a === b || !a.inOffice || !b.inOffice || a.held || b.held || a.controlled || b.controlled || a.talk || b.talk) return false;
    const mk = (p: Person, foe: Person, len: number): Fighter => ({ p, foe, stage: 'aim', t: 0, len, pin: null });
    const fa = mk(a, b, between(AIM));
    const fb = mk(b, a, between(AIM) + 0.3); // not at the same moment
    this.stand(fa, 'aim');
    this.stand(fb, 'aim');
    this.duel = { fighters: [fa, fb], flights: [], clock: 0, length: between(DUEL) };
    return true;
  }

  /** Ends a running duel at once: everybody walks on. */
  abort(): void {
    if (this.duel) this.end(this.duel);
  }

  /** Looks for two devs on a break within range, in line of sight. */
  find(people: readonly Person[], nav: NavGrid): [Person, Person] | null {
    const shooters = people.filter((p) => p.member.look.nerf && onBreak(p) && p.sit < 0.05).sort(() => random() - 0.5);
    for (const s of shooters) {
      const foes = shooters.filter((t) => {
        const d = Math.hypot(t.pos.x - s.pos.x, t.pos.z - s.pos.z);
        return t !== s && d >= RANGE.min && d <= RANGE.max && nav.lineClear(s.pos, t.pos);
      });
      if (foes.length) return [s, foes[0]];
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
    if (this.duel) {
      if (!this.advance(this.duel, dt, nav)) this.end(this.duel);
      return;
    }
    if ((this.timer -= dt) > 0) return;
    const pair = this.find(people, nav);
    if (!pair || !this.start(...pair)) {
      this.timer = RETRY;
      return;
    }
    this.timer = between(GAP);
  }

  /** Stops `f.p` where they are, facing the other, in the pose of `stage`. */
  private stand(f: Fighter, stage: 'aim' | 'cool' | 'duck'): void {
    const { p, foe } = f;
    p.pinTo({ at: { x: p.pos.x, z: p.pos.z }, yaw: Math.atan2(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z), turn: 6 });
    p.nerfKind = stage === 'duck' ? 'duck' : 'aim';
    p.nerfOn = true;
    f.pin = p.scripted;
    f.stage = stage;
    f.t = 0;
  }

  /** `f` walks to another spot nearby, still with a clear line to the other one. */
  private sidestep(f: Fighter, nav: NavGrid): void {
    const { p, foe } = f;
    f.stage = 'move';
    f.t = 0;
    // a spot with a clear line to the other one if there is one, else any spot within range (darts fly over desks)
    let any: Vec2 | null = null;
    let clear: Vec2 | null = null;
    for (let i = 0; i < 10 && !clear; i++) {
      const a = random() * Math.PI * 2;
      const r = between(SIDESTEP);
      const spot = nav.nearestWalkable({ x: p.pos.x + Math.sin(a) * r, z: p.pos.z + Math.cos(a) * r }, 2);
      if (!spot || Math.hypot(spot.x - p.pos.x, spot.z - p.pos.z) < 0.5) continue;
      const d = Math.hypot(spot.x - foe.pos.x, spot.z - foe.pos.z);
      if (d < RANGE.min - 0.5 || d > RANGE.max) continue;
      if (nav.lineClear(spot, foe.pos)) clear = spot;
      else any ??= spot;
    }
    const spot = clear ?? any;
    if (!spot) {
      this.stand(f, 'aim'); // nowhere to go: shoots from here
      f.len = between(AIM);
      return;
    }
    p.pinTo({ at: spot, yaw: Math.atan2(foe.pos.x - spot.x, foe.pos.z - spot.z), walk: true, turn: 6, arriveIn: 1.2 });
    p.nerfKind = 'aim';
    p.nerfOn = true;
    f.pin = p.scripted;
  }

  /** One step of the duel; false when it is over. */
  private advance(d: Duel, dt: number, nav: NavGrid): boolean {
    d.clock += dt;
    for (const f of d.fighters) {
      const { p } = f;
      if (!p.inOffice || p.held || p.scripted !== f.pin) return false; // somebody took them away
    }
    for (const fl of d.flights) fl.left -= dt;
    for (const fl of d.flights.filter((x) => x.left <= 0)) this.arrive(fl);
    d.flights = d.flights.filter((x) => x.left > 0);
    if (d.clock >= d.length) return false;
    for (const f of d.fighters) {
      const { p, foe } = f;
      f.t += dt;
      if (f.stage !== 'move') p.faceTo(Math.atan2(foe.pos.x - p.pos.x, foe.pos.z - p.pos.z));
      switch (f.stage) {
        case 'move':
          if (p.scripted?.arrived || f.t >= MOVE_MAX) {
            this.stand(f, 'aim');
            f.len = between(AIM);
          }
          break;
        case 'aim':
          if (f.t >= f.len) {
            this.fire(d, f);
            this.stand(f, 'cool');
            f.len = between(COOL);
          }
          break;
        case 'cool':
          if (f.t >= f.len) this.sidestep(f, nav);
          break;
        case 'duck':
          if (f.t >= DUCK) this.sidestep(f, nav);
          break;
      }
    }
    return true;
  }

  private fire(d: Duel, f: Fighter): void {
    const { p: s, foe: t } = f;
    const dx = t.pos.x - s.pos.x;
    const dz = t.pos.z - s.pos.z;
    const yaw = Math.atan2(dx, dz);
    const from = { x: s.pos.x + Math.sin(yaw) * 0.5, y: MUZZLE * s.root.scale.y, z: s.pos.z + Math.cos(yaw) * 0.5 };
    // aim where the target will be when the dart gets there
    const lead = Math.hypot(dx, dz) / DART_SPEED;
    const aim = { x: t.pos.x + (t.pos.x - t.prev.x) * 60 * lead, z: t.pos.z + (t.pos.z - t.prev.z) * 60 * lead };
    const hit = random() < HIT_CHANCE;
    if (!hit) {
      // sails past to the side
      const side = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
      aim.x += Math.cos(yaw) * side;
      aim.z -= Math.sin(yaw) * side;
    }
    const shot = solveShot(from, { x: aim.x, y: CHEST * t.root.scale.y, z: aim.z });
    const dart = new Dart(from, shot, hit);
    this.darts.push(dart);
    this.scene.add(dart.mesh);
    if (this.darts.length > MAX_DARTS) this.darts.find((x) => x.state === 'rest')?.retire();
    s.nerfKick = 1;
    const target = d.fighters.find((x) => x.p === t)!;
    d.flights.push({ target, left: shot.t, hit });
  }

  /** The dart reaches its target: a hit makes them duck now and then (and skip a shot). */
  private arrive(fl: Flight): void {
    const f = fl.target;
    if (!fl.hit || f.stage === 'duck' || random() >= FLINCH) return;
    this.stand(f, 'duck');
  }

  /** Lets both walk on. */
  private end(d: Duel): void {
    for (const f of d.fighters) if (f.p.scripted && f.p.scripted === f.pin) f.p.unpin();
    for (const f of d.fighters) f.p.nerfOn = false;
    this.duel = null;
  }
}
