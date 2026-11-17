import type { NavGrid, Vec2 } from './NavGrid';
import type { Walker } from './Walker';

const NARROW = 2; // free cells across: up to this wide two bodies cannot pass each other
const APPROACH = 1.6; // metres of route ahead that are checked for a passage entrance
const APPROACH_WAITING = 3.2; // ... for somebody already waiting (who may have shuffled back from the entrance)
const STALE = 0.4; // seconds without a refresh until a reservation lapses (its holder stopped walking)
const OPPOSITE = -0.3; // dot product of two travel directions below which they count as oncoming
const HEAD_ON = 2.2; // metres between two walkers facing each other inside a passage at which one of them backs out
const RECHECK = 0.5; // seconds between two looks at the same head-on meeting
const TURN = 1; // seconds somebody on the other side must have waited longer than us to go first

interface Hold {
  /** travel direction through the passage (unit vector; 0,0 = not going anywhere yet) */
  dx: number;
  dz: number;
  /** traffic clock of the last refresh */
  stamp: number;
  /** traffic clock when the reservation was made, and when a head-on meeting was last looked into */
  since: number;
  checked: number;
  /** the holder has been inside (it is not just about to go in) */
  entered: boolean;
  /** seconds the walker has been waiting in front of the passage (a holder: before it got the passage) */
  waited: number;
}

interface Passage {
  /** walkers inside or just about to enter */
  holds: Map<Walker, Hold>;
  /** walkers standing in front of it until the oncoming traffic is through */
  waits: Map<Walker, Hold>;
  /** bodies standing around inside (not walking, not pinned to a seat): they plug it for everybody */
  standing: Walker[];
}

/** A passage a walker has to wait for: where its route enters it and which way it leads in. */
export interface Gate {
  passage: number;
  mouth: Vec2;
  dx: number;
  dz: number;
}

/**
 * Narrow spots of the floor (doorways, corridors, gaps between desks) and who may walk through them.
 * A passage is a run of cells too narrow for two bodies side by side. It carries traffic in one direction at a time:
 * whoever is inside (or got there first) goes on, followers in the same direction queue up behind,
 * everybody heading the other way waits in front of the entrance until it is empty. The two sides take turns:
 * nobody new joins the flow while somebody on the other side has been waiting for longer. Whoever got the passage after
 * waiting keeps that wait, even when somebody coming out still holds it up.
 * Somebody standing around inside plugs the passage for both sides until they have moved on.
 * Reservations lapse on their own as soon as the holder stops walking, so nothing can stay locked.
 */
export class Passages {
  /** passage index per nav cell, -1 = open floor */
  private id: Int16Array;
  private list: Passage[] = [];
  private clock = 0;

  constructor(private nav: NavGrid) {
    this.id = new Int16Array(nav.cols * nav.rows).fill(-1);
    this.rebuild();
  }

