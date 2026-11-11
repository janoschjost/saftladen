export interface Vec2 {
  x: number;
  z: number;
}

/** Uniform walkability grid (1 cell = `cell` metres) with 8-way A*. */
export class NavGrid {
  private blocked: Uint8Array;

  constructor(
    readonly cols: number,
    readonly rows: number,
    readonly cell = 1,
  ) {
    this.blocked = new Uint8Array(cols * rows);
  }

  block(cx: number, cz: number, w = 1, d = 1): void {
    for (let z = cz; z < cz + d; z++) for (let x = cx; x < cx + w; x++) if (this.inside(x, z)) this.blocked[z * this.cols + x] = 1;
  }

  unblock(cx: number, cz: number): void {
    if (this.inside(cx, cz)) this.blocked[cz * this.cols + cx] = 0;
  }

  /** Blocks every cell overlapped by the world-space rectangle (touching edges do not count). */
  blockWorld(x0: number, z0: number, x1: number, z1: number): void {
    const e = 0.02;
    const cx0 = Math.floor((x0 + e) / this.cell);
    const cz0 = Math.floor((z0 + e) / this.cell);
    const cx1 = Math.floor((x1 - e) / this.cell);
    const cz1 = Math.floor((z1 - e) / this.cell);
    this.block(cx0, cz0, cx1 - cx0 + 1, cz1 - cz0 + 1);
  }

  /** Blocks every walkable cell that cannot be reached from `from`, so nobody spawns in a sealed pocket. Returns the count. */
  sealUnreachable(from: Vec2): number {
    const s = this.toCell(from);
    const seen = new Uint8Array(this.cols * this.rows);
    const stack = [s.cz * this.cols + s.cx];
    if (!this.walkable(s.cx, s.cz)) return 0;
    seen[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const cx = i % this.cols;
      const cz = (i / this.cols) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const nz = cz + dz;
        const ni = nz * this.cols + nx;
        if (!this.walkable(nx, nz) || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }
    let sealed = 0;
    for (let i = 0; i < seen.length; i++) {
      if (!seen[i] && !this.blocked[i]) {
        this.blocked[i] = 1;
        sealed++;
      }
    }
    return sealed;
  }

  inside(cx: number, cz: number): boolean {
    return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows;
  }

  walkable(cx: number, cz: number): boolean {
    return this.inside(cx, cz) && !this.blocked[cz * this.cols + cx];
  }

  toCell(p: Vec2): { cx: number; cz: number } {
    return { cx: Math.floor(p.x / this.cell), cz: Math.floor(p.z / this.cell) };
  }

  center(cx: number, cz: number): Vec2 {
    return { x: (cx + 0.5) * this.cell, z: (cz + 0.5) * this.cell };
  }

  randomWalkable(): { cx: number; cz: number } {
    for (let i = 0; i < 200; i++) {
      const cx = Math.floor(Math.random() * this.cols);
      const cz = Math.floor(Math.random() * this.rows);
      if (this.walkable(cx, cz)) return { cx, cz };
    }
    return { cx: 0, cz: 0 };
  }

  /**
   * Pushes a body (circle of radius r at p, mutated in place) out of blocked cells so nobody ends up inside walls,
   * windows or furniture. If the centre itself is already in a blocked cell it is moved to the nearest free one.
   */
  resolve(p: Vec2, r: number): void {
    for (let it = 0; it < 3; it++) {
      const { cx, cz } = this.toCell(p);
      if (!this.walkable(cx, cz)) {
        const free = this.nearestWalkable(p, 8);
        if (free) {
          p.x = free.x;
          p.z = free.z;
        }
        return;
      }
      const reach = Math.ceil(r / this.cell);
      let moved = false;
      for (let dz = -reach; dz <= reach; dz++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if ((!dx && !dz) || this.walkable(cx + dx, cz + dz)) continue;
          const x0 = (cx + dx) * this.cell;
          const z0 = (cz + dz) * this.cell;
          const qx = Math.min(Math.max(p.x, x0), x0 + this.cell);
          const qz = Math.min(Math.max(p.z, z0), z0 + this.cell);
          let ox = p.x - qx;
          let oz = p.z - qz;
          let d = Math.hypot(ox, oz);
          if (d >= r) continue;
          if (d < 1e-6) {
            // exactly on the cell edge: push straight away from the blocked cell
            ox = -dx;
            oz = -dz;
            d = Math.hypot(ox, oz) || 1;
          }
          const push = (r - Math.hypot(p.x - qx, p.z - qz)) / d;
          p.x += ox * push;
          p.z += oz * push;
          moved = true;
        }
      }
      if (!moved) return;
    }
  }

  /** Closest walkable cell centre to p (expanding square search), or null if none within `maxRing` cells. */
  nearestWalkable(p: Vec2, maxRing = 4): Vec2 | null {
    const { cx, cz } = this.toCell(p);
    if (this.walkable(cx, cz)) return p;
    let best: Vec2 | null = null;
    let bestD = Infinity;
    for (let r = 1; r <= maxRing && !best; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !this.walkable(cx + dx, cz + dz)) continue;
          const c = this.center(cx + dx, cz + dz);
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
      }
    }
    return best;
  }

  /** Returns waypoints (cell centres) from the start cell to the goal cell, excluding the start. */
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const s = this.toCell(from);
    const g = this.toCell(to);
    if (!this.walkable(g.cx, g.cz)) return [];
    const idx = (x: number, z: number) => z * this.cols + x;
    const start = idx(s.cx, s.cz);
    const goal = idx(g.cx, g.cz);
    const gScore = new Float32Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const open: Array<{ i: number; f: number }> = [{ i: start, f: 0 }];
    gScore[start] = 0;
    const h = (x: number, z: number) => {
      const dx = Math.abs(x - g.cx);
      const dz = Math.abs(z - g.cz);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };

    while (open.length) {
      let best = 0;
      for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
      const cur = open.splice(best, 1)[0].i;
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const cx = cur % this.cols;
      const cz = (cur / this.cols) | 0;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx;
          const nz = cz + dz;
          if (!this.walkable(nx, nz)) continue;
          // no corner cutting
          if (dx && dz && (!this.walkable(cx + dx, cz) || !this.walkable(cx, cz + dz))) continue;
          const ni = idx(nx, nz);
          const ng = gScore[cur] + (dx && dz ? Math.SQRT2 : 1);
          if (ng < gScore[ni]) {
            gScore[ni] = ng;
            came[ni] = cur;
            open.push({ i: ni, f: ng + h(nx, nz) });
          }
        }
      }
    }

    if (came[goal] === -1 && goal !== start) return [];
    const path: Vec2[] = [];
    for (let c = goal; c !== start; c = came[c]) path.push(this.center(c % this.cols, (c / this.cols) | 0));
    return path.reverse();
  }
}
