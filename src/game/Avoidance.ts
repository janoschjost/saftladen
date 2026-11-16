import type { NavGrid, Vec2 } from './NavGrid';

/**
 * Local collision avoidance with optimal reciprocal collision avoidance (ORCA, van den Berg et al. 2011, as in RVO2).
 * Each body gets the velocity closest to the one it wants that keeps it clear of every neighbour for `TAU` seconds
 * and of the walls for `TAU_WALL` seconds. Two walking bodies each take half of the avoiding, so they pass each other
 * smoothly instead of both stopping; whoever stands still (idle, seated, waiting) is a fixed obstacle the walker goes around.
 * Who takes how much of the avoiding is up to the caller (`Body.share`): right of way at bottlenecks keeps two bodies
 * that squeeze into the same doorway from blocking each other for good.
 */

/** seconds ahead in which neighbours must not be hit: larger = earlier, gentler swerves, but more cautious in a crowd */
const TAU = 1;
/** ... and walls (only matter close by; the route already keeps off them) */
const TAU_WALL = 0.35;
const EPS = 1e-5;
/** how close a body may come to a wall (nav cells are 0.5 m, so less than a body's radius towards other bodies) */
export const WALL_CLEARANCE = 0.2;

export interface Body {
  pos: Vec2;
  /** current velocity (m/s) */
  vel: Vec2;
  radius: number;
  /** how much of the avoiding between the two falls to the walker that avoids this body: 1 = all (it stands still, or has right of way), 0.5 = half each */
  share: number;
}

/** A half-plane of allowed velocities: everything left of `dir` through `point`. */
interface Line {
  px: number;
  pz: number;
  dx: number;
  dz: number;
}

const det = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** Constraint keeping `self` from colliding with `o` within TAU, given both velocities. */
function bodyLine(self: Omit<Body, 'share'>, o: Body, dt: number): Line {
  const rx = o.pos.x - self.pos.x;
  const rz = o.pos.z - self.pos.z;
  const vx = self.vel.x - o.vel.x;
  const vz = self.vel.z - o.vel.z;
  const distSq = rx * rx + rz * rz;
  const r = self.radius + o.radius;
  const rSq = r * r;
  let dx: number;
  let dz: number;
  let ux: number;
  let uz: number;
  if (distSq > rSq) {
    const inv = 1 / TAU;
    // vector from the cut-off circle's centre to the relative velocity
    const wx = vx - inv * rx;
    const wz = vz - inv * rz;
    const wSq = wx * wx + wz * wz;
    const dot1 = wx * rx + wz * rz;
    if (dot1 < 0 && dot1 * dot1 > rSq * wSq) {
      // closest to the cut-off circle
      const wl = Math.sqrt(wSq);
      const nx = wx / wl;
      const nz = wz / wl;
      dx = nz;
      dz = -nx;
      ux = (r * inv - wl) * nx;
      uz = (r * inv - wl) * nz;
    } else {
      // closest to one of the cone's legs
      const leg = Math.sqrt(distSq - rSq);
      if (det(rx, rz, wx, wz) > 0) {
        dx = (rx * leg - rz * r) / distSq;
        dz = (rx * r + rz * leg) / distSq;
      } else {
        dx = -(rx * leg + rz * r) / distSq;
        dz = -(-rx * r + rz * leg) / distSq;
      }
      const dot2 = vx * dx + vz * dz;
      ux = dot2 * dx - vx;
      uz = dot2 * dz - vz;
    }
  } else {
    // already overlapping: get apart within this step
    const inv = 1 / dt;
    const wx = vx - inv * rx;
    const wz = vz - inv * rz;
    const wl = Math.hypot(wx, wz) || EPS;
    const nx = wx / wl;
    const nz = wz / wl;
    dx = nz;
    dz = -nx;
    ux = (r * inv - wl) * nx;
    uz = (r * inv - wl) * nz;
  }
  return { px: self.vel.x + o.share * ux, pz: self.vel.z + o.share * uz, dx, dz };
}

/** Constraints keeping a body of radius `r` at `p` off the blocked cells around it. */
function wallLines(nav: NavGrid, p: Vec2, r: number, out: Line[]): void {
  const reach = r + 0.45;
  nav.blockedNear(p, reach, (qx, qz) => {
    const ox = p.x - qx;
    const oz = p.z - qz;
    const d = Math.hypot(ox, oz);
    if (d >= reach || d < EPS) return;
    const nx = ox / d;
    const nz = oz / d;
    // velocity towards the wall at most what closes the gap within TAU_WALL: v·n >= -(d - r) / TAU_WALL
    const c = -(d - r) / TAU_WALL;
    out.push({ px: nx * c, pz: nz * c, dx: nz, dz: -nx });
  });
}

