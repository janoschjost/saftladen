import * as THREE from 'three';
import { box, merge, propMaterial } from './geo';

/**
 * Clawd, Claude's mascot (#232): a wide orange block with two stub arms, two tall dark eyes and four short legs, in
 * metres (about 0.3 m tall at size 1, front is +z). It is its own little voxel build, not a copy of anybody's logo.
 */
const C = { orange: '#ff9a68', shade: '#e0764a', eye: '#1b1b22' };

/** a little self-lit, so he stays orange in the dark credits room */
const material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#8a4520' });

export interface ClawdRig {
  root: THREE.Group;
  /** everything but the legs: bobs and squashes */
  body: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  /** front left, front right, back left, back right */
  legs: THREE.Group[];
  eyes: THREE.Group;
  /** bigger than he looks, so a tap finds him (never drawn) */
  hit: THREE.Mesh;
}

const part = (geos: THREE.BufferGeometry[]): THREE.Mesh => {
  const m = new THREE.Mesh(merge(geos), material);
  m.castShadow = true;
  return m;
};

export function buildClawd(size = 1): ClawdRig {
  const root = new THREE.Group();
  const LEG = 0.09;

  const body = new THREE.Group();
  body.position.y = LEG;
  body.add(part([box(0.34, 0.2, 0.2, 0, 0.1, 0, C.orange), box(0.34, 0.03, 0.2, 0, 0.015, 0, C.shade)]));

  const eyes = new THREE.Group();
  eyes.position.set(0, 0.12, 0.101);
  for (const sx of [-1, 1]) eyes.add(part([box(0.04, 0.07, 0.01, sx * 0.075, 0, 0, C.eye)]));
  body.add(eyes);

  const arm = (sx: number): THREE.Group => {
    const g = new THREE.Group();
    g.position.set(sx * 0.17, 0.15, 0); // the shoulder, on the body's side; the stub hangs down and swings forward from here
    g.add(part([box(0.07, 0.13, 0.07, sx * 0.035, -0.06, 0, C.orange)]));
    body.add(g);
    return g;
  };
  const armL = arm(-1);
  const armR = arm(1);

  const legs = [
    [-0.12, 0.05],
    [0.12, 0.05],
    [-0.12, -0.05],
    [0.12, -0.05],
  ].map(([x, z]) => {
    const g = new THREE.Group();
    g.position.set(x, LEG, z); // the hip
    g.add(part([box(0.05, LEG, 0.05, 0, -LEG / 2, 0, C.shade)]));
    root.add(g);
    return g;
  });

  const hit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.5), new THREE.MeshBasicMaterial({ visible: false }));
  hit.position.y = 0.22;
  root.add(body, hit);
  root.scale.setScalar(size);
  return { root, body, armL, armR, legs, eyes, hit };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

export interface ClawdDesk {
  group: THREE.Group;
  /** Clawd types, thinks and blinks; `t` in seconds */
  tick(t: number): void;
}

/**
 * Clawd at work (#232): a little stool, a little desk and a little laptop (its screen faces him), in metres, standing on
 * the big desk. He sits side on to the room, so the laptop does not hide him: stub arms tap the keys in bursts, he leans
 * in and out, blinks, and sparks turn and drift round his head while he thinks, bits rising off his keys.
 */