  /** Finds the passages again (the walkable floor changed). */
  rebuild(): void {
    const { nav } = this;
    const { cols, rows } = nav;
    const n = cols * rows;
    // free width across each cell, per axis
    const runX = new Uint16Array(n);
    const runZ = new Uint16Array(n);
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < cols; x++) {
        if (!nav.walkable(x, z)) continue;
        let e = x;
        while (nav.walkable(e + 1, z)) e++;
        for (let k = x; k <= e; k++) runX[z * cols + k] = e - x + 1;
        x = e;
      }
    }
    for (let x = 0; x < cols; x++) {
      for (let z = 0; z < rows; z++) {
        if (!nav.walkable(x, z)) continue;
        let e = z;
        while (nav.walkable(x, e + 1)) e++;
        for (let k = z; k <= e; k++) runZ[k * cols + x] = e - z + 1;
        z = e;
      }
    }
    // 1 = narrow across x (runs along z), 2 = narrow across z (runs along x)
    const kind = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const rx = runX[i];
      const rz = runZ[i];
      if (!rx || (rx > NARROW && rz > NARROW)) continue;
      kind[i] = rx <= rz ? 1 : 2;
    }
    this.id.fill(-1);
    this.list = [];
    for (let i = 0; i < n; i++) {
      if (!kind[i] || this.id[i] >= 0) continue;
      const p = this.list.length;
      this.list.push({ holds: new Map(), waits: new Map(), standing: [] });
      const stack = [i];
      this.id[i] = p;
      while (stack.length) {
        const c = stack.pop()!;
        const cx = c % cols;
        const cz = (c / cols) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (!nav.inside(nx, nz)) continue;
          const ni = nz * cols + nx;
          if (kind[ni] !== kind[i] || this.id[ni] >= 0) continue;
          this.id[ni] = p;
          stack.push(ni);
        }
      }
    }
  }

  tick(dt: number, walkers: readonly Walker[]): void {
    this.clock += dt;
    for (const p of this.list) if (p.standing.length) p.standing = [];
    for (const w of walkers) {
      if (w.away || w.fixed || w.companion || w.state !== 'idle') continue; // pets lie next to their owner: people get past them
      const here = this.at(w.pos);
      if (here >= 0) this.list[here].standing.push(w);
    }
  }

  /** Passage at `p`, or -1 on open floor. */
  at(p: Vec2): number {
    const { cx, cz } = this.nav.toCell(p);
    return this.nav.inside(cx, cz) ? this.id[cz * this.nav.cols + cx] : -1;
  }

  /** Passage of the cell with that index (cz * cols + cx), or -1. */
  atIndex(i: number): number {
    return this.id[i];
  }

  /** True if any cell of the route lies in `passage`. */
  crosses(path: readonly Vec2[], passage: number): boolean {
    for (const p of path) if (this.at(p) === passage) return true;
    return false;
  }

  /**
   * Called every step by a walker following `path`. Keeps its reservation of the passage it is in alive and asks for the next
   * one on its route. Returns the gate it has to wait at, or null if the way is free (the passage is then reserved for it).
   * `waited` is how long it has been waiting already; with `force` the next passage is taken no matter what (deadlock fallback).
   */
  gate(w: Walker, path: readonly Vec2[], waited = 0, force = false): Gate | null {
    const here = this.at(w.pos);
    if (here >= 0) {
      const v = this.heading(w, path, here, 0);
      this.hold(w, here, v.x, v.z);
    }
    // the first other passage on the route within reach
    let px = w.pos.x;
    let pz = w.pos.z;
    let walked = 0;
    const reach = waited > 0 ? APPROACH_WAITING : APPROACH;
    for (let i = 0; i < path.length; i++) {
      const q = path[i];
      walked += Math.hypot(q.x - px, q.z - pz);
      if (walked > reach) break;
      const next = this.at(q);
      if (next < 0 || next === here) {
        px = q.x;
        pz = q.z;
        continue;
      }
      const v = this.heading(w, path, next, i);
      const p = this.list[next];
      // the wait already had at this entrance, this way in (in front of it, or holding it): see the class doc
      let credit = waited;
      for (const h of [p.holds.get(w), p.waits.get(w)]) {
        if (h && this.clock - h.stamp <= STALE && h.dx * v.x + h.dz * v.z > 0) credit = Math.max(credit, h.waited);
      }
      if (!force && this.opposed(w, next, v.x, v.z, credit)) {
        p.waits.set(w, { dx: v.x, dz: v.z, waited: credit, stamp: this.clock, since: this.clock, checked: 0, entered: false });
        // the lane leads from the last step on open floor into the passage
        const lx = q.x - px;
        const lz = q.z - pz;
        const l = Math.hypot(lx, lz) || 1;
        return { passage: next, mouth: q, dx: lx / l, dz: lz / l };
      }
      p.waits.delete(w);
      this.hold(w, next, v.x, v.z, credit);
      break;
    }
    return null;
  }

  /**
   * Two walkers met face to face inside the passage `w` is in (somebody got up from a desk in there, or came in from a side):
   * they cannot pass, so one backs out. That is the one who came in later, unless it is cornered and only the other can leave.
   * Returns the spot on open floor `w` has to retreat to, or null if it may go on.
   */
  headOn(w: Walker): Vec2 | null {
    const here = this.at(w.pos);
    if (here < 0) return null;
    const p = this.list[here];
    const mine = p.holds.get(w);
    if (!mine || (!mine.dx && !mine.dz) || this.clock - mine.checked < RECHECK) return null;
    for (const [o, h] of p.holds) {
      if (o === w || w.ignores(o) || this.clock - h.stamp > STALE || this.at(o.pos) !== here) continue;
      if (h.dx * mine.dx + h.dz * mine.dz >= OPPOSITE) continue;
      const ox = o.pos.x - w.pos.x;
      const oz = o.pos.z - w.pos.z;
      if (Math.hypot(ox, oz) > HEAD_ON || ox * mine.dx + oz * mine.dz <= 0) continue; // far away, or already behind us
      mine.checked = this.clock;
      const out = this.escape(w, o, here);
      if (!out) continue;
      if (mine.since >= h.since || !this.escape(o, w, here)) return out;
    }
    return null;
  }

  /** The closest open floor `w` can reach from inside `passage` without getting past `o`. */
  private escape(w: Walker, o: Walker, passage: number): Vec2 | null {
    const { nav } = this;
    const { cols } = nav;
    const start = nav.toCell(w.pos);
    const keep = w.radius + o.radius;
    const seen = new Set<number>([start.cz * cols + start.cx]);
    let ring = [start.cz * cols + start.cx];
    let exit = -1;
    let exitDepth = 0;
    for (let depth = 1; ring.length && seen.size < 600; depth++) {
      const next: number[] = [];
      for (const c of ring) {
        const cx = c % cols;
        const cz = (c / cols) | 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = (cz + dz) * cols + cx + dx;
          if (seen.has(ni) || !nav.walkable(cx + dx, cz + dz)) continue;
          seen.add(ni);
          const q = nav.center(cx + dx, cz + dz);
          if (Math.hypot(q.x - o.pos.x, q.z - o.pos.z) < keep) continue; // the other one stands there
          if (this.id[ni] !== passage) {
            if (exit < 0) {
              exit = ni;
              exitDepth = depth;
            }
            // a few steps away from the entrance, so whoever comes out after us has room
            if (this.id[ni] < 0 && depth >= exitDepth + 3) return q;
          }
          next.push(ni);
        }
      }
      ring = next;
    }
    return exit < 0 ? null : nav.center(exit % cols, (exit / cols) | 0);
  }

  /** Which way the walker travels through the passage: towards the first waypoint behind it (or the last one of the route). */
  private heading(w: Walker, path: readonly Vec2[], passage: number, from: number): Vec2 {
    let end = path.length - 1;
    for (let i = from; i < path.length; i++) {
      if (this.at(path[i]) !== passage) {
        end = i;
        break;
      }
    }
    const t = path[end];
    if (!t) return { x: 0, z: 0 };
    const x = t.x - w.pos.x;
    const z = t.z - w.pos.z;
    const l = Math.hypot(x, z);
    return l < this.nav.cell * 0.6 ? { x: 0, z: 0 } : { x: x / l, z: z / l };
  }

  /** Oncoming traffic in the passage, or somebody on the other side whose turn comes first. */
  private opposed(w: Walker, passage: number, dx: number, dz: number, waited: number): boolean {
    const p = this.list[passage];
    for (const o of p.standing) if (o !== w && !w.ignores(o)) return true;
    if (!dx && !dz) return false;
    const since = p.holds.get(w)?.since ?? Infinity;
    for (const [o, h] of p.holds) {
      if (this.clock - h.stamp > STALE || o.away) p.holds.delete(o);
      else if (o === w || w.ignores(o)) continue;
      else if (h.dx * dx + h.dz * dz < OPPOSITE) return true;
      // one at a time through the entrance: whoever got there first goes in, then the next follows
      else if (h.since < since && !h.entered && this.at(o.pos) !== passage) return true;
    }
    for (const [o, h] of p.waits) {
      if (this.clock - h.stamp > STALE || o.away) p.waits.delete(o);
      else if (o !== w && !w.ignores(o) && h.dx * dx + h.dz * dz < OPPOSITE && h.waited > waited + TURN) return true;
    }
    return false;
  }

  private hold(w: Walker, passage: number, dx: number, dz: number, waited = 0): void {
    const holds = this.list[passage].holds;
    const h = holds.get(w);
    const inside = this.at(w.pos) === passage;
    if (!h) holds.set(w, { dx, dz, stamp: this.clock, since: this.clock, checked: 0, entered: inside, waited });
    else {
      h.waited = Math.max(h.waited, waited);
      h.entered ||= inside;
      // close to the way out the direction gets vague: keep the one it came in with
      if (dx || dz) {
        h.dx = dx;
        h.dz = dz;
      }
      h.stamp = this.clock;
    }
  }
}
