import * as THREE from 'three';
import { WORLD } from '../render/World';
import type { SkyRig } from './TimeOfDay';
import { Dog } from './Dog';
import { Person } from './Person';
import type { Walker } from './Walker';
import { random } from './rng';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'];
const DISCO_SECONDS = 14;
const BPM = 124;
const CLICK_GAP = 2.5; // seconds between clicks that still count as one series
const PERSON_CLICKS = 7;
const DOG_CLICKS = 5;
const ANGRY_SECONDS = 2.4;
const FLIP_SECONDS = 1.1;
const LIGHTS = 4;
const LIGHT_PEAK = 38;

const ANGRY_LINES = ['Hör auf zu klicken!', 'Ich brauch frische Luft!', 'Jetzt reicht es!', 'Ich hol mir einen Kaffee. Allein.'];

/** Hidden gags: Konami code = office disco, 7 clicks on a person = they storm off, 5 clicks on a pet = backflip. */
export class Easter {
  /** 0..1 eased disco amount (people dance, coloured lights, dimmed daylight) */
  disco = 0;
  /** disco beat, counted in beats */
  beat = 0;
  /** person who is fed up with the clicking, and the bubble line they say */
  angry: { who: Person; text: string; t: number } | null = null;

  private discoT = 0;
  private seq = 0;
  private flips = new Map<Dog, number>();
  private series: { who: Walker; n: number; t: number } | null = null;
  private lights: THREE.PointLight[] = [];
  private clock = 0;

  /** The lights always exist (a changing light count would recompile every material); they are just dark. */
  constructor(scene: THREE.Scene) {
    for (let i = 0; i < LIGHTS; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 16, 2);
      l.position.set(WORLD.width * (0.14 + (i / (LIGHTS - 1)) * 0.74), 2.8, WORLD.depth * (i % 2 ? 0.62 : 0.38));
      scene.add(l);
      this.lights.push(l);
    }
  }

  get discoOn(): boolean {
    return this.discoT > 0;
  }

  /** Feeds the Konami sequence; true when this key completed it (the key then does nothing else). */
  key(e: KeyboardEvent): boolean {
    // held keys repeat and modifiers are not part of the code: neither may break the sequence
    if (e.repeat || /^(Shift|Control|Alt|Meta|CapsLock)/.test(e.code)) return false;
    const code = e.code;
    this.seq = code === KONAMI[this.seq] ? this.seq + 1 : code === KONAMI[0] ? 1 : 0;
    if (this.seq !== KONAMI.length) return false;
    this.seq = 0;
    this.discoT = DISCO_SECONDS;
    return true;
  }

  /** A click on a walker. Returns nothing; the effects show up in `angry`, `flipAngle` and the pose code. */
  click(w: Walker): void {
    const s = this.series;
    this.series = s && s.who === w && s.t > 0 ? { who: w, n: s.n + 1, t: CLICK_GAP } : { who: w, n: 1, t: CLICK_GAP };
    const n = this.series.n;
    if (w instanceof Person && n >= PERSON_CLICKS && !this.angry && !w.held && !w.controlled) {
      this.angry = { who: w, text: ANGRY_LINES[Math.floor(random() * ANGRY_LINES.length)], t: ANGRY_SECONDS };
      this.series = null;
    } else if (w instanceof Dog && n >= DOG_CLICKS && !this.flips.has(w)) {
      this.flips.set(w, 0);
      w.bark();
      this.series = null;
    }
  }

  /** Backflip progress of a pet as an angle in radians (0 when idle) and the jump height in metres. */
  flip(d: Dog): { angle: number; jump: number } | null {
    const t = this.flips.get(d);
    if (t === undefined) return null;
    const p = Math.min(1, t / FLIP_SECONDS);
    const e = p * p * (3 - 2 * p);
    return { angle: -e * Math.PI * 2, jump: Math.sin(p * Math.PI) * 0.9 };
  }

  /** Returns the person who finished being angry and should now leave. */
  update(dt: number): Person | null {
    this.clock += dt;
    if (this.series && (this.series.t -= dt) <= 0) this.series = null;
    for (const [d, t] of this.flips) {
      if (t + dt >= FLIP_SECONDS) this.flips.delete(d);
      else this.flips.set(d, t + dt);
    }

    this.discoT = Math.max(0, this.discoT - dt);
    const target = this.discoT > 0 ? 1 : 0;
    this.disco += THREE.MathUtils.clamp(target - this.disco, -dt * 1.2, dt * 2);
    if (this.disco > 0.001) this.beat += (dt * BPM) / 60;
    else this.disco = 0;
    const pulse = 0.55 + 0.45 * Math.abs(Math.cos(this.beat * Math.PI));
    this.lights.forEach((l, i) => {
      l.color.setHSL((this.clock * 0.3 + i * 0.25) % 1, 1, 0.5);
      l.intensity = this.disco * LIGHT_PEAK * pulse;
    });

    let gone: Person | null = null;
    if (this.angry) {
      if ((this.angry.t -= dt) <= 0 || this.angry.who.away) {
        if (!this.angry.who.away) gone = this.angry.who;
        this.angry = null;
      }
    }
    return gone;
  }

  /** Dims the daylight while the disco runs (call after `applySky`). */
  dim(sky: SkyRig): void {
    if (this.disco <= 0) return;
    sky.sun.intensity *= 1 - 0.6 * this.disco;
    sky.hemi.intensity *= 1 - 0.5 * this.disco;
  }
}
