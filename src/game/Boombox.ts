import * as THREE from 'three';
import { box, cyl, merge, propMaterial } from '../render/geo';
import type { Desk } from './Office';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Person } from './Person';
import { onBreak } from './PetCare';
// own stream (`fxRandom`): the gag never shifts the simulation's numbers, so a seed replays everything else as before
import { fxRandom as random } from './rng';

export const DJ = 'sandro-hagen';
export const BOSS = 'donata-manser';

export const REACH = 6; // metres between the two within which she hears it
const SIGHT_SKIP = 0.8; // metres in front of her not checked for sight: the chair she sits on
export const NOTICE = 3; // seconds of music before she notices
const LOOK = 1; // seconds she stares at him (❗) before she runs
export const YELL = 3; // seconds she yells at him
export const BOB_RANGE = 3; // metres around the boombox within which people standing there bob along
const GAP = { min: 300, max: 600 }; // seconds between two tries of the gag
const RETRY = 5; // seconds before looking again when the two were not there
const RUN_MAX = 40; // seconds she may take to get to him before the scene is given up
const CARRY_MAX = 90; // seconds she may take to get back to her desk; then it is put there anyway
const GRAB = 0.8; // metres from him where she stops to take it
const NOTE_GAP = 0.3; // seconds between two notes
const NOTE_LIFE = 1.8; // seconds a note rises before it is gone
export const YELLS = ['😠', '!', '!?', '😠!!'];

const between = ({ min, max }: { min: number; max: number }) => min + random() * (max - min);

/**
 * In the office, free for the scene (Donata): at her desk or on a break, not in a meeting, call, toilet, talk or
 * errand, not in anybody's hands.
 */
export function free(p: Person): boolean {
  if (tied(p)) return false;
  return p.task ? p.task.phase === 'work' : onBreak(p);
}

/** Out, in somebody's hands, or in a meeting, call, toilet or talk: does not take part in the scene. */
function tied(p: Person): boolean {
  return !p.inOffice || p.held || p.controlled || !!p.talk || !!p.playerChat || p.inMeeting || !!p.phoneJob || p.boothCall;
}

// the boombox: a grey body with two speakers on each side, a cassette deck between them and a handle on top
const BOX = { w: 0.4, h: 0.2, d: 0.11 };
function buildBoombox(): THREE.Mesh {
  const parts = [box(BOX.w, BOX.h, BOX.d, 0, BOX.h / 2, 0, '#3b3d44')];
  for (const side of [-1, 1]) {
    for (const x of [-0.12, 0.12]) parts.push(cyl(0.062, 0.062, 0.012, 0, 0, 0, '#16171b', 14).rotateX(Math.PI / 2).translate(x, BOX.h / 2, side * (BOX.d / 2 + 0.004)));
    parts.push(box(0.1, 0.07, 0.01, 0, BOX.h / 2 + 0.02, side * (BOX.d / 2 + 0.003), '#9aa0aa')); // cassette deck
  }
  parts.push(box(0.3, 0.025, 0.03, 0, BOX.h + 0.07, 0, '#c8ccd2')); // handle
  for (const x of [-0.14, 0.14]) parts.push(box(0.02, 0.07, 0.03, x, BOX.h + 0.035, 0, '#c8ccd2'));
  const m = new THREE.Mesh(merge(parts), propMaterial);
  m.castShadow = true;
  m.userData.nonav = true;
  return m;
}

// a note (♪): head, stem and flag
const NOTE_MAT = new THREE.MeshBasicMaterial({ color: '#1c1c22' });
const NOTE_GEO = [
  new THREE.SphereGeometry(0.035, 8, 6).scale(1.25, 0.9, 0.6),
  new THREE.BoxGeometry(0.012, 0.13, 0.012).translate(0.035, 0.065, 0),
  new THREE.BoxGeometry(0.045, 0.012, 0.012).rotateZ(-0.6).translate(0.05, 0.12, 0),
];

interface Note {
  mesh: THREE.Group;
  age: number;
  drift: number;
}

type Stage = 'play' | 'look' | 'run' | 'yell' | 'carry';

interface Scene {
  dj: Person;
  boss: Person;
  stage: Stage;
  /** seconds in this stage */
  t: number;
  /** the pin that takes her to him (somebody else's pin on her ends the scene) */
  pin: Person['scripted'];
  /** where she puts the boombox */
  desk: Desk | null;
}

