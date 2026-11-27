// the story's typeface (Almendra, OFL): loaded with the intro only, so the same storybook look on every system
import '@fontsource/almendra/latin-400.css';
import '@fontsource/almendra/latin-400-italic.css';
import * as THREE from 'three';
import { CreditsScene } from '../credits/CreditsScene';
import { easeInOut, shotPosition, type Shot } from '../render/cameraFly';
import { strings } from '../i18n/strings';
import { cloudsAt, lineAt, span, stageAt, timeline } from './story';

export interface IntroHost {
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
  const tl = timeline(lines);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  stage.appendChild(renderer.domElement);
  const world = new CreditsScene({ story: true });
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 80);

  // the fly-in's first picture, on the blueprint: the same shot, shrunk to the blueprint's scale
  const f = world.blueprintFrame;
  const onBlueprint = (p: { x: number; y: number; z: number }) => v(f.x + p.x * f.scale, f.y + p.y * f.scale, f.z + p.z * f.scale);
  const last: Pose = { pos: onBlueprint(shotPosition(host.start.shot)), target: onBlueprint(host.start.shot), fov: host.start.fov };

  let sceneFov = 32;
  const resize = (): void => {
    const w = stage.clientWidth || 1;
    const h = stage.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    sceneFov = w / h < 1 ? 46 : 32; // narrow screens: wider, so both desks still fit
  };
  const sized = new ResizeObserver(resize);
  sized.observe(stage);
  resize();

  const poseAt = (t: number): Pose => {
    const near = { ...NEAR_FROM, fov: sceneFov };
    const wide = { ...WIDE, fov: sceneFov };
    if (still) return wide; // reduced motion: one fixed picture
    const drift = mix(near, { ...NEAR_TO, fov: sceneFov }, span(t, 0, tl.summon));
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
    world.tick(dt);
    const p = poseAt(t);
    camera.position.copy(p.pos);
    camera.fov = p.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(p.target);
    renderer.render(world.scene, camera);
  });
  return finish;
}
