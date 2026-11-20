import * as THREE from 'three';
import { OFFICE_ACTIONS } from '../data/actions';
import { SHOW_SCENES } from '../data/show';
import { team } from '../data/team';
import { ACTION_POLAR, type Ease, type Shot } from '../render/cameraFly';
import type { Views } from '../render/Views';
import type { Feeds } from '../ui/Feeds';
import type { ShowOverlay } from '../ui/ShowOverlay';
import type { Christmas } from './Christmas';
import { clearPlaces } from './makePossible';
import { cycleOf } from './TimeOfDay';
import type { Scene, ShotSpec, ShowHost } from './Show';
import { SHOW_FADE, ShowRunner } from './Show';
import type { Sim } from './Sim';

/** What the show needs from the game: the office, the camera, the feeds and the overlay. */
export interface ShowCtx {
  sim: Sim;
  views: Views;
  feeds: Feeds;
  overlay: ShowOverlay;
  xmas: Christmas;
  setRoof(on: boolean): void;
  /** the last scene is over */
  onEnd(): void;
}

/** the show goes on as a Wednesday: nobody's dog or day off gets in the way of the script (a scene sets every dog it needs) */
const WEDNESDAY = 2;
const DEFAULT_HEIGHT = 0.8;
const rad = THREE.MathUtils.degToRad;

/** The real host of the show: puts the office where a scene wants it and aims the camera, the clock and the subtitles. */
export class ShowDirector implements ShowHost {
  readonly runner: ShowRunner;
  private skyAnim: { from: number; to: number; t: number; over: number } | null = null;

  constructor(
    private ctx: ShowCtx,
    scenes: readonly Scene[] = SHOW_SCENES,
  ) {
    this.runner = new ShowRunner(scenes, this);
  }

  /** Starts the film at scene `from` (its id or its number, default the first). */
  begin(from?: string): void {
    const { sim, views, overlay } = this.ctx;
    this.ctx.xmas.set(true);
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
    const n = Number(from);
    const byId = this.runner.scenes.findIndex((s) => s.id === from);
    this.runner.start(byId >= 0 ? byId : Number.isInteger(n) && from !== '' ? n : 0);
  }

  update(dt: number): void {
    const s = this.skyAnim;
    if (s) {
      s.t += dt;
      const k = s.over > 0 ? Math.min(1, s.t / s.over) : 1;
      this.ctx.sim.tod.setCycle(cycleOf(s.from + (s.to - s.from) * k));
      if (k >= 1) this.skyAnim = null;
    }
    this.runner.update(dt);
  }

  beginScene(scene: Scene, continuous: boolean): void {
    const { overlay, feeds } = this.ctx;
    overlay.say(null);
    overlay.title(null);
    if (!continuous) {
      overlay.fade(true, 0);
      feeds.cinema(null);
      this.setHour(scene.hour);
      this.cast(scene);
    }
    overlay.fade(false, SHOW_FADE); // coming out of the black the scene before dipped to
  }

  /** Puts everybody where the scene wants them: in the office, at home, outside the door, or out of the film. */
  private cast(scene: Scene): void {
    const { sim } = this.ctx;
    const present = new Set(scene.present);
    const home = new Set(scene.home);
    const outside = new Set(scene.outside);
    clearPlaces(sim);
    sim.boombox.reset();
    sim.bonfire.reset();
    const wanted = (id: string) => present.has(id) || home.has(id) || outside.has(id);
    // first everybody who is not in the scene goes (their desks and places free up), then the others come
    for (const p of sim.people) {
      if (wanted(p.id)) continue;
      p.pets.forEach((d) => sim.setRemoved(d.id, true));
      if (!sim.presence.isRemoved(p)) sim.setRemoved(p.id, true);
    }
    const hold = scene.loose ? 'free' : 'stay';
    let crowd = 0;
    for (const p of sim.people) {
      if (!wanted(p.id)) continue;
      sim.setRemoved(p.id, false);
      p.pets.forEach((d) => sim.setRemoved(d.id, false));
      if (home.has(p.id)) sim.scenario.put(p.id, 'home', 'stay');
      else if (outside.has(p.id)) sim.scenario.put(p.id, 'errand', 'stay');
      else if (scene.near) sim.scenario.put(p.id, this.spot(scene.near, crowd++), hold);
      else sim.scenario.put(p.id, 'desk', hold);
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
    this.skyAnim = null;
    tod.setCycle(cycleOf(hour));
    tod.night = tod.day < 0.45;
  }

  shot(spec: ShotSpec, over: number, ease: Ease): void {
    this.ctx.views.flyTo(this.resolve(spec), over, ease);
  }

  /** A shot spec as the camera's goal: a fixed shot, or one that trails a person. */
  private resolve(spec: ShotSpec): Shot | (() => Shot) {
    const { views, sim } = this.ctx;
    const overview = views.overviewShot();
    const action = spec.action ? OFFICE_ACTIONS.find((a) => a.id === spec.action) : undefined;
    const base = {
      y: spec.height ?? (spec.overview ? overview.y : DEFAULT_HEIGHT),
      azimuth: spec.angle !== undefined ? rad(spec.angle) : action ? rad(action.angle) : overview.azimuth,
      polar: spec.tilt !== undefined ? rad(spec.tilt) : spec.overview ? overview.polar : ACTION_POLAR,
      dist: overview.dist / (spec.zoom ?? action?.zoom ?? 1),
    };
    if (spec.person) {
      const who = sim.person(spec.person);
      const shot = (): Shot => ({ ...base, x: who.root.position.x, z: who.root.position.z });
      return spec.follow ? shot : shot();
    }
    if (action) return { ...base, x: action.place.x, z: action.place.z };
    if (spec.at) return { ...base, x: spec.at[0], z: spec.at[1] };
    return { ...base, x: overview.x, z: overview.z };
  }

  event(id: string): boolean {
    const ev = this.ctx.sim.events.get(id);
    if (!ev) {
      console.warn(`[show] no event "${id}", see dev.list()`);
      return true;
    }
    const r = ev.run();
    if (r !== null) console.info(`[show] ${id}: ${r || 'ok'}`);
    return r !== null;
  }

  arrive(id: string): void {
    const p = this.ctx.sim.person(id);
    p.awayLeft = 0; // kept outside by the scene: in through the front door now, one after the other
    this.ctx.sim.presence.hurryIn(p);
  }

  sky(hour: number, over: number): void {
    const from = this.ctx.sim.tod.hour;
    this.skyAnim = { from, to: hour, t: 0, over };
  }

  feed(id: string | null): void {
    this.ctx.feeds.cinema(id);
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

  fade(black: boolean, seconds: number): void {
    this.ctx.overlay.fade(black, seconds);
  }

  end(): void {
    this.ctx.onEnd();
  }
}