/**
 * Sandro's boombox (#177): now and then on his break, with Donata near enough to hear it, he pulls it out and plays
 * music. After a few seconds she notices, runs over, takes it away (the music stops), yells at him and carries it to
 * her desk, where it stays until the next working day. Visual only: notes rise from it, and who stands near it bobs
 * along. Like the Nerf skirmishes it rolls its own dice (`fxRandom`).
 */
export class Boombox {
  readonly mesh = buildBoombox();
  readonly notes: Note[] = [];
  /** people bobbing to the music this step (the player too, and whoever stands near him) */
  readonly dancers = new Set<Person>();
  /** seconds the music has been on (the beat of the bobbing) */
  beat = 0;
  /** seconds until the next look for the two (tests set it to 0 to try right away) */
  timer = between(GAP) / 2;
  /** the desk the boombox stands on (taken away today), null while it is not on a desk */
  onDesk: Desk | null = null;
  private scene: Scene | null = null;
  /** the working day it was taken away on: no more music that day */
  private takenOn = -1;
  private noteIn = 0;
  private days = 0;

  constructor(private world: THREE.Scene) {
    this.mesh.visible = false;
  }

  /** a scene is running */
  get active(): boolean {
    return !!this.scene;
  }

  /** where the scene is: the music plays, she stares, runs, yells, carries it away; null when none runs */
  get stage(): Stage | null {
    return this.scene?.stage ?? null;
  }

  /** the music plays (the notes rise, people bob) */
  get playing(): boolean {
    const s = this.scene?.stage;
    return s === 'play' || s === 'look' || s === 'run';
  }

  /** taken away today: no more music until the next working day */
  get taken(): boolean {
    return this.takenOn === this.days;
  }

  /** What one of the two says now (her ❗ and her yelling), for the speech bubbles. */
  get bubble(): { who: Person; text: string } | null {
    const s = this.scene;
    if (s?.stage === 'look') return { who: s.boss, text: '❗' };
    if (s?.stage === 'yell') return { who: s.boss, text: YELLS[Math.min(YELLS.length - 1, Math.floor((s.t / YELL) * YELLS.length))] };
    return null;
  }

  /** Sandro and Donata, when he is on a break and she is free within reach and sight; null otherwise. */
  find(people: readonly Person[], nav: NavGrid): [Person, Person] | null {
    const dj = people.find((p) => p.id === DJ);
    const boss = people.find((p) => p.id === BOSS);
    if (!dj || !boss || !onBreak(dj) || dj.sit > 0.05 || !free(boss)) return null;
    if (Math.hypot(boss.pos.x - dj.pos.x, boss.pos.z - dj.pos.z) > REACH || !nav.lineClear(dj.pos, boss.pos, SIGHT_SKIP)) return null;
    return [dj, boss];
  }

  /** `dj` stops, pulls out the boombox and plays; false when he cannot stop right now. Checks nothing else. */
  start(dj: Person, boss: Person): boolean {
    if (this.scene || dj === boss) return false;
    if (!dj.talkTo({ x: boss.pos.x, z: boss.pos.z }, NOTICE + 1, false)) return false;
    dj.speaking = false;
    dj.boomPose = 'play';
    this.scene = { dj, boss, stage: 'play', t: 0, pin: null, desk: null };
    this.beat = 0;
    this.noteIn = 0;
    this.hold(dj, 'shoulder');
    return true;
  }

  /** The boombox is gone from her desk (a new day, or the dev event wants the scene again). */
  reset(): void {
    if (this.scene) this.end();
    this.takenOn = -1;
    if (this.onDesk) this.hold(null);
  }

  update(dt: number, people: readonly Person[], nav: NavGrid, days: number): void {
    if (days !== this.days) {
      this.days = days;
      if (!this.scene && this.onDesk) this.hold(null); // a new working day: gone from her desk
    }
    if (this.scene) this.advance(this.scene, dt, nav);
    this.stepNotes(dt);
    this.dance(people);
    if (this.scene || this.taken) return;
    if ((this.timer -= dt) > 0) return;
    const pair = this.find(people, nav);
    this.timer = pair && this.start(...pair) ? between(GAP) : RETRY;
  }

