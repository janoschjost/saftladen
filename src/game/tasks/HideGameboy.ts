import * as THREE from 'three';
import type { DayCtx, DayMeter, DayTask } from '../Day';
import type { NavGrid, Vec2 } from '../NavGrid';
import type { Person } from '../Person';
import { random } from '../rng';

const BOSS = 'larissa-lanker';
const KEY = 'Space';
const GOAL = 24; // seconds with the console out
const AWAY = { min: 2.4, max: 5.6 }; // seconds she looks at her work; the longer you play, the shorter
const WARN = { from: 0.95, to: 0.55 }; // seconds of "something is up" before she turns
const LOOK = { min: 1.4, max: 2.6 }; // seconds she stares at you
const TURN_RATE = 0.35; // multiplier on the normal turn speed: a visible turn, not a snap
const SEEN_CONE = 1.0; // rad: she sees the console while she faces you within this angle
const SHOWN = 0.35; // console counts as out while its eased amount is above this
const GATHER_TIMEOUT = 20;
const WARN_LINES = ['Hmm …', 'Was war das?', 'Moment …', 'Jeerapat?', '*räusper*'];
const CAUGHT_LINES = ['Jeerapat! Arbeiten!', 'Erwischt!', 'Schon wieder der Gameboy?!', 'Gib her das Ding!'];
const MOODS = { safe: new THREE.Color('#8cf6c9'), warn: new THREE.Color('#f5c518'), danger: new THREE.Color('#e6563c') };

type Phase = 'gather' | 'away' | 'warn' | 'look';

const angleDiff = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Task 1 of Jeerapat's day: red light, green light. He sits at his desk and plays the handheld (hold space); Larissa stands somewhere with her back turned and now and then turns around. Stop and hide it in time, or she catches him. */
export class HideGameboy implements DayTask {
  readonly title = 'Gameboy spielen';
  readonly needs = [BOSS];
  readonly walk = false;
  failed: string | null = null;

  private phase: Phase = 'gather';
  private timer = 0;
  private played = 0;
  private gather = 0;
  private clock = 0;
  private ctx: DayCtx | null = null;
  private boss: Person | null = null;
  private me: Person | null = null;
  private awayYaw = 0;
  private faceYaw = 0;
  private spot: Vec2 | null = null;
  private props: THREE.Group | null = null;
  private ring: THREE.Mesh | null = null;
  private cone: THREE.Mesh | null = null;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private audio: AudioContext | null = null;
  private blipClock = 0;
  private blipStep = 0;

  get progress(): string {
    return this.phase === 'gather' ? 'Larissa kommt …' : `${Math.min(100, Math.floor((this.played / GOAL) * 100))} %`;
  }

  get done(): boolean {
    return this.played >= GOAL;
  }

  get ready(): boolean {
    return this.phase !== 'gather';
  }

  get targets(): readonly Vec2[] {
    return [];
  }

  /** the bar: how far the level is, coloured like a traffic light */
  get meter(): DayMeter | null {
    if (this.phase === 'gather') return null;
    const mood = this.phase === 'look' ? 'danger' : this.phase === 'warn' ? 'warn' : 'safe';
    const label = this.phase === 'look' ? 'Sie schaut! Weg damit!' : this.phase === 'warn' ? 'Achtung …' : 'Leertaste halten zum Spielen';
    return { label, value: this.played / GOAL, mood };
  }

