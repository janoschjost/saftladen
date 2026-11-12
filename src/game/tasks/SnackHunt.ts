import * as THREE from 'three';
import { box, merge, propMaterial } from '../../render/geo';
import type { DayCtx, DayTask } from '../Day';
import type { Vec2 } from '../NavGrid';
import { spreadSpots } from './spots';
import { random } from '../rng';

const COUNT = 8;
const PICKUP_RADIUS = 0.7;
const QUIPS = ['Mjam!', 'Knusprig.', 'Nur eins … ok zwei.', 'Mehr davon!', 'Das zählt als Mittagessen.', 'Paprika!', 'Salz, endlich.', 'Geschäftsleitungs-Snack.'];
/** bag colour, label band colour */
const BAGS: Array<[string, string]> = [
  ['#d9342b', '#f5c518'],
  ['#2f7fd1', '#f2f2f2'],
  ['#2fa35b', '#f5c518'],
  ['#e8892b', '#7a2d12'],
  ['#8a4fc7', '#f2d37a'],
];

const beamMaterial = new THREE.MeshBasicMaterial({ color: '#8cf6c9', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const ringMaterial = new THREE.MeshBasicMaterial({ color: '#8cf6c9', transparent: true, opacity: 0.8, depthWrite: false });

interface Pickup {
  group: THREE.Group;
  bag: THREE.Object3D;
  pos: Vec2;
  phase: number;
}

/** Task 1 of Jan's day: bags of snacks lie spread over the whole office, grab them all as fast as possible. */
export class SnackHunt implements DayTask {
  readonly title = 'Snacks besorgen';
  private pickups: Pickup[] = [];
  private got = 0;
  private clock = 0;
  private geometries: THREE.BufferGeometry[] = [];
  private scene: THREE.Scene | null = null;

  get progress(): string {
    return `${this.got} / ${COUNT}`;
  }

  get done(): boolean {
    return this.got >= COUNT;
  }

  get targets(): readonly Vec2[] {
    return this.pickups.map((p) => p.pos);
  }

  start(ctx: DayCtx): void {
    this.scene = ctx.scene;
    const beam = new THREE.CylinderGeometry(0.12, 0.12, 7, 12, 1, true);
    beam.translate(0, 3.5, 0);
    const ring = new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2);
    this.geometries.push(beam, ring);
    spreadSpots(ctx, COUNT).forEach((pos, i) => {
      const [bagColor, band] = BAGS[i % BAGS.length];
      const geo = merge([
        box(0.13, 0.19, 0.05, 0, 0, 0, bagColor),
        box(0.134, 0.07, 0.052, 0, -0.01, 0, band),
        box(0.138, 0.025, 0.04, 0, 0.105, 0, '#f2d37a'),
      ]);
      this.geometries.push(geo);
      const bag = new THREE.Mesh(geo, propMaterial);
      bag.scale.setScalar(2.4);
      bag.castShadow = true;
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      group.add(bag, new THREE.Mesh(beam, beamMaterial), new THREE.Mesh(ring, ringMaterial));
      ctx.scene.add(group);
      this.pickups.push({ group, bag, pos, phase: i * 1.7 });
    });
  }

  update(dt: number, ctx: DayCtx): void {
    this.clock += dt;
    const me = ctx.person.pos;
    for (const p of [...this.pickups]) {
      p.bag.position.y = 0.75 + Math.sin(this.clock * 3 + p.phase) * 0.08;
      p.bag.rotation.y += dt * 2.2;
      if (Math.hypot(p.pos.x - me.x, p.pos.z - me.z) > PICKUP_RADIUS) continue;
      this.pickups.splice(this.pickups.indexOf(p), 1);
      this.remove(p);
      this.got++;
      ctx.person.grabSnack();
      ctx.say(QUIPS[Math.floor(random() * QUIPS.length)]);
    }
  }

  dispose(): void {
    this.pickups.forEach((p) => this.remove(p));
    this.pickups = [];
    this.geometries.forEach((g) => g.dispose());
    this.geometries = [];
  }

  private remove(p: Pickup): void {
    this.scene?.remove(p.group);
  }
}
