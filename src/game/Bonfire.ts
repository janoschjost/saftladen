import * as THREE from 'three';
import { CORRIDOR_POINT, OFFICE_D, OFFICE_W, type OfficeModel } from '../render/officeModel';
import { buildExtinguisher, Campfire } from '../render/fireProps';
import { free } from './Boombox';
import { DOOR } from './Door';
import type { NavGrid, Vec2 } from './NavGrid';
import type { Desk } from './Office';
import type { Person } from './Person';
import { onBreak } from './PetCare';
import { stream } from './rng';
import { GAME_HOUR } from './Smoke';

export const ELIA = 'elia-vogt';

/** Bonfire dice: a stream of their own, so the gag never shifts the numbers of the rest of the simulation. */
const dice = stream(0x66697265);
const between = (min: number, max: number) => min + dice() * (max - min);

const GAP = { min: 0.75 * GAME_HOUR, max: 1.25 * GAME_HOUR }; // game seconds between two tries: 45–75 clock minutes
const RETRY = 5; // seconds before looking again when Elia or a helper was not free
export const BUILD = 3; // seconds Elia needs to light it: the flames grow from nothing
export const BURN = { min: 15, max: 25 }; // seconds it burns before somebody comes
export const BURN_MAX = 45; // seconds it burns at most when nobody can be sent: then it dies down by itself
export const LOOK = 1; // seconds the helper stares (❗) before she runs
export const SPRAY = 4; // seconds of foam
export const FIZZLE = 3; // seconds a fire dies down by itself
const WALK_MAX = 40; // seconds Elia may take to get to his spot
const RUN_MAX = 30; // seconds a helper may take to get there
const LOST_MAX = 3; // helpers that may drop out before the fire is left to die down
const SPOT_GAP = 1.1; // metres from the fire where Elia stands
const HELP_GAP = 1.5; // metres from the fire where the helper stands to spray
export const GRIN = '😁';
export const SPRAYED = ['😱', '😤'];
const SHRUG = '😅';

type Stage = 'walk' | 'build' | 'burn' | 'look' | 'run' | 'spray' | 'fizzle';

/** A place the fire keeps `r` metres away from. */
export interface KeepOut {
  at: Vec2;
  r: number;
}

/** What a fire keeps away from: every place people go to (rooms, printer, foosball, doors, the entrance) and the desks. */
export function keepOut(model: OfficeModel, desks: readonly Desk[]): KeepOut[] {
  const at = (p: Vec2, r: number): KeepOut => ({ at: p, r });
  return [
    at(model.meeting.center, 4),
    at(model.meeting.doorPos, 3),
    at(model.pod.center, 3),
    at(model.kitchen.center, 3.5),
    at(model.kitchen.machine, 3),
    at(model.phoneBooth.seat, 3),
    at(model.phoneBooth.doorPos, 2.5),
    ...model.toilets.cabins.map((c) => at(c.doorPos, 3)),
    ...model.toilets.wait.map((w) => at(w, 2.5)),
    at(model.photoStudio.stand, 4),
    at(model.photoStudio.seat, 3),
    at(model.serverRack.stand, 3),
    at(model.printer.stand, 3),
    ...model.foosball.map((f) => at(f, 2.5)),
    ...model.doors.map((d) => at(d.center, 2.5)),
    at({ x: DOOR.x, z: DOOR.z }, 4),
    ...desks.map((d) => at(d.approach, 1.1)),
  ];
}

interface Scene {
  elia: Person;
  spot: Vec2;
  cell: { cx: number; cz: number };
  stage: Stage;
  /** seconds in this stage */
  t: number;
  /** seconds it burns before somebody is sent */
  burn: number;
  /** Elia's pin: somebody else's pin on him ends the scene */
  pin: Person['scripted'];
  helper: Person | null;
  helperPin: Person['scripted'];
  /** the desk the helper got up from */
  desk: Desk | null;
  /** seconds until the next look for a free helper */
  retry: number;
  /** helpers that dropped out */
  lost: number;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
const yawTo = (from: Vec2, to: Vec2) => Math.atan2(to.x - from.x, to.z - from.z);

/**
 * Elia's bonfire (#251): now and then, on a break, he walks to a free spot of the office floor and builds a small
 * camping fire. After it has burned for a while the nearest free person notices (❗), fetches a fire extinguisher, runs
 * over and puts it out with foam. While it burns the floor under it is blocked, so everybody walks around it; once
 * it is out, only a charred spot is left, and that fades. The dice are a stream of their own (`stream`).
 */
export class Bonfire {
  readonly fire: Campfire;
  readonly extinguisher = buildExtinguisher();
  /** seconds until the next look for Elia (tests set it to 0 to try right away) */
  timer = between(GAP.min, GAP.max) / 2;
  private scene: Scene | null = null;

