import * as THREE from 'three';
import { OFFICE_ACTIONS } from '../data/actions';
import { SHOW_FILM } from '../data/show';
import { team } from '../data/team';
import { ACTION_POLAR, samplePath, type PathKey, type Shot } from '../render/cameraFly';
import type { Views } from '../render/Views';
import type { Feeds } from '../ui/Feeds';
import type { ShowOverlay } from '../ui/ShowOverlay';
import type { Christmas } from './Christmas';
import { clearPlaces } from './makePossible';
import { cycleOf } from './TimeOfDay';
import type { Film, ShotSpec, ShowHost, Stage } from './Show';
import { ShowRunner } from './Show';
import type { Sim } from './Sim';

/** What the show needs from the game: the office, the camera, the feeds and the overlay. */
export interface ShowCtx {
  sim: Sim;
  views: Views;
  feeds: Feeds;
  overlay: ShowOverlay;
  xmas: Christmas;
  setRoof(on: boolean): void;
  /** no table, room or seat labels, no names over the heads */
  hideLabels(): void;
  /** the film is over */
  onEnd(): void;
}

/** the show goes on as a Wednesday: nobody's day off gets in the way (a stage sets every dog it needs) */
const WEDNESDAY = 2;
const DEFAULT_HEIGHT = 0.8;
const rad = THREE.MathUtils.degToRad;

/** The real host of the show: puts the people in place, runs their events when the camera comes by, aims the camera, the clock and the subtitles. */
export class ShowDirector implements ShowHost {
  readonly runner: ShowRunner;
  private skyAnim: { from: number; to: number; t: number; over: number } | null = null;
  private path: PathKey[] = [];

  constructor(
    private ctx: ShowCtx,
    film: Film = SHOW_FILM,
  ) {
    this.runner = new ShowRunner(film, this);
  }

  /** Starts the film at a chapter (its name or number, default the beginning). */
  begin(from?: string): void {
    const { sim, views, overlay } = this.ctx;
    this.ctx.xmas.set(true);
    this.ctx.hideLabels();
    sim.weather.mode = 'sun'; // it snows instead of raining
    sim.tod.pinned = true;
    sim.tod.auto = true;
    sim.tod.speed = 1;
    sim.tod.weekday = WEDNESDAY;
    for (const m of team) m.adhd = false; // never a gag in the film
    if (views.mode !== 'orbit') views.setMode('orbit');
    this.ctx.setRoof(false); // after the view: a view change puts the roof back as the player had it
    views.setDirected(true);
    overlay.active = true;
    this.path = this.runner.film.camera.map((k) => ({ t: k.t, ...this.resolve(k.shot) }));
    overlay.fade(true, 0);
    overlay.fade(false, 1.5); // the film opens out of black
    this.runner.start(from);
  }

  update(dt: number): void {
    const s = this.skyAnim;
    if (s) {
      s.t += dt;
      const k = s.over > 0 ? Math.min(1, s.t / s.over) : 1;
      this.setHour(s.from + (s.to - s.from) * k);
      if (k >= 1) this.skyAnim = null;
    }
    this.runner.update(dt);
  }

  /** Puts everybody where the stage wants them: waiting in a group, at home, outside the door, or out of the film. */
  stage(stage: Stage): void {
    const { sim } = this.ctx;
    const groups = stage.groups ?? [];
    const home = new Set(stage.home);
    const outside = new Set(stage.outside);
    const waiting = new Map<string, { at?: [number, number]; n: number }>();
    groups.forEach((g, i) => g.who.forEach((id, n) => waiting.set(id, { at: g.at, n: n + i })));
    if (stage.hour !== undefined) {
      this.skyAnim = null;
      this.setHour(stage.hour);
    }
    clearPlaces(sim);
    sim.boombox.reset();
    sim.bonfire.reset();
    const wanted = (id: string) => waiting.has(id) || home.has(id) || outside.has(id);
    // first everybody who is not in the film goes (their desks and places free up), then the others come
    for (const p of sim.people) {
      if (wanted(p.id)) continue;
      p.pets.forEach((d) => sim.setRemoved(d.id, true));
      if (!sim.presence.isRemoved(p)) sim.setRemoved(p.id, true);
    }
    for (const p of sim.people) {
      if (!wanted(p.id)) continue;
      sim.setRemoved(p.id, false);
      p.pets.forEach((d) => sim.setRemoved(d.id, false));
      const w = waiting.get(p.id);
      if (home.has(p.id)) sim.scenario.put(p.id, 'home', 'stay');
      else if (outside.has(p.id)) sim.scenario.put(p.id, 'errand', 'stay');
      else if (w?.at) sim.scenario.put(p.id, this.spot(w.at, w.n), 'pin');
      else sim.scenario.put(p.id, 'desk', 'pin');
    }
  }

