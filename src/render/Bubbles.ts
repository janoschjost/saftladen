import * as THREE from 'three';
import type { GlassSort } from './glassSort';
import { BUBBLE, bubbleWorldHeight, easeLift, popScale, stackBubbles, stepOpacity, type BubbleRect } from './bubbleLayout';

/** One speaker this frame: the bubble `id`, its line and the world point on top of the speaker's head. */
export interface BubbleSpec {
  id: string;
  text: string;
  head: THREE.Vector3;
}

/** Bubble layout in logical texture units; the canvas is drawn at `textureScale()` times this for crisp text. */
const FONT_PX = 40;
const BODY_H = 64;
const PAD_X = 24;
const TAIL_H = 16;
const TAIL_W = 24;
const MARGIN = 14; // room for the shadow
/** cap on the texture scale, so long lines stay well inside the max texture size */
const MAX_SCALE = 4;

/**
 * Canvas px per logical unit: enough that the body (BODY_H) has at least as many px as it covers device px at the
 * largest screen size (`BUBBLE.maxPx` css px, plus the pop's overshoot), so the texture is never upscaled.
 */
function textureScale(): number {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
  return Math.min(MAX_SCALE, Math.max(1, Math.ceil((BUBBLE.maxPx * 1.1 * dpr) / BODY_H)));
}

interface Entry {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  text: string;
  /** canvas px per logical unit the texture was drawn at */
  res: number;
  /** body width / body height of the current texture */
  aspect: number;
  opacity: number;
  /** seconds since the current line started (drives the pop) */
  age: number;
  lift: number;
  head: THREE.Vector3;
  active: boolean;
}

/**
 * Speech bubbles as sprites in the 3D scene: above the speaker's head with a tail pointing at it, depth-tested (walls
 * and furniture hide them), world-sized within a readable screen-size range, nudged upwards so neighbours don't
 * overlap, fading in and out with a short pop per new line.
 */
export class Bubbles {
  private entries = new Map<string, Entry>();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private up = new THREE.Vector3();
  private ink = '';
  private font = '';

  constructor(private scene: THREE.Scene, private glass?: GlassSort) {}

  /** Call once per rendered frame, after the walkers are posed. */
  update(specs: readonly BubbleSpec[], camera: THREE.Camera, width: number, height: number, dt: number): void {
    for (const e of this.entries.values()) e.active = false;
    const res = textureScale();
    for (const s of specs) {
      let e = this.entries.get(s.id);
      if (e?.active) continue; // one bubble per id and frame, the first source wins
      if (!e) {
        e = this.create();
        this.entries.set(s.id, e);
      }
      e.active = true;
      e.head.copy(s.head);
      if (e.text !== s.text) {
        this.draw(e, s.text, res);
        e.age = 0; // pop again for every new line
      } else if (e.res !== res) {
        this.draw(e, s.text, res); // moved to a screen with another pixel ratio: same line, sharper or lighter texture
      }
      if (e.opacity === 0) e.age = 0;
    }

    camera.updateMatrixWorld();
    this.up.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    const rects: BubbleRect[] = [];
    const sizes = new Map<string, { ppm: number; h: number }>();
    for (const [id, e] of this.entries) {
      e.opacity = stepOpacity(e.opacity, e.active, dt);
      e.age += dt;
      e.sprite.visible = e.opacity > 0;
      if (!e.sprite.visible) continue;
      // screen pixels per metre at the bubble: project the anchor and a point one metre "screen-up" from it
      const tip = this.v.copy(e.head).setY(e.head.y + BUBBLE.gap);
      const a = this.w.copy(tip).project(camera);
      if (a.z < -1 || a.z > 1) continue; // behind the camera or past the far plane: not on screen, nothing to stack
      const ax = (a.x * 0.5 + 0.5) * width;
      const ay = (-a.y * 0.5 + 0.5) * height;
      const b = this.w.copy(tip).add(this.up).project(camera);
      const ppm = Math.hypot((b.x * 0.5 + 0.5) * width - ax, (-b.y * 0.5 + 0.5) * height - ay);
      const h = bubbleWorldHeight(ppm);
      sizes.set(id, { ppm, h });
      rects.push({ id, x: ax, y: ay, w: h * e.aspect * ppm, h: (h * (BODY_H + TAIL_H)) / BODY_H * ppm });
    }
    const lifts = stackBubbles(rects);

    for (const [id, e] of this.entries) {
      if (!e.sprite.visible) continue;
      const size = sizes.get(id);
      e.lift = easeLift(e.lift, lifts.get(id) ?? 0, dt);
      const h = (size?.h ?? BUBBLE.height) * popScale(e.age);
      const total = h / (BODY_H * e.res); // world metres per canvas px
      e.sprite.scale.set(e.canvas.width * total, e.canvas.height * total, 1);
      e.sprite.position.copy(e.head);
      e.sprite.position.y += BUBBLE.gap;
      if (size && size.ppm > 0) e.sprite.position.addScaledVector(this.up, e.lift / size.ppm);
      e.material.opacity = e.opacity;
    }
  }