  constructor(
    world: THREE.Object3D,
    private nav: NavGrid,
    private keep: readonly KeepOut[],
  ) {
    this.fire = new Campfire(world);
    this.extinguisher.visible = false;
  }

  /** a scene is running */
  get active(): boolean {
    return !!this.scene;
  }

  /** where the scene is: Elia walks to his spot, builds, it burns, the helper stares, runs, sprays; it dies down by itself */
  get stage(): Stage | null {
    return this.scene?.stage ?? null;
  }

  /** where the fire burns (a scene is running), null otherwise */
  get at(): Vec2 | null {
    return this.scene ? { ...this.scene.spot } : null;
  }

  /** who comes with the extinguisher, once somebody does */
  get helper(): Person | null {
    return this.scene?.helper ?? null;
  }

  /** What Elia and the helper say now (his grin and shock, her ❗), for the speech bubbles. */
  get bubbles(): Array<{ who: Person; text: string }> {
    const s = this.scene;
    if (!s) return [];
    switch (s.stage) {
      case 'burn':
        return [{ who: s.elia, text: GRIN }];
      case 'look':
        return [{ who: s.elia, text: GRIN }, ...(s.helper ? [{ who: s.helper, text: '❗' }] : [])];
      case 'run':
        return [{ who: s.elia, text: GRIN }];
      case 'spray':
        return [{ who: s.elia, text: SPRAYED[Math.min(SPRAYED.length - 1, Math.floor((1 - this.fire.level) * SPRAYED.length))] }];
      case 'fizzle':
        return [{ who: s.elia, text: SHRUG }];
      default:
        return [];
    }
  }

  /** Elia, when he is on a break and somebody else could come with the extinguisher; null otherwise. */
  find(people: readonly Person[]): Person | null {
    const elia = people.find((p) => p.id === ELIA);
    if (!elia || !onBreak(elia) || elia.sit > 0.05 || !people.some((p) => p !== elia && free(p))) return null;
    return elia;
  }

  /** `elia` walks to a random free spot and builds the fire; false when there is no spot or nobody to put it out. Checks nothing else. */
  start(elia: Person, people: readonly Person[]): boolean {
    if (this.scene || !people.some((p) => p !== elia && free(p))) return false;
    const spot = this.pickSpot(people, elia);
    if (!spot) return false;
    // he stands on the side he comes from
    const d = dist(elia.pos, spot) || 1;
    const stand = this.nav.nearestWalkable({ x: spot.x + ((elia.pos.x - spot.x) / d) * SPOT_GAP, z: spot.z + ((elia.pos.z - spot.z) / d) * SPOT_GAP }, 4);
    if (!stand) return false;
    elia.pinTo({ at: stand, yaw: yawTo(stand, spot), walk: true });
    this.scene = { elia, spot, cell: this.nav.toCell(spot), stage: 'walk', t: 0, burn: between(BURN.min, BURN.max), pin: elia.scripted, helper: null, helperPin: null, desk: null, retry: 0, lost: 0 };
    this.timer = between(GAP.min, GAP.max); // the next one only after the gap, however this one started
    return true;
  }

  /** Ends a running scene at once (an action needs one of the two, see `makePossible`): the fire is gone, nobody keeps a pose or a pin. */
  abort(): void {
    this.end(false);
  }

  /** Everything gone, the charred spot too (the dev event wants the scene again). */
  reset(): void {
    this.abort();
    this.fire.clear();
  }

  update(dt: number, people: readonly Person[], night: boolean): void {
    this.fire.update(dt);
    if (this.scene) return this.advance(this.scene, dt, people);
    if (night || (this.timer -= dt) > 0) return;
    const elia = this.find(people);
    if (!elia || !this.start(elia, people)) this.timer = RETRY;
  }