  /** One step of the scene. */
  private advance(s: Scene, dt: number, nav: NavGrid): void {
    const { dj, boss } = s;
    const djGone = !dj.inOffice || dj.held || dj.controlled || dj.inMeeting || !!dj.talk || !dj.playerChat;
    const bossGone = !boss.inOffice || boss.held || boss.inMeeting;
    s.t += dt;
    switch (s.stage) {
      case 'play':
      case 'look':
      case 'run': {
        if (djGone || bossGone || (s.stage === 'look' && (boss.controlled || !boss.playerChat)) || (s.stage === 'run' && boss.scripted !== s.pin)) return this.end();
        this.beat += dt;
        this.stay(dj, boss.pos);
        if (s.stage === 'play' && s.t >= NOTICE) this.notice(s);
        else if (s.stage === 'look') {
          if (boss.playerChat) boss.playerChat.at = { x: dj.pos.x, z: dj.pos.z };
          if (s.t >= LOOK) this.chase(s, nav);
        } else if (s.stage === 'run') {
          // there, or right beside him with somebody in the way of the spot
          if (s.pin?.arrived || Math.hypot(boss.pos.x - dj.pos.x, boss.pos.z - dj.pos.z) < GRAB + 0.4) this.grab(s);
          else if (s.t >= RUN_MAX) this.end();
        }
        return;
      }
      case 'yell':
        if (bossGone || boss.scripted !== s.pin) return this.end();
        boss.faceTo(Math.atan2(dj.pos.x - boss.pos.x, dj.pos.z - boss.pos.z));
        if (!djGone) this.stay(dj, boss.pos);
        if (s.t >= YELL) this.leave(s, nav);
        return;
      case 'carry': {
        const t = boss.task;
        if (bossGone || boss.controlled || !s.desk || t?.desk !== s.desk || t.phase !== 'approach' || s.t >= CARRY_MAX) return this.end();
        return;
      }
    }
  }

  /** Keeps `p` standing where they are, facing `at`. */
  private stay(p: Person, at: Vec2): void {
    const chat = p.playerChat;
    if (!chat) return;
    chat.at = { x: at.x, z: at.z };
    chat.t = Math.max(chat.t, 0.5);
  }

  /** She hears it: stands up from her desk if she sits there, and stares at him. */
  private notice(s: Scene): void {
    const { dj, boss } = s;
    // tied up meanwhile (meeting, WC, talk, call): she does not hear it. A printout, a game of foosball or a coffee
    // run she drops for it
    if (tied(boss)) return this.end();
    boss.cancelPrint();
    boss.cancelFoos();
    boss.cancelRun();
    boss.vapeJob = null;
    s.desk = boss.task?.phase === 'work' ? boss.task.desk : null;
    boss.interrupt(); // out of the chair, the stand-up plays while she stares
    if (!boss.talkTo({ x: dj.pos.x, z: dj.pos.z }, LOOK + 1, false)) return this.end();
    boss.speaking = false;
    s.stage = 'look';
    s.t = 0;
  }

  /** She runs to him. */
  private chase(s: Scene, nav: NavGrid): void {
    const { dj, boss } = s;
    const dx = boss.pos.x - dj.pos.x;
    const dz = boss.pos.z - dj.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const spot = nav.nearestWalkable({ x: dj.pos.x + (dx / d) * GRAB, z: dj.pos.z + (dz / d) * GRAB }, 4) ?? { ...boss.pos };
    boss.playerChat = null;
    boss.pinTo({ at: spot, yaw: Math.atan2(-dx, -dz), walk: true });
    boss.rush = true;
    s.pin = boss.scripted;
    s.stage = 'run';
    s.t = 0;
  }

  /** She takes it out of his hand: the music stops; she yells, he cowers. */
  private grab(s: Scene): void {
    const { dj, boss } = s;
    boss.rush = false;
    boss.boomPose = 'scold';
    boss.boomCarry = true;
    dj.boomPose = 'cower';
    this.hold(boss, 'hand');
    this.clearNotes();
    this.takenOn = this.days;
    s.stage = 'yell';
    s.t = 0;
  }

  /** He walks on; she carries it to her desk. */
  private leave(s: Scene, nav: NavGrid): void {
    const { dj, boss } = s;
    dj.boomPose = null;
    if (dj.playerChat) dj.playerChat.t = Math.min(dj.playerChat.t, 0.3);
    boss.boomPose = null;
    boss.unpin();
    s.pin = null;
    // back to the desk she stood up from, if it is still free; else to her own or a free one
    let desk = s.desk && !s.desk.occupant && !s.desk.pending ? s.desk : null;
    if (desk) desk.occupant = boss;
    else desk = boss.office?.claim(boss) ?? null;
    s.desk = desk ?? s.desk;
    s.stage = 'carry';
    s.t = 0;
    if (desk) boss.headForDesk(desk, nav);
    else this.end(); // no desk free for her: she puts it away
  }

