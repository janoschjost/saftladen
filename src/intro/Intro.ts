// the story's typeface (Almendra, OFL): loaded with the intro only, so the same storybook look on every system
import '@fontsource/almendra/latin-400.css';
import '@fontsource/almendra/latin-400-italic.css';
import * as THREE from 'three';
import { CreditsScene } from '../credits/CreditsScene';
import { easeInOut, shotPosition, type Shot } from '../render/cameraFly';
import { strings } from '../i18n/strings';
import { cloudsAt, greetAt, greeting, lineAt, span, stageAt, timeline } from './story';

export interface IntroHost {
  /** René greets in front of the story (#333) */
  greet: boolean;
  /** the picture the game's fly-in starts from: the intro's camera ends on it, on the blueprint */
  start: { shot: Shot; fov: number };
  /** the clouds start to part over the office: the game is let go and flies in */
  handOver(): void;
  /** the intro is gone */
  done(): void;
}

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** the two devs at their desks, drifting closer while the story is told */
// (they look below the desks, so the scene sits in the upper part of the picture and the story has the lower part)
const NEAR_FROM = { pos: v(2.6, 2.85, 7.9), target: v(0, 0.45, 0.5) };
const NEAR_TO = { pos: v(1.5, 2.45, 7.1), target: v(0, 0.45, 0.5) };
/** the whole scene: the desks, the blueprint in front of them and Clawd beside it */
const WIDE = { pos: v(3.7, 4.0, 9.8), target: v(0.6, 0, 2.7) };
/** the camera pulls back to the wide shot around the summoning: this long before it .. this long after */
const PULL = { before: 1.2, after: 1.6 };

/** René's greeting (#333): he comes from the back left, stops front left of the desk, close to us, and leaves to the left */
const RENE = { from: [-4.6, 1.4], spot: [-0.9, 4.9], off: [-7, 6.4] } as const;
/** the picture of his greeting: he in front, the desk with the two small behind him */
const GREET = { pos: v(2.3, 1.75, 9.5), target: v(0.2, 1.0, 4.0) };

/** how many puffs of cloud close over the picture */
const PUFFS = 22;

const mix = (a: Pose, b: Pose, u: number): Pose => ({ pos: a.pos.clone().lerp(b.pos, u), target: a.target.clone().lerp(b.target, u), fov: a.fov + (b.fov - a.fov) * u });

/**
 * The origin-story intro (#322): Marco and Janosch at their desks in the credits' room, the story sentence by sentence,
 * Claudius summoned in a puff, the blueprint building up, then the camera moves into the blueprint, clouds close over
 * the picture and part again over the real office, which flies in. The camera is scripted: no input reaches the scene.
 * Returns what ends it at once (skip).
 */
