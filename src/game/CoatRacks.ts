import * as THREE from 'three';
import { buildJacket } from '../render/jacketBuilder';
import type { CoatHook, CoatRackRig } from '../render/officeModel';
import type { Person } from './Person';

interface Peg {
  rack: CoatRackRig;
  hook: CoatHook;
  owner: Person | null;
}

const v = new THREE.Vector3();

/**
 * The coat stands follow the day: whoever is in the office has their coat on a hook, whoever is out (errand, home
 * office, gone for the night) or on the way out has taken it along. People use the stand closest to their desk.
 */
export class CoatRacks {
  private pegs: Peg[] = [];
  private jackets = new Map<Person, THREE.Mesh>();
  private hung = new Map<Person, Peg>();
  /** the peg a person used last: they take it again when it is free */
  private last = new Map<Person, Peg>();

  constructor(
    private racks: readonly CoatRackRig[],
    private people: readonly Person[],
  ) {
    for (const rack of racks) for (const hook of rack.pegs) this.pegs.push({ rack, hook, owner: null });
  }

  /** Number of jackets on the pegs right now. */
  get count(): number {
    return this.hung.size;
  }

  update(): void {
    for (const p of this.people) {
      const here = p.presence === 'in';
      const peg = this.hung.get(p);
      if (here && !peg) this.hang(p);
      else if (!here && peg) this.take(p, peg);
    }
  }

  private hang(p: Person): void {
    const peg = this.freePeg(p);
    if (!peg) return; // every hook is taken: the coat stays over the chair, so to speak
    let jacket = this.jackets.get(p);
    if (!jacket) this.jackets.set(p, (jacket = buildJacket(p.member)));
    peg.owner = p;
    this.hung.set(p, peg);
    this.last.set(p, peg);
    const group = jacket.parent ?? new THREE.Group();
    group.add(jacket);
    group.position.copy(peg.hook.at);
    group.rotation.y = peg.hook.yaw;
    peg.rack.root.add(group);
  }

  private take(p: Person, peg: Peg): void {
    peg.owner = null;
    this.hung.delete(p);
    this.jackets.get(p)?.parent?.removeFromParent();
  }

  /** The hook used last if it is free, else a free one on the nearest stand that has room. */
  private freePeg(p: Person): Peg | null {
    const last = this.last.get(p);
    if (last && !last.owner) return last;
    const from = p.homeDesk?.seat ?? p.pos;
    let best: Peg | null = null;
    let bestDist = Infinity;
    for (const rack of this.racks) {
      if (!rack.root.visible) continue; // hidden in the room editor
      const free = this.pegs.filter((k) => k.rack === rack && !k.owner);
      if (!free.length) continue;
      rack.root.getWorldPosition(v);
      const dist = Math.hypot(v.x - from.x, v.z - from.z);
      if (dist >= bestDist) continue;
      bestDist = dist;
      best = free[Math.floor(Math.random() * free.length)];
    }
    return best;
  }
}
