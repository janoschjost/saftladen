/**
 * The Christmas show (#275): one uncut film the game plays by itself. It is a single camera path through the office
 * and a timeline of cues (`src/data/show.ts`). Everybody stands at their place from the start of the day and the camera
 * visits them one after the other; an event only runs when the camera gets there. This file runs the timeline: what a
 * cue does to the office is the host's job (`ShowDirector`), so it needs no browser.
 */

/** where a camera looks from and at; everything but one of `action`, `at` or `overview` is optional */
export interface ShotSpec {
  /** the place of an Aktionen card (`src/data/actions.ts`), with that card's angle and zoom unless given here */
  action?: string;
  /** a floor point: x, z in game metres */
  at?: [number, number];
  /** the whole office, as the Orbit view starts */
  overview?: boolean;
  /** degrees around the target: 0 looks from the front of the office (+z), positive turns towards +x, 180 from the back */
  angle?: number;
  /** how much closer than the overview (2 = half the distance) */
  zoom?: number;
  /** degrees off straight down: 0 looks down from above, 60 is almost level (default 41) */
  tilt?: number;
  /** height of the target above the floor in metres (default 0.8) */
  height?: number;
}

/** a point of the camera path: the camera is at this shot at second `t`, and moves smoothly through all of them */
export interface CameraKey {
  t: number;
  shot: ShotSpec;
}

/** people who wait together: at a floor point (`at`), or at their desks without it */
export interface Group {
  who: string[];
  at?: [number, number];
}

/** Who is where from now on. Everybody who is in none of the lists is out of the film. */
export interface Stage {
  /** who waits in the office, held where they stand until an event of theirs runs (an event's `cast` wakes them) */
  groups?: Group[];
  /** who works from home (their feeds show in the dock while a `feed` is on) */
  home?: string[];
  /** who is outside the door, waiting for an `arrive` cue */
  outside?: string[];
  /** clock hour the sky jumps to (later the sky runs on by itself, see `sky`) */
  hour?: number;
}

export type CueBody =
  /** a subtitle line, with the people it is about (name and role show under it); gone after `hold` seconds (default: by its length) */
  | { say: string; who?: string[]; hold?: number }
  /** a title card over the picture */
  | { title: string; sub?: string; hold?: number }
  /**
   * a dev event (`dev.list()`); tried again for a few seconds when it cannot run yet. `cast`: only these people can be
   * picked by it, they are woken from their places. `free`: they live on by the schedule's rules (smoke breaks, the post).
   */
  | { event: string; cast?: string[]; free?: true }
  /** these people come in through the front door, `gap` seconds apart (they have to be `outside` in the stage) */
  | { arrive: string[]; gap?: number }
  /** the sun runs from one hour to another in `over` seconds */
  | { sky: [number, number]; over: number }
  /** the home office dock shows, this feed the big one (a person's id); null: the dock goes */
  | { feed: string | null }
  /** the picture goes to black (true) or comes back (false) in `over` seconds */
  | { fade: boolean; over?: number }
  /** the cast is put in place */
  | { stage: Stage }
  /** a chapter: `?show=<name>` starts here and the arrow keys jump between chapters */
  | { mark: string };

export type Cue = CueBody & { t: number };

export interface Film {
  /** seconds the whole film lasts */
  length: number;
  camera: CameraKey[];
  cues: Cue[];
}

/** an event that cannot run yet is tried again every half second for this long */
const RETRY_FOR = 6;
const RETRY_EVERY = 0.5;

/** What the show does to the world; `ShowDirector` is the real one. */
export interface ShowHost {
  stage(stage: Stage): void;
  /** false: the event cannot run (yet) */
  event(id: string, cast: string[] | undefined, free: boolean): boolean;
  arrive(id: string): void;
  /** the sun runs from `from` to `to` in `over` seconds, `elapsed` of which are gone already (a jump into the film) */
  sky(from: number, to: number, over: number, elapsed: number): void;
  feed(id: string | null): void;
  say(text: string | null, who: string[]): void;
  title(head: string | null, sub?: string): void;
  fade(black: boolean, over: number): void;
  /** the camera is where the path is at second `t` */
  camera(t: number): void;
  /** the film is over */
  end(): void;
}

/** How long a subtitle stays: a beat for the eye to find it, then by its length. */
export function holdFor(text: string): number {
  return Math.min(7, Math.max(2.5, 1.2 + text.length * 0.055));
}

/** Cues with an `arrive` list become one cue per person, `gap` seconds apart; cues are in the order of their second. */
export function expand(cues: readonly Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    if ('arrive' in c) c.arrive.forEach((id, i) => out.push({ t: c.t + i * (c.gap ?? 1.5), arrive: [id] }));
    else out.push(c);
  }
  return out.sort((a, b) => a.t - b.t); // stable: cues at the same second stay in the order they were written
}