  /** One step of the scene. */
  private advance(s: Scene, dt: number, people: readonly Person[]): void {
    const { elia } = s;
    s.t += dt;
    if (!elia.inOffice || elia.held || elia.scripted !== s.pin) return this.end(false);
    switch (s.stage) {
      case 'walk': {
        const arrived = s.pin?.arrived || dist(elia.pos, s.spot) < SPOT_GAP + 0.5;
        if (!arrived) {
          if (s.t >= WALK_MAX) this.end(false);
          return;
        }
        this.ignite(s);
        return;
      }
      case 'build':
        elia.faceTo(yawTo(elia.pos, s.spot));
        this.fire.level = smooth(s.t / BUILD);
        elia.fireRole = s.t >= BUILD ? 'warm' : 'build';
        if (s.t >= BUILD) this.go(s, 'burn');
        return;
      case 'burn':
        elia.faceTo(yawTo(elia.pos, s.spot));
        if (s.t < s.burn || (s.retry -= dt) > 0) return;
        s.retry = 1;
        if (s.t >= BURN_MAX || s.lost >= LOST_MAX) return this.go(s, 'fizzle');
        this.callHelper(s, people);
        return;
      case 'look':
      case 'run':
      case 'spray': {
        const h = s.helper;
        if (!h || tied(h) || (s.stage !== 'look' && h.scripted !== s.helperPin)) return this.lose(s);
        elia.faceTo(yawTo(elia.pos, s.spot));
        if (s.stage === 'look') {
          if (h.playerChat) h.playerChat.at = { ...s.spot };
          if (s.t >= LOOK) this.chase(s, h);
        } else if (s.stage === 'run') {
          if (s.helperPin?.arrived || dist(h.pos, s.spot) < HELP_GAP + 0.4) this.spray(s, h);
          else if (s.t >= RUN_MAX) this.lose(s);
        } else {
          h.faceTo(yawTo(h.pos, s.spot));
          this.fire.level = Math.max(0, this.fire.level - dt / SPRAY);
          if (this.fire.level <= 0) this.finish(s);
        }
        return;
      }
      case 'fizzle':
        elia.faceTo(yawTo(elia.pos, s.spot));
        this.fire.level = Math.max(0, 1 - s.t / FIZZLE);
        if (s.t >= FIZZLE) {
          this.fire.out();
          this.end(true);
        }
        return;
    }
  }

  private go(s: Scene, stage: Stage): void {
    s.stage = stage;
    s.t = 0;
  }

  /** Elia has got there: the hearth stands and the fire is lit; nobody walks through it. */
  private ignite(s: Scene): void {
    this.fire.place(s.spot.x, s.spot.z);
    this.nav.block(s.cell.cx, s.cell.cz);
    s.elia.speaking = false;
    s.elia.fireRole = 'build';
    this.go(s, 'build');
  }

  /** The nearest free person notices it and stares; false when nobody is free right now. */
  private callHelper(s: Scene, people: readonly Person[]): boolean {
    const candidates = people.filter((p) => p !== s.elia && free(p)).sort((a, b) => dist(a.pos, s.spot) - dist(b.pos, s.spot));
    for (const h of candidates) {
      const desk = h.task?.phase === 'work' ? h.task.desk : null;
      h.interrupt(); // out of the chair, the stand-up plays while she stares
      if (!h.talkTo({ ...s.spot }, LOOK + 1, false)) continue;
      h.speaking = false;
      h.fireRole = 'look'; // stares, without the talking gestures
      s.helper = h;
      s.desk = desk;
      this.go(s, 'look');
      return true;
    }
    return false;
  }

  /** She fetches the extinguisher and runs to the fire. */
  private chase(s: Scene, h: Person): void {
    const d = dist(h.pos, s.spot) || 1;
    const spot = this.nav.nearestWalkable({ x: s.spot.x + ((h.pos.x - s.spot.x) / d) * HELP_GAP, z: s.spot.z + ((h.pos.z - s.spot.z) / d) * HELP_GAP }, 4) ?? { ...h.pos };
    h.playerChat = null;
    h.pinTo({ at: spot, yaw: yawTo(spot, s.spot), walk: true });
    h.rush = true;
    s.helperPin = h.scripted;
    h.fireCarry = true;
    this.hold(h, 'hand');
    this.go(s, 'run');
  }

  /** She aims the extinguisher at it: foam comes out and the flames sink. */
  private spray(s: Scene, h: Person): void {
    // right beside it before her spot: she stops where she is
    if (!s.helperPin?.arrived) {
      h.pinTo({ at: { ...h.pos }, yaw: yawTo(h.pos, s.spot) });
      s.helperPin = h.scripted;
    }
    h.rush = false;
    h.fireRole = 'spray';
    s.elia.fireRole = 'protest';
    this.hold(h, 'aim');
    this.fire.foaming = true;
    this.go(s, 'spray');
  }

  /** Another helper takes over when the first was called away or never got there: the fire burns on until one comes. */
  private lose(s: Scene): void {
    this.dropHelper(s);
    s.lost++;
    this.fire.foaming = false;
    s.elia.fireRole = 'warm';
    s.retry = 0;
    this.go(s, 'burn');
    s.t = Math.max(s.t, s.burn);
  }

