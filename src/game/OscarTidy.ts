import { OSCAR_LINES, type OscarLineKind } from '../data/oscarLines';
import { bubbleSeconds } from '../data/sonLines';
import { setPoliceCap } from '../render/characterBuilder';
import { free as freeForScene } from './Boombox';
import { WORK_TIME } from './Christian';
import type { MessItem } from './Mess';
import type { Vec2 } from './NavGrid';
import type { Desk } from './Office';
import type { Person } from './Person';
import { stream } from './rng';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

/** Oscar Grob, the apprentice who sees himself as a follower of Christian (#296). */
export const TIDIER = 'oscar-grob';
/** While he is in the office the team leaves this much more mess (`Mess.chance`). */
export const MESS_BOOST = 2;
/** Clock hours between two outings, drawn per outing (also from his arrival to the first). */
export const TIDY_GAP = { min: 1, extra: 1 };
/** Pieces he takes per outing: `PIECES.min` plus up to `PIECES.extra`. */
export const PIECES = { min: 2, extra: 1 };
/** Game seconds before he looks again when it was not the moment (nothing lying around, or he was busy). */
export const RETRY = 60;
/** How far from a piece he stands to take it (m). */
const STAND_OFF = 0.5;
/** A piece whose nearest free spot is farther than this (m) is out of his reach: on a desk in a corner, behind furniture. */
const REACH = 1.3;
/** Seconds the walk to a piece may take; then he leaves it and goes on. */
const WALK_MAX = 40;
/** Seconds the walk back may take; then the outing is over all the same. */
const BACK_MAX = 90;
/** Each bubble is up at least this long (s), then a short pause (min, plus up to extra). */
export const MIN_BUBBLE = 3;
const GAP = { min: 0.6, extra: 0.8 };
/** The lines that must not get lost when his bubble is busy. */
const IMPORTANT: ReadonlySet<OscarLineKind> = new Set(['lunchbox', 'bin', 'done']);

type Stage = 'walk' | 'pick' | 'back';

