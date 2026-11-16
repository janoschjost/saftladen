import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { GROUP, office, run } from '../test/office';
import { CAMERA, poseCamera } from './cameraPose';
import type { Sim } from './Sim';

installHeadlessDom();

/** the sim with the studio's person on their way, and the studio flash and monitors as the model shows them */
function shoot() {
  const sim = office();
  const studio = sim.photoStudio;
  const lights: number[] = [];
  const flash = sim.model.photoStudio.flash;
  sim.model.photoStudio.flash = (a) => (lights.push(a), flash(a));
  expect(sim.events.trigger('photo-shoot')).toMatch(/ fotografiert im Studio$/);
  const session = studio.current!;
  const screens = sim.model.photoStudio.screens;
  return { sim, studio, session, lights, p: session.person, screens, off: screens.map((s) => s.material) };
}
const phase = (sim: Sim) => sim.photoStudio.current?.phase;

describe('place.photo-shoot', () => {
  it('shoots 6-10 flashes at the product on the sweep, then edits at the desk, then leaves with everything put away', () => {
    const { sim, studio, session, lights, p, screens, off } = shoot();
    const product = sim.model.photoStudio.product;
    expect(product.visible).toBe(false);
    expect(run(sim, 60, () => phase(sim) === 'shoot')).toBe(true);
    expect(product.visible).toBe(true);
    expect(p.cameraOn).toBe(true);
    const at = studio.product;
    let facing = Infinity;
    // every shot is a flash: the camera's, and the studio's (the paper lights up)
    let flashes = 0;
    let wasLit = false;
    let lit = false;
    run(sim, 60, () => phase(sim) !== 'shoot', () => {
      if (session.shots === 2) {
        const want = Math.atan2(at.x - p.pos.x, at.z - p.pos.z);
        facing = Math.abs(Math.atan2(Math.sin(p.yaw - want), Math.cos(p.yaw - want)));
      }
      lit = p.flash > 0.9;
      if (lit && !wasLit) flashes++;
      wasLit = lit;
    });
    expect(facing).toBeLessThan(0.3); // faces the product
    expect(flashes).toBe(session.total);
    expect(Math.max(...lights)).toBeGreaterThan(0.9); // the studio lights up with them
    expect(lights.at(-1)).toBe(0);
    expect(session.total).toBeGreaterThanOrEqual(6);
    expect(session.total).toBeLessThanOrEqual(10);
    expect(product.visible).toBe(false);
    expect(p.cameraOn).toBe(false);
    // at the desk: seated, editing, both monitors show the tool
    expect(run(sim, 60, () => phase(sim) === 'edit')).toBe(true);
    expect(p.meetSeated).toBe(true);
    expect(p.editing).toBe(true);
    expect(screens.every((s, i) => s.material !== off[i])).toBe(true);
    const seat = sim.model.photoStudio.seat;
    expect(Math.hypot(p.pos.x - seat.x, p.pos.z - seat.z)).toBeLessThan(0.3);
    // 20-40 s later they get up; the monitors go dark, the studio is free again
    let editFor = 0;
    run(sim, 60, () => phase(sim) !== 'edit', () => (editFor += 1 / 60));
    expect(editFor).toBeGreaterThan(19);
    expect(editFor).toBeLessThan(41);
    expect(run(sim, 30, () => !studio.current)).toBe(true);
    expect(p.editing).toBe(false);
    expect(screens.every((s, i) => s.material === off[i])).toBe(true);
    expect(studio.free).toBe(true);
    expect(p.talk).toBe(null);
  });

  it('the studio is taken while somebody shoots or edits: a second start does nothing, the event clears it and starts again', () => {
    const { sim } = shoot();
    expect(sim.photoStudio.start(sim.people[0], sim.nav)).toBeNull();
    expect(sim.events.trigger('photo-shoot')).toMatch(/ fotografiert im Studio$/);
    run(sim, 60, () => phase(sim) === 'edit');
    expect(sim.photoStudio.start(sim.people[0], sim.nav)).toBeNull();
    expect(sim.events.trigger('photo-shoot')).toMatch(/ fotografiert im Studio$/);
  });

  it.each(['walk', 'shoot', 'sit', 'edit'] as const)('being pulled out while %s leaves no camera, product or lit monitor behind', (at) => {
    const { sim, studio, p, screens, off } = shoot();
    expect(run(sim, 90, () => phase(sim) === at)).toBe(true);
    sim.drop(p);
    p.held = true;
    run(sim, 1);
    p.held = false;
    expect(studio.current).toBe(null);
    expect(p.cameraOn).toBe(false);
    expect(p.editing).toBe(false);
    expect(sim.model.photoStudio.product.visible).toBe(false);
    expect(screens.every((s, i) => s.material === off[i])).toBe(true);
    run(sim, 20);
    expect(studio.free).toBe(true);
  });

  it('the end event sends whoever is in the studio on their way and frees it', () => {
    const { sim, studio, p } = shoot();
    run(sim, 90, () => phase(sim) === 'edit');
    expect(sim.events.trigger('photo-shoot-end')).toBe('Fotostudio wird verlassen');
    expect(run(sim, 30, () => !studio.current)).toBe(true);
    expect(p.editing).toBe(false);
    expect(studio.free).toBe(true);
    expect(sim.events.trigger('photo-shoot-end')).toMatch(/: nicht möglich$/);
  });

  it('the stand, the product, the chair and its approach are on free floor', () => {
    const sim = office();
    const { nav } = sim;
    const open = (v: { x: number; z: number }) => {
      const c = nav.toCell(v);
      return nav.walkable(c.cx, c.cz);
    };
    expect(open(sim.photoStudio.seat.approach)).toBe(true);
    expect(open(sim.model.photoStudio.stand) || !!nav.nearestWalkable(sim.model.photoStudio.stand, 3)).toBe(true);
  });
});

describe('place.photo-shoot: the camera pose', () => {
  it('both fists are on the sides of the camera, in front of the face, and the flash shows only for a shot', () => {
    const sim = office();
    const r = sim.person(GROUP[0]).rig;
    r.root.position.set(0, 0, 0);
    r.root.rotation.set(0, 0, 0);
    poseCamera(r, 1, 0, 0);
    r.root.updateMatrixWorld(true);
    const k = r.root.scale.y;
    const fist = (e: THREE.Object3D) => e.localToWorld(new THREE.Vector3(0, -0.26, 0)).divideScalar(k);
    const cam = r.camera.localToWorld(new THREE.Vector3()).divideScalar(k);
    expect(r.camera.visible).toBe(true);
    expect(fist(r.elbowL).distanceTo(cam)).toBeLessThan(0.2);
    expect(fist(r.elbowR).distanceTo(cam)).toBeLessThan(0.2);
    expect(fist(r.elbowL).x).toBeLessThan(cam.x);
    expect(fist(r.elbowR).x).toBeGreaterThan(cam.x);
    expect(cam.y).toBeGreaterThan(CAMERA.up.y - 0.1); // at head height (the head is 1.4 .. 1.76)
    expect(cam.z - 0.05).toBeGreaterThan(0.18); // its back is clear of the face
    expect(r.cameraFlash.glow.visible).toBe(false);
    poseCamera(r, 1, 1, 0);
    expect(r.cameraFlash.glow.visible).toBe(true);
    expect(r.cameraFlash.head.color.getHex()).toBe(0xffffff);
    poseCamera(r, 0, 0, 0);
    expect(r.camera.visible).toBe(false);
  });
});
