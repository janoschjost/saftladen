import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { tint } from './tint';

const RED = new THREE.Color(0xff0a2a);

describe('editor.placement', () => {
  it('editor.placement: the item over a blocked spot turns red and see-through, nothing else does, and it gets its own materials back', () => {
    const shared = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
    const second = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const item = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), [shared, second]);
    const screen = new THREE.Mesh(new THREE.BoxGeometry(), second);
    screen.userData.liveMaterial = true; // the game swaps it on its own
    const glass = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.2 }));
    item.add(a, new THREE.Group().add(b), screen, glass);
    const other = new THREE.Mesh(new THREE.BoxGeometry(), shared); // another item with the same material

    const undo = tint(item, RED, 0.5);
    const tinted = [a.material, ...(b.material as THREE.Material[])] as THREE.MeshLambertMaterial[];
    for (const m of tinted) {
      expect(m.color.equals(RED)).toBe(true);
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBe(0.5);
    }
    expect(a.material).not.toBe(shared);
    expect((b.material as THREE.Material[])[0]).toBe(a.material); // one copy per material
    expect(other.material).toBe(shared);
    expect(screen.material).toBe(second);
    expect((glass.material as THREE.Material).opacity).toBeCloseTo(0.1); // see-through stays more see-through
    expect(shared.color.getHex()).toBe(0x8b5a2b);
    expect(shared.transparent).toBe(false);

    undo();
    expect(a.material).toBe(shared);
    expect(b.material).toEqual([shared, second]);
    expect((b.material as THREE.Material[])[1]).toBe(second);
    expect(second.opacity).toBe(1);
  });
});
