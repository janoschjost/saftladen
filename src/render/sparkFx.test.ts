import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SparkFx } from './sparkFx';

describe('place.server-rack: sparks', () => {
  it('place.server-rack: a spark is small from the frame it is born, not a 1 m cube until the next update', () => {
    const scene = new THREE.Scene();
    const fx = new SparkFx(scene);
    fx.burst(new THREE.Vector3(1, 1.3, 1), { x: 0, z: 1 }, 8);
    expect(fx.count).toBe(8);
    for (const m of scene.children) expect(Math.max(m.scale.x, m.scale.y, m.scale.z)).toBeLessThan(0.2);
  });
});