  start(ctx: DayCtx): void {
    this.ctx = ctx;
    this.me = ctx.person;
    this.boss = ctx.other(BOSS);
    if (!ctx.seat(ctx.person) || !this.boss) {
      // nobody to hide from / nowhere to sit: nothing to play
      this.played = GOAL;
      return;
    }
    this.spot = this.pickSpot(ctx.nav, ctx.person.pos, ctx.person.yaw);
    this.faceYaw = Math.atan2(ctx.person.pos.x - this.spot.x, ctx.person.pos.z - this.spot.z);
    this.awayYaw = this.faceYaw + Math.PI;
    ctx.pin(this.boss, { at: this.spot, yaw: this.awayYaw, turn: TURN_RATE, walk: true });

    const ring = new THREE.RingGeometry(0.42, 0.58, 32).rotateX(-Math.PI / 2);
    const half = SEEN_CONE;
    const cone = new THREE.CircleGeometry(6, 32, Math.PI / 2 - half, half * 2).rotateX(Math.PI / 2);
    this.geometries.push(ring, cone);
    const ringMat = new THREE.MeshBasicMaterial({ color: MOODS.safe, transparent: true, opacity: 0.9, depthWrite: false });
    const coneMat = new THREE.MeshBasicMaterial({ color: MOODS.danger, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.materials.push(ringMat, coneMat);
    this.ring = new THREE.Mesh(ring, ringMat);
    this.cone = new THREE.Mesh(cone, coneMat);
    this.ring.position.y = 0.03;
    this.cone.position.y = 0.025;
    this.props = new THREE.Group();
    this.props.add(this.ring, this.cone);
    this.props.position.set(this.spot.x, 0, this.spot.z);
    ctx.scene.add(this.props);
    try {
      this.audio = new AudioContext();
    } catch {
      this.audio = null; // no sound, the screen tells
    }
  }

  update(dt: number, ctx: DayCtx): void {
    const me = this.me;
    const boss = this.boss;
    if (!me || !boss || this.done) return;
    this.clock += dt;

    if (this.phase === 'gather') {
      this.gather += dt;
      if (boss.scripted?.arrived || this.gather > GATHER_TIMEOUT) {
        if (!boss.scripted?.arrived) ctx.pin(boss, { at: this.spot!, yaw: this.awayYaw, turn: TURN_RATE });
        this.begin();
      }
      return;
    }

    const exposed = me.gameboy > SHOWN;
    const playing = ctx.keys.has(KEY);
    me.gameboyOn = playing;

    this.timer -= dt;
    if (this.timer <= 0) this.next(ctx);

    if (exposed && angleDiff(boss.yaw, this.faceYaw) < SEEN_CONE) return this.caught(ctx);

    if (playing) {
      this.played += dt;
      this.blip(dt);
    } else this.blipClock = 0;
    this.updateMarker(boss);
  }

  dispose(): void {
    const ctx = this.ctx;
    if (ctx && this.boss) ctx.release(this.boss);
    if (ctx && this.me) ctx.release(this.me);
    if (this.props) ctx?.scene.remove(this.props);
    this.props = null;
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    void this.audio?.close();
    this.audio = null;
  }

  private begin(): void {
    this.phase = 'away';
    this.timer = 2.2;
  }

  /** The next step of her routine: look at the work, give a hint, turn around, turn back. */
  private next(ctx: DayCtx): void {
    const boss = this.boss!;
    const level = Math.min(1, this.played / GOAL);
    switch (this.phase) {
      case 'away': {
        this.phase = 'warn';
        this.timer = WARN.from + (WARN.to - WARN.from) * level;
        boss.faceTo(this.awayYaw + (Math.sin(this.clock * 3) > 0 ? 0.55 : -0.55)); // a half turn of the head and shoulders: the hint
        if (random() < 0.7) ctx.say(WARN_LINES[Math.floor(random() * WARN_LINES.length)], boss);
        this.tone(220, 0.12, 'triangle', 0.08);
        break;
      }
      case 'warn':
        this.phase = 'look';
        this.timer = LOOK.min + random() * (LOOK.max - LOOK.min);
        boss.faceTo(this.faceYaw);
        break;
      default:
        this.phase = 'away';
        this.timer = AWAY.max - (AWAY.max - AWAY.min) * level * 0.7 - random() * (AWAY.max - AWAY.min) * 0.5;
        boss.faceTo(this.awayYaw);
    }
  }

  private caught(ctx: DayCtx): void {
    this.failed = 'Larissa hat dich beim Gameboy erwischt.';
    this.me!.gameboyOn = true;
    ctx.say(CAUGHT_LINES[Math.floor(random() * CAUGHT_LINES.length)], this.boss!);
    for (let i = 0; i < 3; i++) this.tone(260 - i * 55, 0.16, 'sawtooth', 0.1, i * 0.14);
  }

  /** Ring under her feet and the cone of her view: green while she works, yellow on the hint, red while she can see you. */
  private updateMarker(boss: Person): void {
    if (!this.ring || !this.cone) return;
    const danger = angleDiff(boss.yaw, this.faceYaw) < SEEN_CONE;
    const color = danger ? MOODS.danger : this.phase === 'warn' ? MOODS.warn : MOODS.safe;
    (this.ring.material as THREE.MeshBasicMaterial).color.lerp(color, 0.3);
    const coneMat = this.cone.material as THREE.MeshBasicMaterial;
    coneMat.color.lerp(color, 0.3);
    coneMat.opacity += ((danger ? 0.3 : this.phase === 'warn' ? 0.16 : 0) - coneMat.opacity) * 0.25;
    this.cone.rotation.y = boss.yaw;
  }

  /** A free spot 3-7 m in front of the desk, on the side the player looks to, ideally with a clear line to the chair. */
  private pickSpot(nav: NavGrid, from: Vec2, yaw: number): Vec2 {
    const free = (cx: number, cz: number) => {
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!nav.walkable(cx + dx, cz + dz)) return false;
      return true;
    };
    const scored: Array<{ c: Vec2; score: number }> = [];
    for (let cz = 1; cz < nav.rows - 1; cz++) {
      for (let cx = 1; cx < nav.cols - 1; cx++) {
        if (!free(cx, cz)) continue;
        const c = nav.center(cx, cz);
        const d = Math.hypot(c.x - from.x, c.z - from.z);
        if (d < 3 || d > 7.5) continue;
        const ang = angleDiff(Math.atan2(c.x - from.x, c.z - from.z), yaw);
        if (ang > 1.1) continue;
        scored.push({ c, score: Math.abs(d - 4.5) * 0.6 + ang * 1.6 + (nav.lineClear(from, c, 1) ? 0 : 1.2) });
      }
    }
    scored.sort((a, b) => a.score - b.score);
    const pick = scored[Math.floor(random() * Math.min(4, scored.length))];
    if (pick) return pick.c;
    return nav.nearestWalkable({ x: from.x + Math.sin(yaw) * 4.5, z: from.z + Math.cos(yaw) * 4.5 }, 8) ?? { x: from.x + Math.sin(yaw) * 4.5, z: from.z + Math.cos(yaw) * 4.5 };
  }

  /** A few chip-tune notes a second while the console is out. */
  private blip(dt: number): void {
    this.blipClock -= dt;
    if (this.blipClock > 0) return;
    this.blipClock = 0.16 + (this.blipStep % 4 === 3 ? 0.1 : 0);
    const notes = [523, 659, 784, 659, 988, 784, 659, 523];
    this.tone(notes[this.blipStep++ % notes.length], 0.09, 'square', 0.03);
  }

  private tone(freq: number, seconds: number, type: OscillatorType, volume: number, delay = 0): void {
    const a = this.audio;
    if (!a) return;
    if (a.state === 'suspended') void a.resume();
    const t = a.currentTime + delay;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + seconds);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }
}
