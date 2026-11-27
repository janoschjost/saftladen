import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { NavGrid } from './NavGrid';
import { DART_SPEED, Dart, GRAVITY, MAX_DARTS, Nerf, solveShot } from './Nerf';
import type { Person } from './Person';
import { setSeed } from './rng';

const STEP = 1 / 60;

type Pin = { at: { x: number; z: number }; yaw: number; arrived: boolean };

/** Just enough of a Person for the duel: where they stand and walk, whether they are on a break, and the pin. */
class Stub {
  inOffice = true;
  held = false;
  controlled = false;
  task = null;
  talk = null;
  meetJob = null;
  printJob = null;
  foosJob = null;
  vapeJob = null;
  snackLeft = 0;
  phoneJob = null;
  run = null;
  coffeeJob = null;
  inMeeting = false;
  sit = 0;
  prev: { x: number; z: number };
  root = { scale: { y: 1 } };
  playerChat = null;
  scripted: Pin | null = null;
  nerfOn = false;
  nerfKind: 'aim' | 'duck' | 'shrug' | 'watch' = 'aim';
  nerfKick = 0;
  speaking = false;
  /** metres walked in total */
  walked = 0;
  constructor(
    readonly member: { look: { nerf?: boolean } },
    public pos: { x: number; z: number },
  ) {
    this.prev = { ...pos };
  }
  pinTo(s: { at: { x: number; z: number }; yaw: number; walk?: boolean }): void {
    this.scripted = { at: { ...s.at }, yaw: s.yaw, arrived: !s.walk };
    this.controlled = true;
    this.nerfOn = false; // like the real one: a pin resets the skirmish flag, the caller sets it again
    if (!s.walk) this.pos = { ...s.at };
  }
  faceTo(yaw: number): void {
    if (this.scripted) this.scripted.yaw = yaw;
  }
  unpin(): void {
    this.scripted = null;
    this.controlled = false;
  }
  /** walks to the pinned spot at 2 m/s */
  tick(dt: number): void {
    const s = this.scripted;
    this.prev = { ...this.pos };
    if (!s || s.arrived) return;
    const d = Math.hypot(s.at.x - this.pos.x, s.at.z - this.pos.z);
    const step = Math.min(d, 2 * dt);
    this.pos = { x: this.pos.x + ((s.at.x - this.pos.x) / (d || 1)) * step, z: this.pos.z + ((s.at.z - this.pos.z) / (d || 1)) * step };
    this.walked += step;
    if (d - step < 0.05) s.arrived = true;
  }
}
const asPeople = (...p: Stub[]) => p as unknown as Person[];
const dev = (x = 5, z = 5) => new Stub({ look: { nerf: true } }, { x, z });
const other = (x: number, z: number) => new Stub({ look: {} }, { x, z });
const asP = (s: Stub) => s as unknown as Person;

/** Steps the duel for `seconds`. `pool` is who `update` may pick for a new random duel (nobody: only the one started by hand). */
function run(nerf: Nerf, people: Stub[], seconds: number, pool: Stub[] = []): void {
  const nav = new NavGrid(30, 30);
  for (let t = 0; t < seconds; t += STEP) {
    people.forEach((p) => p.tick(STEP));
    nerf.update(STEP, asPeople(...pool), nav);
  }
}