  /** The `n`-th place on a ring round `near`: a little crowd, nobody inside anybody. */
  private spot([x, z]: [number, number], n: number): { x: number; z: number } {
    const a = n * 2.4;
    const r = n === 0 ? 0 : 1 + n * 0.12;
    return { x: x + Math.sin(a) * r, z: z + Math.cos(a) * r };
  }

  private setHour(hour: number): void {
    const { tod } = this.ctx.sim;
    tod.setCycle(cycleOf(hour));
    tod.night = tod.day < 0.45;
  }

  camera(t: number): void {
    this.ctx.views.place(samplePath(this.path, t));
  }

  /** A shot spec as a camera shot. */
  private resolve(spec: ShotSpec): Shot {
    const { views } = this.ctx;
    const overview = views.overviewShot();
    const action = spec.action ? OFFICE_ACTIONS.find((a) => a.id === spec.action) : undefined;
    const at = action ? { x: action.place.x, z: action.place.z } : spec.at ? { x: spec.at[0], z: spec.at[1] } : { x: overview.x, z: overview.z };
    return {
      ...at,
      y: spec.height ?? (spec.overview ? overview.y : DEFAULT_HEIGHT),
      azimuth: spec.angle !== undefined ? rad(spec.angle) : action ? rad(action.angle) : overview.azimuth,
      polar: spec.tilt !== undefined ? rad(spec.tilt) : spec.overview ? overview.polar : ACTION_POLAR,
      dist: overview.dist / (spec.zoom ?? action?.zoom ?? 1),
    };
  }

  event(id: string, cast: string[] | undefined, free: boolean): boolean {
    const { sim } = this.ctx;
    const ev = sim.events.get(id);
    if (!ev) {
      console.warn(`[show] no event "${id}", see dev.list()`);
      return true;
    }
    // only the cast can be picked: everybody else in the office is held for the moment the event looks for people
    const others = cast ? sim.people.filter((p) => p.inOffice && !p.held && !cast.includes(p.id)) : [];
    for (const who of cast ?? []) {
      const p = sim.person(who);
      p.unpin();
      if (free) sim.presence.letGo(p);
      else sim.presence.keep(p);
    }
    others.forEach((p) => (p.held = true));
    const r = ev.run();
    others.forEach((p) => (p.held = false));
    if (r !== null) console.info(`[show] ${id}: ${r || 'ok'}`);
    return r !== null;
  }

  arrive(id: string): void {
    const p = this.ctx.sim.person(id);
    p.awayLeft = 0; // kept outside by the stage: in through the front door now, one after the other
    this.ctx.sim.presence.hurryIn(p);
  }

  sky(from: number, to: number, over: number, elapsed: number): void {
    this.skyAnim = { from, to, t: elapsed, over };
    this.setHour(from + (to - from) * Math.min(1, elapsed / Math.max(over, 0.01)));
  }

  feed(id: string | null): void {
    this.ctx.overlay.setDock(id !== null);
    this.ctx.feeds.enlarge(id);
  }

  say(text: string | null, who: string[]): void {
    const members = who.flatMap((id) => team.find((m) => m.id === id) ?? []);
    this.ctx.overlay.say(
      text,
      members.map((m) => ({ name: m.name, role: m.role.split(',')[0].trim() })),
    );
  }

  title(head: string | null, sub?: string): void {
    this.ctx.overlay.title(head, sub);
  }

  fade(black: boolean, over: number): void {
    this.ctx.overlay.fade(black, over);
  }

  end(): void {
    this.ctx.onEnd();
  }
}
