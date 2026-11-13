import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { installHeadlessDom } from '../test/headlessDom';
import { buildOffice } from './officeModel';
import { BAND, H_LOW, ROOF_HI, ROOF_LO, TEETH, roofHeightAt } from './roofHeight';

installHeadlessDom();

describe('office.pendant-cords', () => {
  it('roof height follows the slope of each sawtooth tooth', () => {
    for (let i = 0; i < TEETH.length - 1; i++) {
      expect(roofHeightAt(TEETH[i], 4)).toBeCloseTo(ROOF_LO);
      expect(roofHeightAt(TEETH[i + 1] - 1e-9, 4)).toBeCloseTo(ROOF_HI);
    }
    expect(roofHeightAt(9.08, 4.6)).toBeCloseTo(4.10, 2);
    expect(roofHeightAt(15.884, 4.8)).toBeCloseTo(4.16, 2);
  });

  it('the low window band and the outer ends are flat ceilings', () => {
    expect(roofHeightAt(9, BAND + 0.5)).toBe(H_LOW);
    expect(roofHeightAt(30, 0)).toBe(H_LOW);
  });

  it('no pendant cord reaches above the roof underside', () => {
    const { pendantCords } = buildOffice(new THREE.Scene());
    expect(pendantCords.length).toBeGreaterThan(10);
    for (const c of pendantCords) expect(c.top, `pendant at ${c.x}, ${c.z}`).toBeLessThanOrEqual(roofHeightAt(c.x, c.z) + 1e-9);
  });

  it('roof off: every open-office cord ends at the same height (4.2), roof on: at the roof', () => {
    const scene = new THREE.Scene();
    const { pendantCords, setRoofVisible } = buildOffice(scene);
    const open = pendantCords.filter((c) => c.noRoof);
    expect(open.length).toBe(6);
    // what is drawn: the cord meshes must hang in the scene (merging items must not bake them in), visible all the way up
    const drawn = (o: THREE.Object3D) => {
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
      return o.parent !== null && scene.getObjectById(o.id) === o;
    };
    const shownTop = (c: (typeof open)[number]) => {
      const shown = [c.withRoof, c.noRoof!].filter(drawn);
      expect(shown.length, `one cord drawn at ${c.x}, ${c.z}`).toBe(1);
      scene.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(shown[0]).max.y;
    };
    setRoofVisible(false);
    for (const c of open) expect(shownTop(c), `pendant at ${c.x}, ${c.z}`).toBeCloseTo(4.2);
    setRoofVisible(true);
    for (const c of open) expect(shownTop(c), `pendant at ${c.x}, ${c.z}`).toBeCloseTo(roofHeightAt(c.x, c.z));
  });
});