describe('play.nerf', () => {
  it('the devs carry the guns', () => {
    const devs = team.filter((m) => m.look.nerf).map((m) => m.role);
    expect(devs.length).toBeGreaterThan(0);
    for (const r of devs) expect(r).toMatch(/Webdevelopment|AI Engineer/);
    expect(team.some((m) => !m.look.nerf)).toBe(true);
  });

  it('a shot lands where it is aimed', () => {
    const from = { x: 0, y: 1.2, z: 0 };
    const to = { x: 4, y: 1.15, z: 3 };
    const shot = solveShot(from, to);
    expect(shot.t).toBeCloseTo(5 / DART_SPEED, 5);
    // fly it by hand
    let [x, y, z, vy] = [from.x, from.y, from.z, shot.vy];
    for (let t = 0; t < shot.t; t += 0.0005) {
      x += shot.vx * 0.0005;
      z += shot.vz * 0.0005;
      y += vy * 0.0005;
      vy -= GRAVITY * 0.0005;
    }
    expect(x).toBeCloseTo(to.x, 1);
    expect(z).toBeCloseTo(to.z, 1);
    expect(y).toBeCloseTo(to.y, 1);
  });

  it('a dart lands, lies on the floor a while, then fades away', () => {
    setSeed(3);
    const shot = solveShot({ x: 0, y: 1.2, z: 0 }, { x: 3, y: 0.5, z: 0 });
    const d = new Dart({ x: 0, y: 1.2, z: 0 }, shot, false);
    let t = 0;
    const until = (state: Dart['state']) => {
      while (d.state !== state && t < 120) {
        d.step(STEP);
        t += STEP;
      }
    };
    until('rest');
    expect(d.state).toBe('rest');
    expect(d.pos.y).toBeLessThan(0.05);
    const landed = t;
    until('fade');
    expect(t - landed).toBeGreaterThanOrEqual(20);
    expect(t - landed).toBeLessThanOrEqual(40.1);
    until('gone');
    expect(d.state).toBe('gone');
  });

  it('two devs stop, shoot at each other for 10–20 s, move around between the shots and walk on afterwards', () => {
    for (let seed = 1; seed <= 20; seed++) {
      setSeed(seed);
      const scene = new THREE.Scene();
      const nerf = new Nerf(scene);
      const a = dev(5, 5);
      const b = dev(9, 5);
      expect(nerf.start(asP(a), asP(b))).toBe(true);
      expect(a.nerfOn && b.nerfOn).toBe(true);
      let t = 0;
      let shots = 0;
      let seen = 0;
      const shooters = new Set<Stub>();
      const nav = new NavGrid(30, 30);
      while (nerf.active && t < 40) {
        [a, b].forEach((p) => p.tick(STEP));
        const before = a.nerfKick + b.nerfKick;
        nerf.update(STEP, [], nav);
        t += STEP;
        if (nerf.darts.length > seen) {
          shots += nerf.darts.length - seen;
          if (a.nerfKick > 0 && before === 0) shooters.add(a);
          if (b.nerfKick > 0 && before === 0) shooters.add(b);
        }
        seen = nerf.darts.length;
        a.nerfKick = b.nerfKick = 0;
      }
      expect(t).toBeGreaterThanOrEqual(10);
      expect(t).toBeLessThanOrEqual(20.2);
      expect(shots).toBeGreaterThanOrEqual(4);
      expect(shooters.size).toBe(2); // both shoot
      expect(a.walked).toBeGreaterThan(1); // and they move around
      expect(b.walked).toBeGreaterThan(1);
      expect(a.scripted || b.scripted || a.controlled || b.controlled).toBeFalsy();
      expect(a.nerfOn || b.nerfOn).toBe(false);
      // the darts are cleaned up later
      run(nerf, [a, b], 70);
      expect(nerf.darts.length).toBe(0);
      expect(scene.children.length).toBe(0);
    }
  });

  it('a duel ends at once when somebody is taken away, or when it is aborted', () => {
    setSeed(7);
    const nerf = new Nerf(new THREE.Scene());
    const a = dev(5, 5);
    const b = dev(9, 5);
    nerf.start(asP(a), asP(b));
    run(nerf, [a, b], 2);
    b.inOffice = false;
    run(nerf, [a, b], 0.1);
    expect(nerf.active).toBe(false);
    expect(a.controlled).toBe(false);
    const c = dev(5, 5);
    const d = dev(9, 5);
    nerf.start(asP(c), asP(d));
    nerf.abort();
    expect(nerf.active).toBe(false);
    expect(c.controlled || d.controlled).toBe(false);
  });

  it('nobody is pulled into a duel who is held, steered or away', () => {
    const nerf = new Nerf(new THREE.Scene());
    const a = dev(5, 5);
    const b = dev(9, 5);
    b.held = true;
    expect(nerf.start(asP(a), asP(b))).toBe(false);
    b.held = false;
    expect(nerf.start(asP(a), asP(a))).toBe(false);
    expect(a.scripted).toBeNull();
  });

  it('a random duel only picks two devs on a break, within range and in line of sight', () => {
    setSeed(2);
    const nerf = new Nerf(new THREE.Scene());
    const nav = new NavGrid(30, 30);
    const a = dev();
    const near = dev(6, 5); // 1 m: too close
    const far = dev(25, 5); // 20 m: too far
    const sitting = dev(10, 5);
    sitting.sit = 1;
    const working = dev(10, 6);
    (working as unknown as { task: object }).task = {};
    expect(nerf.find(asPeople(a, near, far, sitting, working), nav)).toBeNull();
    const ok = dev(10, 7);
    const pair = nerf.find(asPeople(a, near, far, sitting, working, ok), nav);
    expect(pair?.map((p) => p as unknown)).toEqual(expect.arrayContaining([a, ok]));
    nav.block(7, 4, 1, 4); // a wall in between
    expect(nerf.find(asPeople(a, ok), nav)).toBeNull();
    // only devs shoot, and only at devs
    expect(nerf.find(asPeople(a, other(10, 7)), new NavGrid(30, 30))).toBeNull();
    expect(nerf.find(asPeople(other(5, 5), ok), new NavGrid(30, 30))).toBeNull();
  });

  it('now and then a duel starts by itself', () => {
    setSeed(4);
    const nerf = new Nerf(new THREE.Scene());
    const a = dev();
    const b = dev(9, 5);
    const nav = new NavGrid(30, 30);
    let started = 0;
    let was = false;
    for (let t = 0; t < 400; t += STEP) {
      [a, b].forEach((p) => p.tick(STEP));
      nerf.update(STEP, asPeople(a, b), nav);
      if (nerf.active && !was) started++;
      was = nerf.active;
    }
    expect(started).toBeGreaterThanOrEqual(2);
    expect(started).toBeLessThanOrEqual(5); // "now and then", not all the time
  });

  it('too many darts on the floor: the oldest fade early', () => {
    setSeed(6);
    const scene = new THREE.Scene();
    const nerf = new Nerf(scene);
    const a = dev();
    const b = dev(9, 5);
    // fill the floor, then one more shot
    for (let i = 0; i < MAX_DARTS; i++) {
      const d = new Dart({ x: i * 0.1, y: 0.02, z: 0 }, { vx: 0, vy: 0, vz: 0, t: 1 }, false);
      d.step(STEP);
      nerf.darts.push(d);
      scene.add(d.mesh);
    }
    nerf.start(asP(a), asP(b));
    run(nerf, [a, b], 1.4);
    expect(nerf.darts.length).toBeLessThanOrEqual(MAX_DARTS + 2); // both may shoot
    nerf.abort();
    run(nerf, [a, b], 2);
    expect(nerf.darts.length).toBeLessThanOrEqual(MAX_DARTS);
  });
});
