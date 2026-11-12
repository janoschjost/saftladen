import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildOffice } from './officeModel';
import { BAND, H_LOW, ROOF_HI, ROOF_LO, TEETH, roofHeightAt } from './roofHeight';

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
    // no browser here: a canvas whose 2D context accepts every drawing call is enough for the textures
    const ctx: object = new Proxy(function () {}, { get: (_t, k) => (k === Symbol.toPrimitive ? () => 1 : k === 'width' ? 1 : ctx), apply: () => ctx, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
    vi.stubGlobal('Image', class {});
    const { pendantCords } = buildOffice(new THREE.Scene());
    expect(pendantCords.length).toBeGreaterThan(10);
    for (const c of pendantCords) expect(c.top, `pendant at ${c.x}, ${c.z}`).toBeLessThanOrEqual(roofHeightAt(c.x, c.z) + 1e-9);
  });
});
