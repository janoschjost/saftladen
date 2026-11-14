import { fxRandom as random } from './rng'; // presentation, runs per frame: never shifts the simulation's dice
import { screenKindOf } from '../data/screens';
import type { ScreenKind } from '../render/screens';

/** What a seated person is doing right now. Other systems (e.g. live screens) read this, never the pose numbers. */
export type DeskActivity = 'type' | 'mouse' | 'read' | 'lean';

/** How the work time splits between typing and mouse by kind of work; the rest is reading, leaning back. */
const MIX: Record<ScreenKind, { type: number; mouse: number }> = {
  code: { type: 0.62, mouse: 0.1 },
  design: { type: 0.16, mouse: 0.58 },
  sheet: { type: 0.42, mouse: 0.34 },
  docs: { type: 0.5, mouse: 0.2 },
  data: { type: 0.36, mouse: 0.3 },
  media: { type: 0.3, mouse: 0.42 },
};

/** Arm and body offsets for one frame, added by the renderer on top of the seated rig (radians / metres). */
export interface DeskPose {
  armL: number; // shoulder x
  armR: number;
  armRz: number; // right arm sideways (mouse hand sliding)
  elbowL: number;
  elbowR: number;
  lean: number; // body pitch, negative = back
  turn: number; // body yaw: glance towards the side
  bob: number; // body height
}

const DUR: Record<DeskActivity, [number, number]> = { type: [6, 22], mouse: [5, 16], read: [2, 6], lean: [2.5, 6] };

/** Typing and mouse work of one seated person: a small state machine plus smoothed pose values. */
export class DeskWork {
  activity: DeskActivity = 'type';
  /** 0..1, how much the hands are actually hitting keys right now (bursts and pauses inside a typing spell) */
  typeAmt = 0;
  /** 0..1, how much the mouse hand is moving */
  mouseAmt = 0;
  /** 1 for a moment after a click, a scroll tick or a key burst starts; for effects that react to input */
  click = 0;
  readonly pose: DeskPose = { armL: -1.2, armR: -1.2, armRz: 0, elbowL: 0, elbowR: 0, lean: 0, turn: 0, bob: 0 };

  private t = random() * 50; // own clock, so nobody moves in sync
  private left: number;
  private burst = 0; // seconds left in the current key burst (0 = pause)
  private pause = 0;
  private scrollT = 0;
  private clickIn = 1 + random() * 3;
  private glance = 0; // target yaw
  private glanceIn = 3 + random() * 8;
  private readonly fl = 9 + random() * 4; // finger rate of each hand
  private readonly fr = 8 + random() * 4;
  private readonly mix: { type: number; mouse: number };

  constructor(role: string, private readonly restless = false) {
    this.mix = MIX[screenKindOf(role)];
    this.left = 2 + random() * 6;
    if (random() < this.mix.mouse / (this.mix.mouse + this.mix.type)) this.activity = 'mouse';
  }

  /** Back to the start of a sitting. */
  reset(): void {
    this.typeAmt = this.mouseAmt = this.click = 0;
    Object.assign(this.pose, { armL: -1.2, armR: -1.2, armRz: 0, elbowL: 0, elbowR: 0, lean: 0, turn: 0, bob: 0 });
    this.left = 1 + random() * 4;
  }

  private pick(): DeskActivity {
    const m = this.mix;
    const lean = this.restless ? 0.14 : 0.05;
    const read = 0.14;
    const r = random() * (m.type + m.mouse + read + lean);
    let next: DeskActivity = r < m.type ? 'type' : r < m.type + m.mouse ? 'mouse' : r < m.type + m.mouse + read ? 'read' : 'lean';
    if (next === this.activity && (next === 'lean' || next === 'read')) next = 'type'; // no two breaks in a row
    return next;
  }