  /** What the bubbles show right now, for the test hook (`__game.bubbles.state`). */
  get state(): Array<{ id: string; text: string; opacity: number; x: number; y: number; z: number; headY: number; height: number }> {
    return [...this.entries]
      .filter(([, e]) => e.sprite.visible)
      .map(([id, e]) => ({
        id,
        text: e.text,
        opacity: e.opacity,
        x: e.sprite.position.x,
        y: e.sprite.position.y,
        z: e.sprite.position.z,
        headY: e.head.y,
        height: (e.sprite.scale.y * BODY_H * e.res) / e.canvas.height,
      }));
  }

  private create(): Entry {
    const canvas = document.createElement('canvas');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // the hi-res texture is shrunk a lot when zoomed out: mipmaps keep the text smooth instead of shimmering (sprites
    // always face the camera, so anisotropic filtering would add nothing)
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    // depth-tested against the office, but never writes depth, so bubbles don't cut holes into each other
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, fog: false, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    sprite.raycast = () => {}; // not pickable: clicks go to the people below
    sprite.visible = false;
    this.glass?.track(sprite); // in front of glass: drawn after it, clean; behind glass: drawn before it, washed out by it
    this.scene.add(sprite);
    return { sprite, material, canvas, texture, text: '', res: 1, aspect: 1, opacity: 0, age: 0, lift: 0, head: new THREE.Vector3(), active: false };
  }

  /** Redraws the bubble: a soft rounded body with a subtle shadow and a tail down to the head. */
  private draw(e: Entry, text: string, res: number): void {
    e.text = text;
    e.res = res;
    if (!this.font) {
      const root = getComputedStyle(document.documentElement);
      this.ink = root.getPropertyValue('--color-ink').trim() || 'black';
      this.font = `700 ${FONT_PX}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    }
    const c = e.canvas;
    const g = c.getContext('2d')!;
    g.font = this.font;
    // logical units (measureText ignores the transform)
    const bodyW = Math.ceil(Math.max(BODY_H * 1.15, g.measureText(text).width + PAD_X * 2));
    const w = bodyW + MARGIN * 2;
    const h = BODY_H + TAIL_H + MARGIN * 2;
    if (c.width !== w * res || c.height !== h * res) {
      c.width = w * res;
      c.height = h * res;
      // a new size needs a new GPU texture
      e.texture.dispose();
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, c.width, c.height);
    g.setTransform(res, 0, 0, res, 0, 0);
    const x0 = MARGIN;
    const y0 = MARGIN - 4; // the shadow falls downwards, so the top margin can be smaller
    const r = BODY_H / 2;
    const cx = w / 2;
    const bottom = y0 + BODY_H;
    g.beginPath();
    g.moveTo(x0 + r, y0);
    g.lineTo(x0 + bodyW - r, y0);
    g.arc(x0 + bodyW - r, y0 + r, r, -Math.PI / 2, Math.PI / 2);
    g.lineTo(cx + TAIL_W / 2, bottom);
    // a soft, slightly curved tail ending in a point at the head
    g.quadraticCurveTo(cx + TAIL_W * 0.15, bottom + TAIL_H * 0.45, cx, bottom + TAIL_H);
    g.quadraticCurveTo(cx - TAIL_W * 0.35, bottom + TAIL_H * 0.4, cx - TAIL_W / 2, bottom);
    g.lineTo(x0 + r, bottom);
    g.arc(x0 + r, y0 + r, r, Math.PI / 2, (Math.PI * 3) / 2);
    g.closePath();
    g.save();
    g.shadowColor = 'rgba(0, 0, 0, 0.28)';
    // shadows ignore the transform, so they are scaled by hand
    g.shadowBlur = 10 * res;
    g.shadowOffsetY = 3 * res;
    g.fillStyle = 'white';
    g.fill();
    g.restore();
    g.fillStyle = this.ink;
    g.font = this.font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, cx, y0 + BODY_H / 2 + 2);
    e.texture.needsUpdate = true;
    e.aspect = bodyW / BODY_H;
    // the tip of the tail is the sprite's anchor
    e.sprite.center.set(0.5, (h - (bottom + TAIL_H)) / h);
  }
}