export function playIntro(root: HTMLElement, host: IntroHost): () => void {
  const stage = root.querySelector<HTMLElement>('#intro-stage')!;
  const text = root.querySelector<HTMLElement>('#intro-text')!;
  const de = root.querySelector<HTMLElement>('#intro-de')!;
  const en = root.querySelector<HTMLElement>('#intro-en')!;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = strings.intro.lines;
  const hello = host.greet ? greeting(strings.intro.greeting) : null;
  const tl = timeline(lines, hello?.total ?? 0);
  const bubble = root.querySelector<HTMLElement>('#intro-bubble')!;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  stage.appendChild(renderer.domElement);
  const world = new CreditsScene({ story: true, greeter: !!hello });
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  // the fly-in's first picture, on the blueprint: the same shot, shrunk to the blueprint's scale
  const f = world.blueprintFrame;
  const onBlueprint = (p: { x: number; y: number; z: number }) => v(f.x + p.x * f.scale, f.y + p.y * f.scale, f.z + p.z * f.scale);
  const last: Pose = { pos: onBlueprint(shotPosition(host.start.shot)), target: onBlueprint(host.start.shot), fov: host.start.fov };

  let sceneFov = 32;
  /** narrow screens: the camera this many times further back, so nobody is cut at the sides */
  let back = 1;
  const resize = (): void => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    sceneFov = w / h < 1 ? 46 : 32; // narrow screens: wider, so both desks still fit
    back = w / h < 1 ? Math.max(1, 0.7 / (w / h)) : 1;
  };
  const framed = (p: { pos: THREE.Vector3; target: THREE.Vector3 }, more = 1): Pose => ({ pos: p.target.clone().lerp(p.pos, 1 + (back - 1) * more), target: p.target, fov: sceneFov });
  const sized = new ResizeObserver(resize);
  sized.observe(stage);
  resize();

  const poseAt = (t: number): Pose => {
    const near = framed(NEAR_FROM);
    const wide = framed(WIDE, 1.15);
    if (still) return wide; // reduced motion: one fixed picture
    // René's greeting: his picture, then the camera swings to the story's first one while he leaves
    if (hello && t < hello.total) return mix(framed(GREET, 1.3), near, easeInOut(span(t, hello.leave, hello.total)));
    const drift = mix(near, framed(NEAR_TO), span(t, tl.greet, tl.summon));
    const pulled = mix(drift, wide, easeInOut(span(t, tl.summon - PULL.before, tl.summon + PULL.after)));
    return mix(pulled, last, easeInOut(span(t, tl.push, tl.fade)));
  };

  let shown = -1;
  const showLine = (i: number): void => {
    if (i === shown) return;
    shown = i;
    de.textContent = lines[i]?.de ?? '';
    en.textContent = lines[i]?.en ?? '';
    if (!still && i >= 0) text.animate([{ opacity: 0, transform: 'translateY(0.4rem)' }, { opacity: 1, transform: 'none' }], { duration: 600, easing: 'ease-out' });
  };

  // René: in from the back, a look at us and his lines, a nod to the desk, off to the left
  let yaw = 0;
  let said = -2;
  const say = (i: number): void => {
    if (i === said) return;
    said = i;
    bubble.hidden = i < 0;
    bubble.textContent = strings.intro.greeting[i] ?? '';
    if (!still && i >= 0) bubble.animate([{ opacity: 0, scale: '0.85' }, { opacity: 1, scale: '1' }], { duration: 220, easing: 'ease-out' });
  };
  const greet = (t: number, dt: number): void => {
    if (!hello) return;
    if (t >= hello.total) {
      world.greet(null);
      say(-1);
      return;
    }
    const a = greetAt(hello, still ? Math.max(t, hello.starts[0] - 0.1) : t);
    const [fx, fz] = RENE.from;
    const [sx, sz] = RENE.spot;
    const [ox, oz] = RENE.off;
    const leaving = !still && a.off > 0;
    const x = leaving ? sx + (ox - sx) * a.off : fx + (sx - fx) * a.walk;
    const z = leaving ? sz + (oz - sz) * a.off : fz + (sz - fz) * a.walk;
    const moving = leaving ? a.off < 1 : a.walk < 1;
    const last = strings.intro.greeting.length - 1;
    // he faces where he walks, us while he talks, half round to the desk for his last line
    const us = Math.atan2(camera.position.x - x, camera.position.z - z);
    const to = leaving ? Math.atan2(ox - sx, oz - sz) : a.walk < 1 ? Math.atan2(sx - fx, sz - fz) : a.line === last ? us + 1.1 : us;
    const d = Math.atan2(Math.sin(to - yaw), Math.cos(to - yaw));
    yaw += d * (said === -2 ? 1 : Math.min(1, dt * 7));
    const amount = (i: number): number => (a.line === i ? Math.min(span(t, hello.starts[i], hello.starts[i] + 0.3), 1 - span(t, hello.ends[i] - 0.3, hello.ends[i])) : 0);
    world.greet({ x, z, yaw, moving, shrug: amount(2), point: amount(last) });
    say(leaving ? -1 : a.line);
  };
  /** the bubble hangs over his head, pushed back inside the picture at its sides */
  const placeBubble = (): void => {
    const head = bubble.hidden ? null : world.greeterHead();
    if (!head) return;
    const p = head.project(camera);
    const w = stage.clientWidth;
    const half = bubble.offsetWidth / 2 + 8;
    const at = ((p.x + 1) / 2) * w;
    const x = Math.min(Math.max(at, half), Math.max(half, w - half));
    bubble.style.left = `${x}px`;
    bubble.style.top = `${Math.max(bubble.offsetHeight + 12, ((1 - p.y) / 2) * stage.clientHeight)}px`;
    bubble.style.setProperty('--tail', `${at - x}px`);
  };

  // the clouds between the story and the office: puffs spread over the picture in a spiral, each a little later than the last
  const sky = root.querySelector<HTMLElement>('#intro-clouds')!;
  const fog = document.createElement('i');
  fog.className = 'm-intro__fog';
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const el = document.createElement('i');
    el.className = 'm-intro__puff';
    const a = i * 2.4; // the golden angle: no two puffs in a row
    const r = Math.sqrt((i + 0.5) / PUFFS);
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    el.style.left = `${50 + dx * 55}%`;
    el.style.top = `${50 + dy * 45}%`;
    el.style.setProperty('--size', `${34 + (i % 5) * 9}vmax`);
    return { el, dx, dy, late: (i % 6) / 6 };
  });
  sky.replaceChildren(fog, ...puffs.map((p) => p.el));
  let clouded = '';
  const showClouds = (closed: number, parted: number): void => {
    const key = `${closed.toFixed(3)}|${parted.toFixed(3)}`;
    if (key === clouded) return;
    clouded = key;
    sky.hidden = closed === 0;
    fog.style.opacity = String(span(closed, 0.55, 1) * (1 - span(parted, 0, 0.45)));
    for (const p of puffs) {
      const u = easeInOut(span(closed, p.late * 0.35, p.late * 0.35 + 0.65)); // rolls in from its side of the picture
      const w = easeInOut(span(parted, p.late * 0.3, p.late * 0.3 + 0.7)); // and past us, as we fall through
      const off = (1 - u) * 60 + w * 90;
      p.el.style.transform = `translate(-50%, -50%) translate(${p.dx * off}vw, ${p.dy * off}vh) scale(${0.5 + 0.5 * u + 2.2 * w})`;
      p.el.style.opacity = String(u * (1 - w));
    }
  };
  showClouds(0, 0);

  let t = 0;
  let handed = false;
  let over = false;
  const handOver = (): void => {
    if (handed) return;
    handed = true;
    host.handOver();
  };
  const finish = (): void => {
    if (over) return;
    over = true;
    handOver();
    renderer.setAnimationLoop(null);
    sized.disconnect();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    showLine(-1);
    say(-1);
    sky.replaceChildren();
    root.hidden = true;
    root.classList.remove('is-clear');
    text.style.opacity = '';
    host.done();
  };
  let before = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.5, (now - before) / 1000); // the story keeps its pace on a slow machine; only a long gap (a hidden tab) is cut
    before = now;
    t += dt;
    // reduced motion: no flight into the blueprint and no crossfade, the office cuts in after the last sentence
    if (t >= (still ? tl.push : tl.end)) return finish();
    if (t >= tl.clear) handOver();
    showLine(lineAt(tl, t));
    text.style.opacity = String(1 - span(t, tl.push, tl.push + 0.8));
    const c = cloudsAt(tl, t);
    showClouds(c.closed, c.parted);
    // all white: the scene behind the clouds is gone, the office waits under them
    root.classList.toggle('is-clear', t >= tl.fade);
    if (t >= tl.fade) return;
    world.stage(stageAt(tl, t));
    greet(t, dt);
    world.tick(dt);
    const p = poseAt(t);
    camera.position.copy(p.pos);
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(p.target);
    camera.updateMatrixWorld();
    placeBubble();
    renderer.render(world.scene, camera);
  });
  return finish;
}