  /** It is out: the stones and logs are cleared, a charred spot stays; she walks off (back to her desk), he too. */
  private finish(s: Scene): void {
    const { elia, helper } = s;
    this.fire.out();
    if (helper) {
      this.dropHelper(s);
      const home = s.desk && !s.desk.occupant && !s.desk.pending ? s.desk : null;
      if (home) {
        home.occupant = helper;
        helper.headForDesk(home, this.nav);
      } else if (s.desk) {
        const desk = helper.office?.claim(helper) ?? null;
        if (desk) helper.headForDesk(desk, this.nav);
        else helper.moveOn();
      } else helper.moveOn();
    }
    elia.moveOn();
    this.end(true);
  }

  /** The helper is out of the scene: no pose, no run, no pin, no extinguisher. */
  private dropHelper(s: Scene): void {
    const h = s.helper;
    if (!h) return;
    h.fireRole = null;
    h.fireCarry = false;
    h.rush = false;
    if (h.playerChat) h.playerChat.t = Math.min(h.playerChat.t, 0.3);
    if (s.helperPin && h.scripted === s.helperPin) h.unpin();
    this.hold(null);
    s.helper = null;
    s.helperPin = null;
  }

  /**
   * The scene is over, however it ended: nobody keeps a pose or a pin, the floor is free again. `keepFire`: it went out
   * (the charred spot fades on its own); otherwise it is gone at once.
   */
  private end(keepFire: boolean): void {
    const s = this.scene;
    if (!s) return;
    this.scene = null;
    this.dropHelper(s);
    const { elia } = s;
    elia.fireRole = null;
    if (elia.playerChat) elia.playerChat.t = Math.min(elia.playerChat.t, 0.3);
    if (s.pin && elia.scripted === s.pin) elia.unpin();
    if (s.stage !== 'walk') this.nav.unblock(s.cell.cx, s.cell.cz);
    if (!keepFire) this.fire.clear();
    this.fire.foaming = false;
  }

  /** Puts the extinguisher into her hand, or away (null). */
  private hold(p: Person | null, how: 'hand' | 'aim' = 'hand'): void {
    const m = this.extinguisher;
    m.removeFromParent();
    m.visible = !!p;
    if (!p) return;
    p.rig.elbowR.add(m);
    if (how === 'hand') {
      // hanging by the handle from the fist, along the leg
      m.position.set(0, -0.52, 0.03);
      m.rotation.set(0, 0, 0);
    } else {
      // in the fist, the nozzle at the fire
      m.position.set(0, -0.4, 0.04);
      m.rotation.set(-Math.PI / 2, 0, 0);
    }
  }

  /** A free floor spot: open ground clear of every place people go to, the desks and everybody standing about; random, the roomiest ones first. */
  private pickSpot(people: readonly Person[], elia: Person): Vec2 | null {
    const { nav } = this;
    const roomy: Vec2[] = [];
    const tight: Vec2[] = [];
    for (let cz = 0; cz < nav.rows; cz++) {
      for (let cx = 0; cx < nav.cols; cx++) {
        const c = nav.center(cx, cz);
        if (c.x < 2 || c.x > OFFICE_W - 2 || c.z < 2 || c.z > OFFICE_D - 2.5) continue;
        if (!this.open(cx, cz, 1) || this.keep.some((k) => dist(k.at, c) < k.r)) continue;
        if (people.some((p) => p !== elia && p.inOffice && dist(p.pos, c) < 1.5)) continue;
        if (!nav.opens(c, CORRIDOR_POINT)) continue;
        (this.open(cx, cz, 2) ? roomy : tight).push(c);
      }
    }
    const spots = roomy.length ? roomy : tight;
    return spots.length ? spots[Math.floor(dice() * spots.length)] : null;
  }

  /** Free floor all around: the cells within `n` of this one are walkable. */
  private open(cx: number, cz: number, n: number): boolean {
    for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) if (!this.nav.walkable(cx + dx, cz + dz)) return false;
    return true;
  }
}

/** Out, in somebody's hands, steered, or in a meeting, call, toilet or talk: not free to be the helper any more. */
function tied(p: Person): boolean {
  return !p.inOffice || p.held || (p.controlled && !p.scripted) || p.inMeeting || !!p.phoneJob || p.boothCall || !!p.talk;
}

const smooth = (v: number) => {
  const x = Math.min(1, Math.max(0, v));
  return x * x * (3 - 2 * x);
};
