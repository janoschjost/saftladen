import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { team } from '../data/team';
import { NavGrid } from './NavGrid';
import { DART_SPEED, Dart, GRAVITY, MAX_DARTS, Nerf, reactionTo, solveShot } from './Nerf';
import type { Person } from './Person';
import { setSeed } from './rng';

const STEP = 1 / 60;

/** Just enough of a Person for the skirmish: where they stand, whether they are on a break, and the stop-and-turn. */
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
  playerChat: { t: number; total: number; at: { x: number; z: number } } | null = null;
  nerfOn = false;
  nerfKind: 'aim' | 'duck' = 'aim';
  nerfKick = 0;
  speaking = false;
  constructor(
    readonly member: { look: { nerf?: boolean } },
    public pos: { x: number; z: number },
  ) {
    this.prev = { ...pos };
  }
  talkTo(at: { x: number; z: number }, seconds: number): boolean {
    this.playerChat = { t: seconds, total: seconds, at };
    this.nerfOn = false; // like the real one: a chat resets the skirmish flag, the caller sets it again
    return true;
  }
  /** the real Person drops the stop when the chat time runs out */
  tick(dt: number): void {
    if (!this.playerChat) return;
    if ((this.playerChat.t -= dt) <= 0) {
      this.playerChat = null;
      this.nerfOn = false;
    }
  }
}
const asPeople = (...p: Stub[]) => p as unknown as Person[];
const dev = () => new Stub({ look: { nerf: true } }, { x: 5, z: 5 });
const other = (x: number, z: number) => new Stub({ look: {} }, { x, z });

/** Steps the skirmish. `pool` is who `update` may pick for a new random skirmish (nobody: only the one started by hand). */
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

  it('a hit gets an answer, a miss mostly none; only armed people shoot back', () => {
    expect(reactionTo(true, true, 0.1)).toBe('back');
    expect(reactionTo(true, false, 0.1)).toBe('duck');
    expect(reactionTo(true, false, 0.95)).toBe('ignore');
    expect(reactionTo(false, false, 0.9)).toBe('ignore');
    expect(reactionTo(false, true, 0.1)).toBe('back');
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

  it('the shooter stops, fires a dart at the target, and the dart is cleaned up later', () => {
    setSeed(5);
    const scene = new THREE.Scene();
    const nerf = new Nerf(scene);
    const a = dev();
    const b = other(9, 5);
    expect(nerf.start(a as unknown as Person, b as unknown as Person)).toBe(true);
    expect(a.nerfOn).toBe(true);
    expect(a.playerChat?.at).toEqual({ x: 9, z: 5 });
    run(nerf, [a, b], 1.2);
    expect(nerf.darts.length).toBe(1);
    expect(scene.children.length).toBe(1);
    run(nerf, [a, b], 70);
    expect(nerf.darts.length).toBe(0);
    expect(scene.children.length).toBe(0);
    expect(nerf.active).toBe(false);
    expect(a.nerfOn).toBe(false);
  });

  it('somebody who is hit ducks (or answers, or shrugs it off); everybody is free again afterwards', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      setSeed(seed);
      const nerf = new Nerf(new THREE.Scene());
      const a = dev();
      const b = other(9, 5);
      nerf.start(a as unknown as Person, b as unknown as Person);
      let ducked = false;
      let shots = 0;
      for (let t = 0; t < 30; t += STEP) {
        [a, b].forEach((p) => p.tick(STEP));
        nerf.update(STEP, [], new NavGrid(30, 30));
        ducked ||= b.nerfOn && b.nerfKind === 'duck';
        shots = Math.max(shots, nerf.darts.length);
      }
      outcomes.add(ducked ? 'duck' : 'ignore');
      expect(shots).toBe(1); // somebody without a gun never shoots back
      expect(nerf.active).toBe(false);
      expect(a.nerfOn || b.nerfOn).toBe(false);
    }
    expect(outcomes).toEqual(new Set(['duck', 'ignore']));
  });

  it('two devs can shoot back and forth', () => {
    let exchanged = false;
    for (let seed = 1; seed <= 40 && !exchanged; seed++) {
      setSeed(seed);
      const nerf = new Nerf(new THREE.Scene());
      const a = dev();
      const b = dev();
      b.pos = { x: 9, z: 5 };
      nerf.start(a as unknown as Person, b as unknown as Person);
      for (let t = 0; t < 30; t += STEP) {
        [a, b].forEach((p) => p.tick(STEP));
        nerf.update(STEP, [], new NavGrid(30, 30));
        if (nerf.darts.length >= 2) exchanged = true;
      }
    }
    expect(exchanged).toBe(true);
  });

  it('a random skirmish only picks people on a break, within range and in line of sight', () => {
    setSeed(2);
    const nerf = new Nerf(new THREE.Scene());
    const nav = new NavGrid(30, 30);
    const a = dev();
    const near = other(6, 5); // 1 m: too close
    const far = other(25, 5); // 20 m: too far
    const sitting = other(10, 5);
    sitting.sit = 1;
    const working = other(10, 6);
    (working as unknown as { task: object }).task = {};
    expect(nerf.find(asPeople(a, near, far, sitting, working), nav)).toBeNull();
    const ok = other(10, 7);
    const pair = nerf.find(asPeople(a, near, far, sitting, working, ok), nav);
    expect(pair?.[0]).toBe(a);
    expect(pair?.[1]).toBe(ok);
    nav.block(7, 4, 1, 4); // a wall in between
    expect(nerf.find(asPeople(a, ok), nav)).toBeNull();
    // only devs shoot
    expect(nerf.find(asPeople(other(5, 5), ok), new NavGrid(30, 30))).toBeNull();
  });

  it('now and then a skirmish starts by itself', () => {
    setSeed(4);
    const nerf = new Nerf(new THREE.Scene());
    const a = dev();
    const b = other(9, 5);
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
    expect(started).toBeLessThanOrEqual(8); // "now and then", not all the time
  });

  it('too many darts on the floor: the oldest fade early', () => {
    setSeed(6);
    const scene = new THREE.Scene();
    const nerf = new Nerf(scene);
    const a = dev();
    const b = other(9, 5);
    // fill the floor, then one more shot
    for (let i = 0; i < MAX_DARTS; i++) {
      const d = new Dart({ x: i * 0.1, y: 0.02, z: 0 }, { vx: 0, vy: 0, vz: 0, t: 1 }, false);
      d.step(STEP);
      nerf.darts.push(d);
      scene.add(d.mesh);
    }
    nerf.start(a as unknown as Person, b as unknown as Person);
    run(nerf, [a, b], 1.2);
    expect(nerf.darts.length).toBeLessThanOrEqual(MAX_DARTS + 1);
    run(nerf, [a, b], 2);
    expect(nerf.darts.length).toBeLessThanOrEqual(MAX_DARTS);
  });
});
