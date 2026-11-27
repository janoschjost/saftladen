import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GLASS_ORDER, GlassSort, markGlass, markGlassSorted } from './glassSort';

// a pane across z = 0 (four metres wide, three high), the camera stands at z = 10 looking at it
function setup() {
  const scene = new THREE.Scene();
  const pane = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.03), markGlass(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
  pane.renderOrder = GLASS_ORDER;
  scene.add(pane);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1, 10);
  camera.lookAt(0, 1, 0);
  const sort = new GlassSort(scene);
  const lettering = (z: number) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ transparent: true }));
    s.position.set(0, 1, z);
    markGlassSorted(s);
    scene.add(s);
    return s;
  };
  return { scene, camera, sort, lettering };
}

describe('office.glass-sort', () => {
  it('office.glass-sort: a lettering in front of a pane is drawn after it, one behind it before it', () => {
    const { camera, sort, lettering } = setup();
    const front = lettering(2);
    const behind = lettering(-2);
    sort.update(camera);
    expect(front.renderOrder).toBeGreaterThan(GLASS_ORDER);
    expect(behind.renderOrder).toBeLessThan(GLASS_ORDER);
  });

  it('office.glass-sort: it follows the camera when it orbits to the other side', () => {
    const { camera, sort, lettering } = setup();
    const s = lettering(2);
    sort.update(camera);
    expect(s.renderOrder).toBeGreaterThan(GLASS_ORDER);
    camera.position.set(0, 1, -10);
    camera.lookAt(0, 1, 0);
    for (let i = 0; i < 4; i++) sort.update(camera); // a pass runs every few frames
    expect(s.renderOrder).toBeLessThan(GLASS_ORDER);
  });

  it('office.glass-sort: a lettering on the face of a pane is in front of it, a pane 1 cm behind it does not count', () => {
    const { scene, camera, sort } = setup();
    const letters = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.2), new THREE.MeshBasicMaterial({ transparent: true }));
    letters.position.set(0, 1, 0.015 + 0.001); // on the face of the pane
    markGlassSorted(letters);
    scene.add(letters);
    sort.update(camera);
    expect(letters.renderOrder).toBeGreaterThan(GLASS_ORDER);
  });

  it('office.glass-sort: a lettering beside the pane, not behind it, stays clean', () => {
    const { camera, sort, lettering } = setup();
    const s = lettering(-2);
    s.position.x = 5; // the view ray passes the pane's edge
    sort.update(camera);
    expect(s.renderOrder).toBeGreaterThan(GLASS_ORDER);
  });
});
