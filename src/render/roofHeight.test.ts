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
    const { pendantCords, setRoofVisible } = buildOffice(new THREE.Scene());
    const open = pendantCords.filter((c) => c.noRoof);
    expect(open.length).toBe(6);
    // top of the cord that is shown: mesh centre + half its height
    const shownTop = (c: (typeof open)[number]) => {
      const m = [c.withRoof, c.noRoof!].find((o) => o.visible)!;
      return m.position.y + (m.geometry as THREE.CylinderGeometry).parameters.height / 2;
    };
    setRoofVisible(false);
    for (const c of open) expect(shownTop(c), `pendant at ${c.x}, ${c.z}`).toBeCloseTo(4.2);
    setRoofVisible(true);
    for (const c of open) expect(shownTop(c), `pendant at ${c.x}, ${c.z}`).toBeCloseTo(roofHeightAt(c.x, c.z));
    // exactly one cord per pendant is shown
    for (const c of open) expect([c.withRoof, c.noRoof!].filter((o) => o.visible).length).toBe(1);
  });
});
