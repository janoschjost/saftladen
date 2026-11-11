import * as THREE from 'three';
import { box, merge, propMaterial } from '../../render/geo';
import type { DayCtx, DayTask } from '../Day';
import type { Vec2 } from '../NavGrid';
import { spreadSpots } from './spots';

const COUNT = 6;
const AT_ONCE = 3; // phones ringing at the same time
const PICKUP_RADIUS = 0.8;
const RING_GAP = 1.6; // seconds between two rings
const QUIPS = ['Saftladen, Hasler?', 'Moment, ich verbinde.', 'Ja, kommt heute noch.', 'Wir melden uns!', 'Falsch verbunden …', 'Bitte nicht auflegen!', 'Kann ich zurückrufen?'];

const beamMaterial = new THREE.MeshBasicMaterial({ color: '#ff7a5c', transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide });

interface Phone {
  group: THREE.Group;
  body: THREE.Object3D;
  waves: THREE.Mesh[];
  pos: Vec2;
  phase: number;
}

/** Task 2 of Jan's day: phones ring all over the office, a few at a time. Run to each one and pick it up. */
export class PhoneRush implements DayTask {
  readonly title = 'Telefone abnehmen';
  private spots: Vec2[] = [];
  private active: Phone[] = [];
  private spawned = 0;
  private got = 0;
  private clock = 0;
  private ringClock = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private phoneGeo: THREE.BufferGeometry | null = null;
  private beamGeo: THREE.BufferGeometry | null = null;
  private waveGeo: THREE.BufferGeometry | null = null;
  private scene: THREE.Scene | null = null;
  private audio: AudioContext | null = null;

  get progress(): string {
    return `${this.got} / ${COUNT}`;
  }

  get done(): boolean {
    return this.got >= COUNT;
  }

  get targets(): readonly Vec2[] {
    return this.active.map((p) => p.pos);
  }

  start(ctx: DayCtx): void {
    this.scene = ctx.scene;
    this.spots = spreadSpots(ctx, COUNT);
    this.phoneGeo = merge([
      box(0.2, 0.06, 0.16, 0, 0, 0, '#26272c'), // base
      box(0.22, 0.04, 0.06, 0, 0.065, -0.03, '#e6563c'), // handset bar
      box(0.06, 0.07, 0.07, -0.1, 0.045, -0.03, '#e6563c'), // earpiece
      box(0.06, 0.07, 0.07, 0.1, 0.045, -0.03, '#e6563c'), // mouthpiece
      box(0.1, 0.012, 0.06, 0, 0.036, 0.04, '#9aa0a8'), // keypad
    ]);
    this.beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 7, 12, 1, true).translate(0, 3.5, 0);
    this.waveGeo = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2);
    this.geometries.push(this.phoneGeo, this.beamGeo, this.waveGeo);
    try {
      this.audio = new AudioContext();
    } catch {
      this.audio = null; // no sound, the shaking phones still tell
    }
    while (this.active.length < AT_ONCE && this.spawned < COUNT) this.spawn();
  }

  update(dt: number, ctx: DayCtx): void {
    this.clock += dt;
    const me = ctx.person.pos;
    let nearest = Infinity;
    for (const p of [...this.active]) {
      // ringing: the phone jumps and shakes, rings spread over the floor
      const buzz = (this.clock * 7 + p.phase) % 2.4 < 0.9 ? 1 : 0;
      p.body.position.y = 0.85 + Math.sin(this.clock * 3 + p.phase) * 0.06 + buzz * Math.abs(Math.sin(this.clock * 40)) * 0.05;
      p.body.rotation.z = buzz * Math.sin(this.clock * 55) * 0.12;
      p.body.rotation.y += dt * 1.2;
      p.waves.forEach((w, i) => {
        const u = (this.clock * 0.9 + i / p.waves.length + p.phase) % 1;
        w.scale.setScalar(0.4 + u * 1.8);
        (w.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.7;
      });
      const d = Math.hypot(p.pos.x - me.x, p.pos.z - me.z);
      nearest = Math.min(nearest, d);
      if (d > PICKUP_RADIUS) continue;
      this.active.splice(this.active.indexOf(p), 1);
      this.scene?.remove(p.group);
      this.got++;
      ctx.person.takeCall(3.5);
      ctx.say(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
      if (this.spawned < COUNT) this.spawn();
    }
    this.ringClock -= dt;
    if (this.ringClock <= 0 && this.active.length) {
      this.ringClock = RING_GAP;
      this.ring(Math.max(0.03, 0.22 - nearest * 0.012));
    }
  }

  dispose(): void {
    this.active.forEach((p) => this.scene?.remove(p.group));
    this.active = [];
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
    this.materials.forEach((m) => m.dispose());
    this.materials = [];
    void this.audio?.close();
    this.audio = null;
  }

  private spawn(): void {
    const pos = this.spots[this.spawned++];
    if (!pos || !this.scene) return;
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    const body = new THREE.Mesh(this.phoneGeo!, propMaterial);
    body.scale.setScalar(2.6);
    body.castShadow = true;
    group.add(body, new THREE.Mesh(this.beamGeo!, beamMaterial));
    const waves = [0, 1].map(() => {
      const m = new THREE.MeshBasicMaterial({ color: '#ff7a5c', transparent: true, depthWrite: false });
      this.materials.push(m);
      const w = new THREE.Mesh(this.waveGeo!, m);
      w.position.y = 0.03;
      group.add(w);
      return w;
    });
    this.scene.add(group);
    this.active.push({ group, body, waves, pos, phase: this.spawned * 0.9 });
  }

  /** Classic double-trill, louder the closer the nearest phone is. */
  private ring(volume: number): void {
    const ctx = this.audio;
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = i % 2 ? 1250 : 1000;
      const t = t0 + i * 0.07;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume * 0.25, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + 0.065);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  }
}