interface Result {
  x: number;
  z: number;
}

function lp1(lines: Line[], no: number, radius: number, ox: number, oz: number, dirOpt: boolean, res: Result): boolean {
  const l = lines[no];
  const dot = l.px * l.dx + l.pz * l.dz;
  const disc = dot * dot + radius * radius - (l.px * l.px + l.pz * l.pz);
  if (disc < 0) return false;
  const s = Math.sqrt(disc);
  let tl = -dot - s;
  let tr = -dot + s;
  for (let i = 0; i < no; i++) {
    const m = lines[i];
    const den = det(l.dx, l.dz, m.dx, m.dz);
    const num = det(m.dx, m.dz, l.px - m.px, l.pz - m.pz);
    if (Math.abs(den) <= EPS) {
      if (num < 0) return false;
      continue;
    }
    const t = num / den;
    if (den >= 0) tr = Math.min(tr, t);
    else tl = Math.max(tl, t);
    if (tl > tr) return false;
  }
  let t: number;
  if (dirOpt) t = ox * l.dx + oz * l.dz > 0 ? tr : tl;
  else t = Math.min(tr, Math.max(tl, l.dx * (ox - l.px) + l.dz * (oz - l.pz)));
  res.x = l.px + t * l.dx;
  res.z = l.pz + t * l.dz;
  return true;
}

function lp2(lines: Line[], radius: number, ox: number, oz: number, dirOpt: boolean, res: Result): number {
  const ol = Math.hypot(ox, oz);
  if (dirOpt) {
    res.x = ox * radius;
    res.z = oz * radius;
  } else if (ol > radius) {
    res.x = (ox / ol) * radius;
    res.z = (oz / ol) * radius;
  } else {
    res.x = ox;
    res.z = oz;
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (det(l.dx, l.dz, l.px - res.x, l.pz - res.z) > 0) {
      const kx = res.x;
      const kz = res.z;
      if (!lp1(lines, i, radius, ox, oz, dirOpt, res)) {
        res.x = kx;
        res.z = kz;
        return i;
      }
    }
  }
  return lines.length;
}

/** No velocity satisfies everything (a crowd presses in): the one that violates the body constraints least, walls kept. */
function lp3(lines: Line[], walls: number, begin: number, radius: number, res: Result): void {
  let distance = 0;
  for (let i = begin; i < lines.length; i++) {
    const li = lines[i];
    if (det(li.dx, li.dz, li.px - res.x, li.pz - res.z) <= distance) continue;
    const proj = lines.slice(0, walls);
    for (let j = walls; j < i; j++) {
      const lj = lines[j];
      const d = det(li.dx, li.dz, lj.dx, lj.dz);
      let px: number;
      let pz: number;
      if (Math.abs(d) <= EPS) {
        if (li.dx * lj.dx + li.dz * lj.dz > 0) continue;
        px = 0.5 * (li.px + lj.px);
        pz = 0.5 * (li.pz + lj.pz);
      } else {
        const t = det(lj.dx, lj.dz, li.px - lj.px, li.pz - lj.pz) / d;
        px = li.px + t * li.dx;
        pz = li.pz + t * li.dz;
      }
      const ddx = lj.dx - li.dx;
      const ddz = lj.dz - li.dz;
      const dl = Math.hypot(ddx, ddz) || EPS;
      proj.push({ px, pz, dx: ddx / dl, dz: ddz / dl });
    }
    const kx = res.x;
    const kz = res.z;
    if (lp2(proj, radius, -li.dz, li.dx, true, res) < proj.length) {
      res.x = kx;
      res.z = kz;
    }
    distance = det(li.dx, li.dz, li.px - res.x, li.pz - res.z);
  }
}

/**
 * The velocity `self` should walk with: as close to `want` as possible, at most `maxSpeed`, without running into
 * `others` or the walls. `wallRadius` is how close the body may come to a wall (smaller than its radius towards bodies).
 */
export function avoid(self: Omit<Body, 'share'>, want: Vec2, maxSpeed: number, others: readonly Body[], nav: NavGrid, wallRadius: number, dt: number): Vec2 {
  const lines: Line[] = [];
  wallLines(nav, self.pos, wallRadius, lines);
  const walls = lines.length;
  for (const o of others) lines.push(bodyLine(self, o, dt));
  const res: Result = { x: 0, z: 0 };
  const failed = lp2(lines, maxSpeed, want.x, want.z, false, res);
  if (failed < lines.length) lp3(lines, walls, failed, maxSpeed, res);
  return { x: res.x, z: res.z };
}
