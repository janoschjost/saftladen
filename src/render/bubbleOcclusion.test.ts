import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BubbleOcclusion } from './bubbleOcclusion';
import { markGlass } from './glassSort';

// a wall across z = 0 (four metres wide, three high); the camera stands at z = 10
const mesh = (transparent = false, glass = false) => {
  const material = new THREE.MeshBasicMaterial({ transparent });
  if (glass) markGlass(material);
  return new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.3), material);
};
const group = (...m: THREE.Mesh[]) => {
  const g = new THREE.Group();
  g.add(...m);
  g.updateMatrixWorld(true);
  return g;
};
const eye = new THREE.Vector3(0, 1.5, 10);

describe('social.bubbles: hidden speaker', () => {
  it('social.bubbles: a wall between the camera and the head hides the speaker, the head in front of it does not', () => {
    const o = new BubbleOcclusion([group(mesh())]);
    expect(o.blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(true);
    expect(o.blocked(eye, new THREE.Vector3(0, 1.5, 2))).toBe(false);
    expect(o.blocked(eye, new THREE.Vector3(6, 1.5, -2))).toBe(false); // past the wall's end
  });

  it('social.bubbles: a glass pane hides the speaker like a wall, the see-through ghost of a wall does not', () => {
    expect(new BubbleOcclusion([group(mesh(true, true))]).blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(true);
    expect(new BubbleOcclusion([group(mesh(true))]).blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(false);
  });

  it('social.bubbles: a root that is switched off (the roof) does not count', () => {
    const roof = group(mesh());
    const o = new BubbleOcclusion([roof]);
    roof.visible = false;
    expect(o.blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(false);
    roof.visible = true;
    expect(o.blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(true);
  });

  it('social.bubbles: a cord or line near the ray hides nobody', () => {
    const cord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(0.5, 3, 0)]), new THREE.LineBasicMaterial());
    const g = new THREE.Group();
    g.add(cord);
    g.updateMatrixWorld(true);
    expect(new BubbleOcclusion([g]).blocked(eye, new THREE.Vector3(0, 1.5, -2))).toBe(false);
  });

  it('social.bubbles: the camera on top of the target hides nothing', () => {
    expect(new BubbleOcclusion([group(mesh())]).blocked(eye, eye.clone())).toBe(false);
  });
});