  /**
   * The scene is over, however it ended: nobody keeps a pose, the run or her pin. Taken away, the boombox lands on her
   * desk; still in his hand, it is put away.
   */
  private end(): void {
    const s = this.scene;
    if (!s) return;
    this.scene = null;
    const { dj, boss } = s;
    for (const p of [dj, boss]) {
      p.boomPose = null;
      p.boomCarry = false;
      p.rush = false;
      if (p.playerChat) p.playerChat.t = Math.min(p.playerChat.t, 0.3);
    }
    if (s.pin && boss.scripted === s.pin) boss.unpin();
    this.clearNotes();
    if (this.taken && s.desk) this.putOn(s.desk);
    else this.hold(null);
  }

  /** Puts the boombox on his shoulder or into her hand, or away (null). */
  private hold(p: Person | null, how: 'shoulder' | 'hand' = 'hand'): void {
    const m = this.mesh;
    m.removeFromParent();
    this.onDesk = null;
    m.visible = !!p;
    if (!p) return;
    m.rotation.set(0, Math.PI / 2, 0); // speakers to the front and back on the shoulder, along the leg in the hand
    if (how === 'shoulder') {
      // on the right shoulder, beside the head, speakers to the front and back
      p.rig.body.add(m);
      m.position.set(0.3, 1.52, 0);
    } else {
      // hanging by the handle from the fist, along the leg
      p.rig.elbowR.add(m);
      m.position.set(0, -0.62, 0);
    }
  }

  /** Puts the boombox on the desk top, left of the keyboard. */
  private putOn(desk: Desk): void {
    const m = this.mesh;
    m.removeFromParent();
    desk.root.add(m);
    m.position.set(-0.5, 0.75, 0.05);
    m.rotation.set(0, 0.25, 0);
    m.visible = true;
    this.onDesk = desk;
  }

  /** Who bobs this step: him while it plays, and everybody standing still near him. */
  private dance(people: readonly Person[]): void {
    this.dancers.clear();
    const s = this.scene;
    if (!s || !this.playing) return;
    this.dancers.add(s.dj);
    for (const p of people) {
      if (p === s.boss || p === s.dj || !p.inOffice || p.held || p.sit > 0.05 || p.moving > 0.2) continue;
      if (Math.hypot(p.pos.x - s.dj.pos.x, p.pos.z - s.dj.pos.z) <= BOB_RANGE) this.dancers.add(p);
    }
  }

  /** Notes rise from the boombox while it plays, and drift and shrink away. */
  private stepNotes(dt: number): void {
    const s = this.scene;
    if (s && this.playing && (this.noteIn -= dt) <= 0) {
      this.noteIn = NOTE_GAP;
      const mesh = new THREE.Group();
      for (const geo of NOTE_GEO) mesh.add(new THREE.Mesh(geo, NOTE_MAT));
      const scale = s.dj.root.scale.y;
      const yaw = s.dj.yaw + Math.PI / 2; // his right
      mesh.position.set(s.dj.pos.x + Math.sin(yaw) * 0.25 * scale, 1.75 * scale, s.dj.pos.z + Math.cos(yaw) * 0.25 * scale);
      mesh.rotation.y = random() * Math.PI * 2;
      this.world.add(mesh);
      this.notes.push({ mesh, age: 0, drift: (random() - 0.5) * 0.6 });
    }
    for (let i = this.notes.length - 1; i >= 0; i--) {
      const n = this.notes[i];
      n.age += dt;
      if (n.age >= NOTE_LIFE) {
        n.mesh.removeFromParent();
        this.notes.splice(i, 1);
        continue;
      }
      n.mesh.position.y += 0.45 * dt;
      n.mesh.position.x += n.drift * dt;
      n.mesh.rotation.y += dt * 1.5;
      n.mesh.scale.setScalar(Math.min(1, n.age / 0.2) * (1 - Math.max(0, (n.age - NOTE_LIFE * 0.6) / (NOTE_LIFE * 0.4))) + 0.001);
    }
  }

  private clearNotes(): void {
    for (const n of this.notes) n.mesh.removeFromParent();
    this.notes.length = 0;
  }
}
