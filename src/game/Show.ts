import type { Ease } from '../render/cameraFly';

/**
 * The Christmas show (#275): a film the game plays by itself. It is a list of scenes (`src/data/show.ts`); a scene says
 * who is where, what time it is and, on a timeline, which camera shot, dev event and subtitle come when. This file
 * only runs the timeline: what a cue does to the office is the host's job (`ShowDirector`), so it needs no browser.
 */

/** where a camera looks from and at; everything but one of `action`, `at`, `person` or `overview` is optional */
export interface ShotSpec {
  /** the place of an Aktionen card (`src/data/actions.ts`), with that card's angle and zoom unless given here */
  action?: string;
  /** a floor point: x, z in game metres */
  at?: [number, number];
  /** a person, where they stand at the cue (or, with `follow`, wherever they walk) */
  person?: string;
  follow?: boolean;
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

export type CueBody =
  /** a subtitle line, with the people it is about (name and role show under it); gone after `hold` seconds (default: by its length) */
  | { say: string; who?: string[]; hold?: number }
  /** a title card over the picture */
  | { title: string; sub?: string; hold?: number }
  /** the camera flies to a shot in `over` seconds (0: at once) */
  | { shot: ShotSpec; over?: number; ease?: Ease }
  /** a dev event (`dev.list()`); tried again for a few seconds when it cannot run yet */
  | { event: string }
  /** these people come in through the front door, `gap` seconds apart (they have to be in the scene's `outside`) */
  | { arrive: string[]; gap?: number }
  /** the sun runs on to this hour in `over` seconds */
  | { sky: number; over: number }
  /** a home office feed fills the screen (a person's id); null: back to the office */
  | { feed: string | null };

export type Cue = CueBody & { t: number };

export interface Scene {
  id: string;
  /** seconds the scene lasts, cues included */
  length: number;
  /** clock hour the sky stands at when it begins */
  hour: number;
  /** who is in the office (and stays there). Everybody who is in no list is out of the film. */
  present?: string[];
  /** who works from home (their feed tile shows when it is on screen) */
  home?: string[];
  /** where the people of `present` stand when the scene begins (x, z): a place where something is about to happen starts with its people there; without it they sit at their desks */
  near?: [number, number];
  /** the people of `present` are put there once and then live on by the simulation's rules, not held: the events that only pick people the schedule has (smoke breaks, the post) need it */
  loose?: true;
  /** who is outside the door, waiting for an `arrive` cue */
  outside?: string[];
  /** false: no dip to black from the scene before, the picture runs on (the camera and the people stay as they are) */
  cut?: boolean;
  cues: Cue[];
}

/** seconds the picture takes to go to black and back between two scenes */
export const SHOW_FADE = 0.6;
/** an event that cannot run yet is tried again every half second for this long */
const RETRY_FOR = 6;
const RETRY_EVERY = 0.5;

/** What the show does to the world; `ShowDirector` is the real one. */
export interface ShowHost {
  /** a scene begins: put everybody where it wants them (`continuous`: nothing is reset, it runs on from the scene before) */
  beginScene(scene: Scene, continuous: boolean): void;
  shot(spec: ShotSpec, over: number, ease: Ease): void;
  /** false: the event cannot run (yet) */
  event(id: string): boolean;
  arrive(id: string): void;
  sky(hour: number, over: number): void;
  feed(id: string | null): void;
  say(text: string | null, who: string[]): void;
  title(head: string | null, sub?: string): void;
  /** the picture goes to black (true) or comes back (false) in `seconds` */
  fade(black: boolean, seconds: number): void;
  /** the last scene is over */
  end(): void;
}

/** How long a subtitle stays: a beat for the eye to find it, then by its length. */
export function holdFor(text: string): number {
  return Math.min(7, Math.max(2.5, 1.2 + text.length * 0.055));
}

/** Cues with an `arrive` list become one cue per person, `gap` seconds apart. */
export function expand(cues: readonly Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const c of cues) {
    if ('arrive' in c) c.arrive.forEach((id, i) => out.push({ t: c.t + i * (c.gap ?? 1.5), arrive: [id] }));
    else out.push(c);
  }
  return out.sort((a, b) => a.t - b.t); // stable: cues at the same second stay in the order they were written
}

/** The whole film as the sum of its scenes, in seconds. */
export const showLength = (scenes: readonly Scene[]): number => scenes.reduce((sum, s) => sum + s.length, 0);

/** Plays the scenes one after the other, firing each cue when its second comes. */
export class ShowRunner {
  /** the scene that plays now (-1: not started) */
  index = -1;
  /** seconds into that scene */
  t = 0;
  finished = false;
  private cues: Cue[] = [];
  private next = 0;
  private sayUntil = Infinity;
  private titleUntil = Infinity;
  private retries: Array<{ id: string; until: number; at: number }> = [];
  private dipped = false;

  constructor(
    readonly scenes: readonly Scene[],
    private host: ShowHost,
  ) {}

  /** Begins scene `index` (0 = the first); the one that was running ends where it is. */
  start(index = 0): void {
    const i = Math.min(this.scenes.length - 1, Math.max(0, index));
    const scene = this.scenes[i];
    // a scene that runs on from the one before only when it plays on in order; a jump always starts it clean
    const continuous = scene.cut === false && i === this.index + 1 && !this.finished;
    this.index = i;
    this.t = 0;
    this.finished = false;
    this.cues = expand(scene.cues);
    this.next = 0;
    this.sayUntil = this.titleUntil = Infinity;
    this.retries = [];
    this.dipped = false;
    this.host.beginScene(scene, continuous);
    this.fire();
  }

  /** The scene `by` further on (negative: back); past the last one the show ends. */
  skip(by: number): void {
    const to = this.index + by;
    if (to >= this.scenes.length) return this.finish();
    this.start(to);
  }

  update(dt: number): void {
    if (this.index < 0 || this.finished) return;
    this.t += dt;
    this.fire();
    const scene = this.scenes[this.index];
    const following = this.scenes[this.index + 1];
    if (following && following.cut !== false && !this.dipped && this.t >= scene.length - SHOW_FADE) {
      this.dipped = true;
      this.host.fade(true, SHOW_FADE);
    }
    if (this.t < scene.length) return;
    if (following) this.start(this.index + 1);
    else this.finish();
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
        if (this.host.event(r.id) || this.t >= r.until) return false;
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
  }

  private run(c: Cue): void {
    if ('say' in c) {
      this.host.say(c.say, c.who ?? []);
      this.sayUntil = this.t + (c.hold ?? holdFor(c.say));
    } else if ('title' in c) {
      this.host.title(c.title, c.sub);
      this.titleUntil = this.t + (c.hold ?? 4);
    } else if ('shot' in c) this.host.shot(c.shot, c.over ?? 0, c.ease ?? 'inOut');
    else if ('event' in c) {
      if (!this.host.event(c.event)) this.retries.push({ id: c.event, until: this.t + RETRY_FOR, at: this.t + RETRY_EVERY });
    } else if ('arrive' in c) c.arrive.forEach((id) => this.host.arrive(id));
    else if ('sky' in c) this.host.sky(c.sky, c.over);
    else if ('feed' in c) this.host.feed(c.feed);
  }
}