interface Outing {
  stage: Stage;
  /** seconds in this stage */
  t: number;
  /** the pin that walks him to the piece (somebody else's pin, or steering, ends the outing) */
  pin: Person['scripted'];
  /** the piece he goes for, and whether it is taken yet */
  item: MessItem | null;
  took: boolean;
  /** pieces still to take */
  left: number;
  /** the desk he walks back to */
  desk: Desk | null;
  /** pieces he gave up on this outing (no way there): not tried again */
  skip: Set<MessItem>;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Oscar tidies up (#296): every 1 to 2 clock hours, when he is free and something lies around, he puts on a police cap,
 * walks to the nearest piece of mess, bends down and takes it, then the next one, 2 to 3 per outing, and walks back
 * to his desk, where the cap comes off. He mutters Chrigi lines on the way. Rolls its own dice.
 */
export class OscarTidy {
  /** what his bubble says now (null: nothing) */
  text: string | null = null;
  /** game seconds until the next outing while he is in; null: not in yet today (the first is 1 to 2 hours after he comes) */
  nextIn: number | null = null;
  private job: Outing | null = null;
  private days: number;
  private textT = 0;
  private gapT = 0;
  private lastLine = '';
  private pending: OscarLineKind | null = null;
  private readonly rnd = stream(0x05ca7);

  /** Oscar himself */
  readonly oscar: Person;

  constructor(private readonly sim: Sim) {
    this.oscar = sim.person(TIDIER);
    this.days = sim.presence.days;
  }

  /** An outing is running (from the cap going on to his desk). */
  get active(): boolean {
    return this.job !== null;
  }

  /** Where the outing is: on the way to a piece, taking it, on the way back; null when none runs. */
  get stage(): Stage | null {
    return this.job?.stage ?? null;
  }

  /** The piece he goes for or takes now. */
  get target(): MessItem | null {
    return this.job?.item ?? null;
  }

  /** How much more mess the team leaves now: `MESS_BOOST` while Oscar is in the office, else 1. */
  get messBoost(): number {
    return this.oscar.presence === 'in' ? MESS_BOOST : 1;
  }

  /** His bubble, for the speech bubbles. */
  get bubbles(): Array<{ who: Person; text: string }> {
    const p = this.oscar;
    return this.text !== null && p.inOffice ? [{ who: p, text: this.text }] : [];
  }

  /**
   * Free for an outing by himself: at his desk or on a break, not in a meeting, talk, call or scene, not held or steered.
   * `asked` (the dev event): only what clearing the way cannot do for him (held, steered, kept by a scene, in a meeting,
   * at the printer, the foosball table, the coffee machine or the WC); `start` pulls him out of the rest.
   */
  free(asked = false): boolean {
    const p = this.oscar;
    const { presence, toilets } = this.sim;
    if (presence.isKept(p) || !p.inOffice || p.held || p.controlled) return false;
    if (!asked) return freeForScene(p) && !p.fireRole;
    return !p.inMeeting && !p.printJob && !p.foosJob && !p.coffeeJob && !toilets.queue.some((w) => w.person === p) && !toilets.cabins.some((c) => c.session?.person === p);
  }

  /** An outing starts: the cap goes on, he says his first line and walks to the nearest piece. False when nothing lies around or he is not free. */
  start(asked = false): boolean {
    if (this.job || !this.sim.mess.count() || !this.free(asked)) return false;
    const p = this.oscar;
    this.sim.pull(p); // up from the desk, out of a talk or a call
    this.job = { stage: 'walk', t: 0, pin: null, item: null, took: false, left: PIECES.min + Math.floor(this.rnd() * (PIECES.extra + 1)), desk: null, skip: new Set() };
    setPoliceCap(p.rig, true);
    this.text = null;
    this.gapT = 0;
    this.pending = null;
    this.say('start');
    this.next(this.job);
    return true;
  }

  /** The outing ends at once (interrupted, an action needs him, a new day): no pin, no pose, the cap off. A line that is up stays its time. */
  abort(): void {
    this.pending = null;
    this.end();
  }

  update(dt: number): void {
    const days = this.sim.presence.days;
    if (days !== this.days) {
      this.abort(); // a new working day
      this.days = days;
      this.nextIn = null;
    }
    this.talk(dt);
    if (this.job) return this.advance(this.job, dt);
    if (!this.oscar.inOffice) return;
    if (this.nextIn === null) this.nextIn = this.gap();
    else if ((this.nextIn -= dt) <= 0 && !this.start()) this.nextIn = RETRY;
  }

  private gap(): number {
    return (TIDY_GAP.min + this.rnd() * TIDY_GAP.extra) * GAME_HOUR;
  }

  private advance(j: Outing, dt: number): void {
    const p = this.oscar;
    j.t += dt;
    // picked up, steered, sent home or called away, into a meeting or a talk
    if (p.held || !p.inOffice || p.inMeeting || p.talk) return this.abort();
    if (j.stage !== 'back' && p.scripted !== j.pin) return this.abort();
    switch (j.stage) {
      case 'walk':
        if (!j.item || !this.sim.mess.list().includes(j.item)) return this.next(j); // somebody else took it meanwhile
        if (j.pin?.arrived && dist(p.pos, this.sim.mess.where(j.item)) > REACH) {
          j.skip.add(j.item); // the walk ended out of reach (no way round): he leaves it
          this.next(j);
        } else if (j.pin?.arrived) {
          j.stage = 'pick';
          j.t = 0;
          p.tidyPose = j.item.kind === 'lunchbox' ? 'nose' : 'pick';
        } else if (j.t >= WALK_MAX) {
          j.skip.add(j.item); // no way there: he leaves it
          this.next(j);
        }
        return;
      case 'pick':
        if (!j.took && j.t >= WORK_TIME / 2) {
          j.took = true;
          const item = j.item!;
          if (!this.sim.mess.take(item)) {
            p.tidyPose = null;
            return this.next(j); // somebody else was quicker: it does not count
          }
          const own = item.kind === 'lunchbox' || item.kind === 'bin' ? item.kind : null;
          if (own) this.say(own);
          else if (this.rnd() < 0.6) this.say('tidy');
        }
        if (j.t >= WORK_TIME) {
          p.tidyPose = null;
          j.left--;
          this.next(j);
        }
        return;
      case 'back': {
        const t = p.task;
        if (p.controlled || !j.desk || t?.desk !== j.desk || t.phase !== 'approach' || j.t >= BACK_MAX) this.end(); // at his desk (or off elsewhere)
        return;
      }
    }
  }

  /** The nearest piece from where he stands that he can reach, while he has pieces left; else back to the desk. */
  private next(j: Outing): void {
    const p = this.oscar;
    const mess = this.sim.mess;
    let best: MessItem | null = null;
    let at: Vec2 | null = null;
    let w: Vec2 | null = null;
    while (j.left > 0) {
      best = null;
      let bestD = Infinity;
      for (const item of mess.list()) {
        if (j.skip.has(item)) continue;
        const d = dist(mess.where(item), p.pos);
        if (d < bestD) [best, bestD] = [item, d];
      }
      if (!best) break;
      w = mess.where(best);
      const d = Math.max(0.01, bestD);
      const spot = { x: w.x + ((p.pos.x - w.x) / d) * STAND_OFF, z: w.z + ((p.pos.z - w.z) / d) * STAND_OFF };
      at = this.sim.nav.nearestWalkable(spot, 4);
      if (at && dist(at, w) <= REACH) break;
      j.skip.add(best); // nowhere to stand next to it
      best = null;
    }
    if (!best || !at || !w) return this.back(j);
    p.pinTo({ at, yaw: Math.atan2(w.x - at.x, w.z - at.z), walk: true });
    j.pin = p.scripted;
    j.item = best;
    j.took = false;
    j.stage = 'walk';
    j.t = 0;
  }

  /** Done (or nothing left): a last word, and back to his desk. */
  private back(j: Outing): void {
    const p = this.oscar;
    this.release(j);
    j.item = null;
    this.say('done');
    j.desk = p.office?.claim(p) ?? null;
    j.stage = 'back';
    j.t = 0;
    if (j.desk) p.headForDesk(j.desk, this.sim.nav);
    else this.end();
  }

  /** The outing is over, however it ended: no pin, no pose, his own cap again; the next one in 1 to 2 hours. */
  private end(): void {
    const j = this.job;
    if (!j) return;
    this.job = null;
    this.release(j);
    setPoliceCap(this.oscar.rig, false);
    this.nextIn = this.gap();
  }

  /** Out of the outing's pose and pin (somebody else's pin on him stays). */
  private release(j: Outing): void {
    const p = this.oscar;
    p.tidyPose = null;
    if (j.pin && p.scripted === j.pin) p.unpin();
    j.pin = null;
  }

  /** A line of his, if his bubble is free (an important one waits for it). */
  private say(kind: OscarLineKind): void {
    if (this.text !== null || this.gapT > 0) {
      if (IMPORTANT.has(kind)) this.pending = kind;
      return;
    }
    this.pending = null;
    const lines = OSCAR_LINES[kind].filter((l) => l !== this.lastLine);
    const line = lines[Math.floor(this.rnd() * lines.length)];
    this.text = this.lastLine = line;
    this.textT = Math.max(MIN_BUBBLE, bubbleSeconds(line));
  }

  /** His bubble: up its time, then a short pause, then a line that had to wait. */
  private talk(dt: number): void {
    if (this.text !== null) {
      if ((this.textT -= dt) <= 0) {
        this.text = null;
        this.gapT = GAP.min + this.rnd() * GAP.extra;
      }
    } else if ((this.gapT -= dt) <= 0 && this.pending) this.say(this.pending);
  }
}
