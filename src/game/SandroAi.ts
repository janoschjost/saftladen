import { SANDRO_ANSWERS, SANDRO_LINES } from '../data/sandroLines';
import { bubbleSeconds } from '../data/sonLines';
import { DJ, free as freeForScene } from './Boombox';
import type { Person } from './Person';
import { stream } from './rng';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

/** Clock minutes between two lines (min, plus up to extra), drawn after each. */
export const GAP_MINUTES = { min: 20, extra: 20 };
const minutes = (m: number) => (m / 60) * GAME_HOUR;
/** Game seconds before he looks again when it was not the moment. */
const RETRY = 5;
/** How far (m) somebody hears him, and how likely they answer: about every second time. */
export const HEARS = 3;
export const ANSWER_CHANCE = 0.5;
/** An answer comes this long after his line starts, and stays up this long (s). */
const ANSWER_DELAY = 1;
const ANSWER_TIME = 2.5;

interface Answer {
  who: Person;
  text: string;
  /** seconds until it shows, then the seconds it stays */
  wait: number;
  left: number;
}

/**
 * Sandro is hyped about AI (#306): now and then, in the office and free, he drops a line about how AI solves everything
 * in a speech bubble and raises a hand while it shows; whoever stands within 3 m may answer wordless. Like the other
 * gags it rolls its own dice, so a seed replays everything else as before.
 */
export class SandroAi {
  /** what his bubble says now (null: nothing) */
  text: string | null = null;
  /** game seconds until the next look */
  timer: number;
  private left = 0;
  private lastLine = '';
  private answers: Answer[] = [];
  private readonly rnd = stream(0x5a1d0);

  constructor(private readonly sim: Sim) {
    this.timer = this.gap();
  }

  private get sandro(): Person {
    return this.sim.person(DJ);
  }

  private gap(): number {
    return minutes(GAP_MINUTES.min + this.rnd() * GAP_MINUTES.extra);
  }

  /** A line is up (his hand is raised meanwhile, see `Person.aiGesture`). */
  get active(): boolean {
    return this.text !== null;
  }

  /** What Sandro and whoever answers say now, for the speech bubbles. */
  get bubbles(): Array<{ who: Person; text: string }> {
    const p = this.sandro;
    const own = this.text !== null && p.inOffice ? [{ who: p, text: this.text }] : [];
    return [...own, ...this.answers.filter((a) => a.wait <= 0 && a.who.inOffice).map(({ who, text }) => ({ who, text }))];
  }

  /**
   * Whether he may speak: in the office and not in a meeting, talk, call or scene, not held or steered (on his way home
   * or away he is not `inOffice`). `starting`: also free (at his desk or on a break), not on an errand; a line that is
   * up goes on while he walks to his desk.
   */
  canSpeak(starting = false): boolean {
    const p = this.sandro;
    if (!p.inOffice || p.held || p.controlled || p.inMeeting || p.talk || p.playerChat || p.phoneJob || p.boothCall || p.boomPose || p.fireRole) return false;
    return !starting || freeForScene(p);
  }

  /** Says one line (not the one before) and raises his hand; false when he cannot right now. `asked` (the dev event) is not that picky and restarts a running line. */
  say(asked = false): boolean {
    if (!this.canSpeak(!asked) || (this.active && !asked)) return false;
    const lines = SANDRO_LINES.filter((l) => l !== this.lastLine);
    const line = lines[Math.floor(this.rnd() * lines.length)];
    this.text = this.lastLine = line;
    this.left = bubbleSeconds(line);
    this.sandro.aiGesture = true;
    this.answers = this.sim.people
      .filter((p) => p !== this.sandro && p.inOffice && !p.held && Math.hypot(p.pos.x - this.sandro.pos.x, p.pos.z - this.sandro.pos.z) <= HEARS)
      .filter(() => this.rnd() < ANSWER_CHANCE)
      .map((who) => ({ who, text: SANDRO_ANSWERS[Math.floor(this.rnd() * SANDRO_ANSWERS.length)], wait: ANSWER_DELAY, left: ANSWER_TIME }));
    this.timer = this.gap(); // the next one only after the gap, however this one started
    return true;
  }

  /** The line is over (he was taken away, or its time is up): no bubble, no raised hand. */
  end(): void {
    this.text = null;
    this.answers = [];
    this.sandro.aiGesture = false;
  }

  update(dt: number): void {
    if (this.text !== null) {
      this.left -= dt;
      if (this.left <= 0 || !this.canSpeak()) this.end();
      for (const a of this.answers) {
        if (a.wait > 0) a.wait -= dt;
        else a.left -= dt;
      }
      this.answers = this.answers.filter((a) => a.left > 0);
      return;
    }
    if (!this.sandro.inOffice) return; // the gap counts his time in the office: no line the moment he arrives
    if ((this.timer -= dt) > 0) return;
    if (!this.say()) this.timer = RETRY;
  }
}
