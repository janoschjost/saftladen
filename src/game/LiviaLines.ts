import { LIVIA_LINES } from '../data/liviaLines';
import type { Person } from './Person';
import { stream } from './rng';
import type { Sim } from './Sim';
import { GAME_HOUR } from './Smoke';

/** Livia In-Albon, from the Wallis (#309). */
export const LIVIA = 'livia-in-albon';
/** Clock hours between two lines, drawn per line (also from her arrival to the first). */
export const LINE_GAP = { min: 1, extra: 1 };
/** Seconds a line is up. */
export const LINE_SECONDS = 3;
/** Game seconds before she tries again when it was not the moment (not at her desk or walking, in a meeting, …). */
export const RETRY = 5;

/**
 * Livia says a short line in Walliser Deutsch now and then (#309): about every one to two clock hours, at her desk or
 * while walking, not at night, not in a meeting, a talk or on the phone, not steered or held. One bubble at a time, never
 * the same line twice in a row. Rolls its own dice.
 */
export class LiviaLines {
  /** what her bubble says now (null: nothing) */
  text: string | null = null;
  /** game seconds until the next line while she is in; null: not in yet today */
  nextIn: number | null = null;
  /** the line she said last (none twice in a row) */
  lastLine = '';
  private textT = 0;
  private days: number;
  private readonly rnd = stream(0x1171a);

  readonly livia: Person;

  constructor(private readonly sim: Sim) {
    this.livia = sim.person(LIVIA);
    this.days = sim.presence.days;
  }

  /** Her bubble, for the speech bubbles. */
  get bubbles(): Array<{ who: Person; text: string }> {
    return this.text !== null && this.livia.inOffice ? [{ who: this.livia, text: this.text }] : [];
  }

  /** In the office, not steered by the player or held, not in a meeting or a talk: what she needs to say anything. A scene or an event that walks her (`scripted`) does not count as steering. */
  private get free(): boolean {
    const p = this.livia;
    return p.inOffice && !p.held && !(p.controlled && !p.scripted) && !p.inMeeting && !p.talk && !p.playerChat;
  }

  /** The moment for a line of her own: free and off the phone, at her desk or walking, and not at night. */
  get canSpeak(): boolean {
    const p = this.livia;
    return this.free && !p.phoneJob && !this.sim.tod.night && (p.working || p.state === 'walk');
  }

  /**
   * She says a line now (the dev event): at any time of day, wherever she is (a phone call ends for it). Null when she
   * is not free (away, steered, held, in a meeting or a talk): clearing the way (`actions.force`) helps with the rest.
   */
  speak(): string | null {
    if (!this.free) return null;
    if (this.livia.phoneJob) this.livia.endPhone();
    return this.say();
  }

  update(dt: number): void {
    const days = this.sim.presence.days;
    if (days !== this.days) {
      this.days = days;
      this.nextIn = null;
    }
    if (this.text !== null) {
      // a meeting or a talk has its own bubble: hers goes at once
      if ((this.textT -= dt) <= 0 || !this.free) this.text = null;
      return; // one bubble at a time: the next wait starts once it is gone
    }
    if (!this.livia.inOffice) return;
    if (this.nextIn === null) this.nextIn = this.gap();
    else if ((this.nextIn -= dt) <= 0) {
      if (this.canSpeak) this.say();
      else this.nextIn = RETRY;
    }
  }

  private say(): string {
    const lines = LIVIA_LINES.filter((l) => l !== this.lastLine);
    const line = lines[Math.floor(this.rnd() * lines.length)] ?? lines[0];
    this.text = this.lastLine = line;
    this.textT = LINE_SECONDS;
    this.nextIn = this.gap();
    return line;
  }

  private gap(): number {
    return (LINE_GAP.min + this.rnd() * LINE_GAP.extra) * GAME_HOUR;
  }
}