/** Plays the film: fires each cue when its second comes and keeps the camera on its path. */
export class ShowRunner {
  /** seconds into the film */
  t = 0;
  finished = false;
  private cues: Cue[];
  /** the chapters, in time order */
  readonly marks: Array<{ name: string; t: number }>;
  private next = 0;
  private sayUntil = Infinity;
  private titleUntil = Infinity;
  private retries: Array<{ id: string; cast?: string[]; free: boolean; until: number; at: number }> = [];

  constructor(
    readonly film: Film,
    private host: ShowHost,
  ) {
    this.cues = expand(film.cues);
    this.marks = this.cues.flatMap((c) => ('mark' in c ? [{ name: c.mark, t: c.t }] : []));
  }

  /** Starts at the film's beginning, or at a chapter (its name, or its number). */
  start(from?: string): void {
    const n = Number(from);
    const mark = this.marks.find((m) => m.name === from) ?? (from !== undefined && from !== '' && Number.isInteger(n) ? this.marks[n] : undefined);
    this.seek(mark?.t ?? 0);
  }

  /** The chapter `by` further on (negative: back); past the last one the film ends. */
  skip(by: number): void {
    const here = this.marks.filter((m) => m.t <= this.t + 0.01).length - 1;
    const to = here + by;
    if (to >= this.marks.length) {
      this.t = this.film.length;
      return this.finish();
    }
    this.seek(this.marks[Math.max(0, to)].t);
  }

  /** Jumps to second `t`: the cast, the sun and the dock are as the cues before it left them; events and lines before it are not replayed. */
  seek(t: number): void {
    this.t = t;
    this.finished = false;
    this.next = this.cues.findIndex((c) => c.t >= t);
    if (this.next < 0) this.next = this.cues.length;
    this.sayUntil = this.titleUntil = Infinity;
    this.retries = [];
    this.host.say(null, []);
    this.host.title(null);
    const before = this.cues.filter((c) => c.t < t);
    const stage = before.filter((c) => 'stage' in c).at(-1);
    if (stage && 'stage' in stage) this.host.stage(stage.stage);
    for (const c of before) if ('arrive' in c) this.host.arrive(c.arrive[0]); // who came in through the door before is in
    const sky = before.filter((c) => 'sky' in c).at(-1);
    if (sky && 'sky' in sky) this.host.sky(sky.sky[0], sky.sky[1], sky.over, t - sky.t);
    const feed = before.filter((c) => 'feed' in c).at(-1);
    this.host.feed(feed && 'feed' in feed ? feed.feed : null);
    this.fire();
  }

  update(dt: number): void {
    if (this.finished) return;
    this.t += dt;
    this.fire();
    if (this.t >= this.film.length) this.finish();
  }

  private finish(): void {
    this.finished = true;
    this.host.end();
  }

  private fire(): void {
    while (this.next < this.cues.length && this.cues[this.next].t <= this.t) this.run(this.cues[this.next++]);
    if (this.retries.length) {
      this.retries = this.retries.filter((r) => {
        if (this.t < r.at) return true;
        if (this.host.event(r.id, r.cast, r.free) || this.t >= r.until) return false;
        r.at = this.t + RETRY_EVERY;
        return true;
      });
    }
    if (this.t >= this.sayUntil) {
      this.sayUntil = Infinity;
      this.host.say(null, []);
    }
    if (this.t >= this.titleUntil) {
      this.titleUntil = Infinity;
      this.host.title(null);
    }
    this.host.camera(this.t);
  }

  private run(c: Cue): void {
    if ('say' in c) {
      this.host.say(c.say, c.who ?? []);
      this.sayUntil = this.t + (c.hold ?? holdFor(c.say));
    } else if ('title' in c) {
      this.host.title(c.title, c.sub);
      this.titleUntil = this.t + (c.hold ?? 4);
    } else if ('event' in c) {
      const free = !!c.free;
      if (!this.host.event(c.event, c.cast, free)) this.retries.push({ id: c.event, cast: c.cast, free, until: this.t + RETRY_FOR, at: this.t + RETRY_EVERY });
    } else if ('arrive' in c) c.arrive.forEach((id) => this.host.arrive(id));
    else if ('sky' in c) this.host.sky(c.sky[0], c.sky[1], c.over, 0);
    else if ('feed' in c) this.host.feed(c.feed);
    else if ('fade' in c) this.host.fade(c.fade, c.over ?? 1);
    else if ('stage' in c) this.host.stage(c.stage);
  }
}