export function buildClawdDesk(laptop: THREE.Object3D): ClawdDesk {
  const group = new THREE.Group();
  const SEAT = 0.11;
  const TOP = 0.2;
  const LEGS = '#8b919c';
  const ZC = -0.09; // Clawd's depth: he sits just behind the desk, facing the room like Marco and Janosch
  const ZD = 0.15; // the desk's

  const stool = [box(0.2, 0.02, 0.18, 0, SEAT - 0.01, ZC, '#23262d'), box(0.2, 0.12, 0.016, 0, SEAT + 0.06, ZC - 0.09, '#23262d')]; // seat and back rest
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) stool.push(box(0.016, SEAT - 0.02, 0.016, sx * 0.085, (SEAT - 0.02) / 2, ZC + sz * 0.075, LEGS));

  const desk = [box(0.46, 0.014, 0.24, 0, TOP - 0.007, ZD, '#3a3f4b')];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) desk.push(box(0.016, TOP - 0.014, 0.016, sx * 0.2, (TOP - 0.014) / 2, ZD + sz * 0.1, LEGS));
  for (const parts of [stool, desk]) {
    const m = new THREE.Mesh(merge(parts), propMaterial);
    m.castShadow = true;
    group.add(m);
  }

  // the same laptop as Marco's and Janosch's, smaller; it comes in desk coordinates (the desk top at 0.74, the hinge at 0.73)
  const K = 0.42;
  laptop.scale.setScalar(K);
  laptop.position.set(0, TOP - 0.74 * K, ZD + 0.05 - 0.73 * K);
  group.add(laptop);

  const rig = buildClawd(1.2);
  rig.root.position.set(0, SEAT - 0.012, ZC);
  rig.legs.forEach((leg, i) => (leg.rotation.x = -0.85 + (i > 1 ? 0.05 : 0))); // legs stick out over the seat
  group.add(rig.root);

  // Claude's sparks: stars that turn and drift round his head while he thinks, and bits that rise off the keys
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const starGeo = (color: string): THREE.BufferGeometry => merge([box(0.05, 0.012, 0.012, 0, 0, 0, color), box(0.012, 0.05, 0.012, 0, 0, 0, color), box(0.012, 0.012, 0.05, 0, 0, 0, color)]);
  const stars = ['#ffd2b0', '#ff9a68', '#fff1dc', '#ffb48a'].map((color, i) => {
    const mesh = new THREE.Mesh(starGeo(color), glow);
    group.add(mesh);
    return { mesh, phase: i * 2.4, radius: i === 0 ? 0 : 0.2 + i * 0.03, speed: (i % 2 ? 1 : -1) * (0.45 + i * 0.1), height: i === 0 ? 0.62 : 0.3 + i * 0.08, size: i === 0 ? 1.2 : 0.7 };
  });
  const bits = [0, 1, 2].map((i) => {
    const mesh = new THREE.Mesh(merge([box(0.016, 0.016, 0.016, 0, 0, 0, i % 2 ? '#ff9a68' : '#ffd2b0')]), glow);
    group.add(mesh);
    return { mesh, phase: i / 3, x: (i - 1) * 0.04 };
  });

  return {
    group,
    tick(t) {
      const burst = 0.3 + 0.7 * smooth(Math.min(1, Math.max(0, Math.sin(t * 0.7) * 2 + 0.6)));
      const tap = (f: number, ph: number): number => Math.sin(t * f + ph) * 0.14 * burst;
      rig.armL.rotation.x = -1.0 + tap(15, 0);
      rig.armR.rotation.x = -1.0 + tap(12, 1.3);
      rig.body.rotation.x = 0.1 * burst + Math.sin(t * 0.9) * 0.02;
      rig.body.position.y = 0.09 + Math.sin(t * 15) * 0.002 * burst;
      rig.eyes.scale.y = (t % 3.7) > 3.55 ? 0.15 : 1;
      for (const st of stars) {
        const a = t * st.speed + st.phase;
        st.mesh.position.set(Math.sin(a) * st.radius, st.height + Math.sin(t * 1.7 + st.phase) * 0.02, ZC + Math.cos(a) * st.radius * 0.6);
        st.mesh.rotation.set(t * 1.3 + st.phase, t * 1.9, t * 0.7);
        st.mesh.scale.setScalar(st.size * (0.7 + 0.3 * Math.sin(t * 3.1 + st.phase * 2)));
      }
      for (const b of bits) {
        const u = (t * 0.45 * (0.5 + burst * 0.5) + b.phase) % 1; // rise from the keys, shrink away
        b.mesh.position.set(b.x + Math.sin(t * 3 + b.phase * 9) * 0.01, TOP + 0.08 + u * 0.14, ZD - 0.03);
        b.mesh.rotation.set(t * 4, t * 3 + b.phase, 0);
        b.mesh.scale.setScalar(Math.sin(u * Math.PI) * burst);
      }
    },
  };
}