  update(dt: number): void {
    this.t += dt;
    this.left -= dt;
    if (this.left <= 0) {
      this.activity = this.pick();
      const [a, b] = DUR[this.activity];
      this.left = (a + random() * (b - a)) * (this.restless ? 0.6 : 1);
      this.burst = 0;
      this.pause = 0;
    }
    const act = this.activity;
    this.click = Math.max(0, this.click - dt * 5);

    // typing: bursts of 1.5-6 s separated by thinking pauses of 0.5-3 s
    let typing = false;
    if (act === 'type') {
      if (this.burst > 0) {
        this.burst -= dt;
        typing = true;
        if (this.burst <= 0) this.pause = 0.5 + random() * 2.5;
      } else if ((this.pause -= dt) <= 0) {
        this.burst = 1.5 + random() * 4.5;
        this.click = 1;
      }
    }
    // mouse: the hand wanders, now and then a click or a scroll
    let mousing = false;
    if (act === 'mouse') {
      mousing = true;
      if ((this.clickIn -= dt) <= 0) {
        this.clickIn = 0.6 + random() * 3.5;
        this.click = 1;
        if (random() < 0.3) this.scrollT = 0.5 + random() * 0.8;
      }
    }
    this.scrollT = Math.max(0, this.scrollT - dt);

    const k = Math.min(1, dt * 7);
    this.typeAmt += ((typing ? 1 : 0) - this.typeAmt) * k;
    this.mouseAmt += ((mousing ? 1 : 0) - this.mouseAmt) * Math.min(1, dt * 4);

    // glances at the screen / sideways, mostly while reading or thinking
    if ((this.glanceIn -= dt) <= 0) {
      this.glanceIn = 2 + random() * 9;
      this.glance = random() < 0.5 ? 0 : (random() - 0.5) * (act === 'read' ? 0.5 : 0.3);
    }

    const t = this.t;
    const p = this.pose;
    const ta = this.typeAmt;
    const ma = this.mouseAmt;
    // alternating hands: each hand strokes in its own rhythm, gated by the burst
    const strokeL = Math.max(0, Math.sin(t * this.fl)) * Math.max(0, Math.sin(t * 2.3 + 1)) * 0.34 + Math.sin(t * 5.3) * 0.08;
    const strokeR = Math.max(0, Math.sin(t * this.fr + 2)) * Math.max(0, Math.sin(t * 2.9)) * 0.34 + Math.sin(t * 4.1) * 0.08;
    const lean = act === 'lean' ? 1 : 0;
    const read = act === 'read' ? 1 : 0;

    const wander = Math.sin(t * 0.9) * 0.6 + Math.sin(t * 1.7 + 1) * 0.4;
    const scroll = this.scrollT > 0 ? Math.sin(t * 22) * 0.07 : 0;
    const tgt: DeskPose = {
      // hands rise a little off the keys while leaning, rest on them when reading
      armL: -1.2 + strokeL * ta + 0.05 * Math.sin(t * 0.8) * (1 - ta) + lean * 0.6 + read * 0.05 - ma * 0.03,
      armR: -1.2 + strokeR * ta + 0.05 * Math.sin(t * 0.7) * read + lean * 0.6 + ma * (0.08 + wander * 0.22 - this.click * 0.14) + scroll * ma,
      armRz: ma * (wander * 0.32 + Math.sin(t * 2.1) * 0.05),
      elbowL: -0.22 * ta * Math.max(0, Math.sin(t * this.fl)),
      elbowR: -0.22 * ta * Math.max(0, Math.sin(t * this.fr + 2)) - ma * (0.08 + this.click * 0.2),
      lean: -0.13 * lean + 0.05 * read + 0.025 * ta + Math.sin(t * 0.35) * 0.01,
      turn: this.glance * (1 - ta * 0.6),
      bob: Math.sin(t * 1.3) * 0.006 + (lean ? -0.01 : 0),
    };
    // lean and glance ease slowly, hands quickly
    const slow = Math.min(1, dt * 2.5);
    const fast = Math.min(1, dt * 12);
    p.armL += (tgt.armL - p.armL) * fast;
    p.armR += (tgt.armR - p.armR) * fast;
    p.armRz += (tgt.armRz - p.armRz) * fast;
    p.elbowL += (tgt.elbowL - p.elbowL) * fast;
    p.elbowR += (tgt.elbowR - p.elbowR) * fast;
    p.lean += (tgt.lean - p.lean) * slow;
    p.turn += (tgt.turn - p.turn) * slow;
    p.bob = tgt.bob;
  }
}
