import * as THREE from 'three';

/**
 * Shows every mesh below `root` in `color`, see-through (`opacity` times its own), on copies of its materials:
 * materials shared with other objects stay as they are. Meshes whose material the game swaps itself
 * (`userData.liveMaterial`, a desk's monitor) are left alone. Returns the undo, which puts the very same materials
 * back and frees the copies.
 */
export function tint(root: THREE.Object3D, color: THREE.Color, opacity: number): () => void {
  const copies = new Map<THREE.Material, THREE.Material>();
  const copy = (m: THREE.Material): THREE.Material => {
    let c = copies.get(m);
    if (!c) {
      c = m.clone();
      if ('color' in c && c.color instanceof THREE.Color) c.color.copy(color);
      c.transparent = true;
      c.opacity = m.opacity * opacity;
      c.depthWrite = false;
      copies.set(m, c);
    }
    return c;
  };
  const was: Array<[THREE.Mesh, THREE.Material | THREE.Material[], THREE.Material | THREE.Material[]]> = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.liveMaterial) return;
    const own = o.material;
    o.material = Array.isArray(own) ? own.map(copy) : copy(own);
    was.push([o, own, o.material]);
  });
  return () => {
    for (const [mesh, own, tinted] of was) if (mesh.material === tinted) mesh.material = own; // swapped in the meantime: keep that
    for (const c of copies.values()) c.dispose();
  };
}
