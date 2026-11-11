import * as THREE from 'three';
import { DAY_CHARACTERS } from '../data/dayCharacters';
import { team } from '../data/team';
import type { TeamMember } from '../data/types';
import { buildCat } from '../render/catBuilder';
import { buildCharacter, type CharacterRig } from '../render/characterBuilder';
import { buildDog } from '../render/dogBuilder';

const SPACING = 2.7; // metres between the pedestals
const FOV = 30;
const IDLE = new THREE.Color('#b9b9bd');

interface Slot {
  member: TeamMember;
  tagline: string;
  group: THREE.Group;
  figure: THREE.Group;
  rig: CharacterRig;
  disc: THREE.Mesh;
  tag: HTMLButtonElement;
  /** 0..1 eased "is the chosen one" amount */
  amt: number;
  x: number;
  /** the gesture being played right now (t seconds into dur) */
  emote: { kind: Emote; t: number; dur: number } | null;
}

type Emote = 'wave' | 'stretch' | 'cheer' | 'shrug' | 'scratch' | 'bow' | 'yawn' | 'flex';
const EMOTES: Record<Emote, number> = { wave: 2.2, stretch: 2.6, cheer: 1.8, shrug: 1.6, scratch: 2.2, bow: 1.8, yawn: 2.4, flex: 2 };
const EMOTE_KINDS = Object.keys(EMOTES) as Emote[];
const PLANE = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

/** Full-screen "Ein Tag im Leben" menu: the playable people stand on pedestals, the chosen one steps forward. */
export class DayMenu {
  private root = document.getElementById('day-menu') as HTMLElement;
  private host = document.getElementById('day-menu-stage') as HTMLElement;
  private tags = document.getElementById('day-menu-tags') as HTMLElement;
  private nameEl = document.getElementById('day-menu-name') as HTMLElement;
  private roleEl = document.getElementById('day-menu-role') as HTMLElement;
  private taglineEl = document.getElementById('day-menu-tagline') as HTMLElement;
  private openBtn = document.getElementById('open-day') as HTMLButtonElement;
  private startBtn = document.getElementById('day-menu-start') as HTMLButtonElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);
  private raycaster = new THREE.Raycaster();
  private slots: Slot[] = [];
  private index = 0;
  private pointer: THREE.Vector2 | null = null;
  /** cursor anywhere in the window, as a point on the stage plane; the figures turn towards it */
  private look: THREE.Vector3 | null = null;
  private lookNdc = new THREE.Vector2();
  private nextEmote = 1.2;
  private resizeObserver: ResizeObserver | null = null;
  private lastTime = 0;
  private clock = 0;
  private raf = 0;

  constructor(private onPick: (id: string) => void) {
    this.buildScene();
    this.bind();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  private buildScene(): void {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9b8a4', 1.5));
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(2, 7, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 4, bottom: -3, near: 1, far: 25 });
    this.scene.add(sun);

    const people = DAY_CHARACTERS.map((c) => ({ c, member: team.find((m) => m.id === c.id) })).filter((o): o is { c: (typeof DAY_CHARACTERS)[number]; member: TeamMember } => !!o.member);
    people.forEach(({ c, member }, i) => {
      const x = (i - (people.length - 1) / 2) * SPACING;
      const group = new THREE.Group();
      group.position.x = x;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.14, 48), new THREE.MeshLambertMaterial({ color: IDLE }));
      disc.position.y = -0.07;
      disc.receiveShadow = true;
      group.add(disc);

      const figure = new THREE.Group();
      const rig = buildCharacter(member.look);
      figure.add(rig.root);
      // the owner's pets stand beside them: dog first, then the cats
      const pets = [...(member.dog ? [buildDog(member.dog)] : []), ...(member.cats ?? []).map((k) => buildCat(k.kind))];
      const slotsAt: Array<[number, number, number]> = [[0.62, 0.18, 0.5], [0.5, -0.38, -0.3], [0.3, 0.5, 0.9]];
      pets.forEach((pet, n) => {
        const [px, pz, ry] = slotsAt[n % slotsAt.length];
        pet.root.position.set(px, 0, pz);
        pet.root.rotation.y = ry;
        figure.add(pet.root);
      });
      figure.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = true;
          o.userData.slot = i;
        }
      });
      group.add(figure);
      this.scene.add(group);

      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'm-day-menu__tag';
      tag.textContent = member.name.split(' ')[0];
      tag.addEventListener('click', () => this.select(i));
      this.tags.appendChild(tag);
      this.slots.push({ member, tagline: c.tagline, group, figure, rig, disc, tag, amt: 0, x, emote: null });
    });
  }

  private bind(): void {
    this.openBtn.addEventListener('click', () => this.open());
    document.getElementById('day-menu-close')!.addEventListener('click', () => this.close());
    this.startBtn.addEventListener('click', () => this.start());
    document.getElementById('day-menu-prev')!.addEventListener('click', () => this.step(-1));
    document.getElementById('day-menu-next')!.addEventListener('click', () => this.step(1));

    this.host.addEventListener('pointermove', (e) => {
      this.pointer = this.toNdc(e);
      const hit = this.pick();
      this.host.classList.toggle('is-hovering', hit >= 0);
      if (hit >= 0 && hit !== this.index) this.select(hit);
    });
    this.host.addEventListener('pointerleave', () => {
      this.pointer = null;
      this.host.classList.remove('is-hovering');
    });
    this.host.addEventListener('click', (e) => {
      this.pointer = this.toNdc(e);
      const hit = this.pick();
      if (hit >= 0) {
        this.select(hit);
        this.start();
      }
    });

    window.addEventListener(
      'pointermove',
      (e) => {
        if (!this.isOpen) return;
        const r = this.host.getBoundingClientRect();
        this.lookNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        this.raycaster.setFromCamera(this.lookNdc, this.camera);
        this.look = this.raycaster.ray.intersectPlane(PLANE, this.look ?? new THREE.Vector3());
      },
      { passive: true },
    );

    window.addEventListener(
      'keydown',
      (e) => {
        if (!this.isOpen) return;
        switch (e.key) {
          case 'Escape': this.close(); break;
          case 'ArrowLeft': case 'a': case 'A': this.step(-1); break;
          case 'ArrowRight': case 'd': case 'D': this.step(1); break;
          case 'Enter': case ' ': this.start(); break;
          default: return;
        }
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }

  private toNdc(e: PointerEvent | MouseEvent): THREE.Vector2 {
    const r = this.host.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  /** Index of the figure under the pointer, or -1. */
  private pick(): number {
    if (!this.pointer) return -1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.slots.map((s) => s.figure), true);
    return hits.length ? (hits[0].object.userData.slot ?? -1) : -1;
  }

  private step(dir: number): void {
    this.select((this.index + dir + this.slots.length) % this.slots.length);
  }

  private select(i: number): void {
    const changed = i !== this.index;
    this.index = i;
    const s = this.slots[i];
    if (changed) this.play(s, 'wave');
    this.nameEl.textContent = s.member.name;
    this.roleEl.textContent = s.member.role;
    this.taglineEl.textContent = s.tagline;
    this.slots.forEach((o, n) => o.tag.setAttribute('aria-pressed', String(n === i)));
  }

  private start(): void {
    const id = this.slots[this.index]?.member.id;
    if (!id) return;
    this.close();
    this.onPick(id);
  }

  open(): void {
    if (this.isOpen || !this.slots.length) return;
    this.root.hidden = false;
    this.openBtn.setAttribute('aria-pressed', 'true');
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.host.appendChild(this.renderer.domElement);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
    }
    this.select(this.index);
    this.slots.forEach((s) => {
      s.amt = 0;
      s.emote = null;
    });
    this.look = null;
    this.nextEmote = 1.2;
    this.resize();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
    this.startBtn.focus({ preventScroll: true });
  }

  close(): void {
    this.root.hidden = true;
    this.openBtn.setAttribute('aria-pressed', 'false');
    cancelAnimationFrame(this.raf);
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    // far enough that all pedestals fit across the width
    const span = SPACING * (this.slots.length - 1) + 2.6;
    const dist = Math.max(12.5, span / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * this.camera.aspect));
    this.camera.position.set(0, 2.6, dist);
    this.camera.lookAt(0, 0.2, 0);
    this.camera.updateProjectionMatrix();
  }

  private play(s: Slot, kind: Emote): void {
    s.emote = { kind, t: 0, dur: EMOTES[kind] };
    this.nextEmote = 3.5 + Math.random() * 3;
  }

  /** Gesture on top of the idle pose; arm z is mirrored so the left arm (-x side) swings outwards too. */
  private poseEmote(s: Slot, dt: number): void {
    const e = s.emote;
    if (!e) return;
    e.t += dt;
    if (e.t >= e.dur) {
      if (e.kind === 'yawn') s.rig.setTired(0);
      s.emote = null;
      return;
    }
    const p = e.t / e.dur;
    const a = Math.min(1, p * 6, (1 - p) * 6);
    const t = e.t;
    const r = s.rig;
    const lerp = THREE.MathUtils.lerp;
    const arm = (right: boolean, x: number, z: number, el: number) => {
      const sh = right ? r.armR : r.armL;
      const elbow = right ? r.elbowR : r.elbowL;
      sh.rotation.x = lerp(sh.rotation.x, x, a);
      sh.rotation.z = lerp(sh.rotation.z, (right ? 1 : -1) * z, a);
      elbow.rotation.x = lerp(elbow.rotation.x, el, a);
    };
    switch (e.kind) {
      case 'wave':
        arm(true, -2.6, 0.35 + Math.sin(t * 13) * 0.25, -0.3);
        break;
      case 'stretch':
        arm(true, -3.05, 0.35 + Math.sin(t * 2.5) * 0.04, 0);
        arm(false, -3.05, 0.35 + Math.sin(t * 2.5) * 0.04, 0);
        r.body.rotation.x -= 0.14 * a;
        break;
      case 'cheer':
        arm(true, -2.9 + Math.sin(t * 9) * 0.15, 0.3, 0);
        arm(false, -2.9 - Math.sin(t * 9) * 0.15, 0.3, 0);
        r.body.position.y += Math.abs(Math.sin(t * 8)) * 0.08 * a;
        break;
      case 'shrug':
        arm(true, -0.55, 0.5, -1.1);
        arm(false, -0.55, 0.5, -1.1);
        r.body.position.y += 0.03 * a;
        r.body.rotation.z += 0.09 * a * Math.sin(t * 5);
        break;
      case 'scratch':
        arm(true, -0.64, -0.39, -2.15);
        r.elbowR.rotation.z += Math.sin(t * 14) * 0.12 * a;
        r.body.rotation.x += 0.04 * a;
        break;
      case 'bow':
        r.body.rotation.x += Math.sin(p * Math.PI) * 0.5;
        break;
      case 'yawn':
        arm(true, -0.64, -0.39, -2.15);
        r.body.rotation.x -= 0.12 * a;
        r.setTired(Math.sin(p * Math.PI) * 0.8);
        break;
      case 'flex':
        arm(true, -0.4, 1.35, -2.3);
        arm(false, -0.4, 1.35, -2.3);
        r.body.position.y += Math.abs(Math.sin(t * 6)) * 0.02 * a;
        break;
    }
  }

  private frame(t: number): void {
    const dt = Math.min((t - this.lastTime) / 1000, 0.1);
    this.lastTime = t;
    this.clock += dt;
    const k = Math.min(1, dt * 7);
    const accent = new THREE.Color('#8cf6c9');
    this.nextEmote -= dt;
    const chosen = this.slots[this.index];
    if (this.nextEmote <= 0 && chosen && !chosen.emote) {
      this.play(chosen, EMOTE_KINDS[Math.floor(Math.random() * EMOTE_KINDS.length)]);
    }
    this.slots.forEach((s, i) => {
      const on = i === this.index;
      s.amt += ((on ? 1 : 0) - s.amt) * k;
      // turn towards the cursor; without one the chosen sways and the others glance at the middle
      let yaw: number;
      let pitch = 0;
      if (this.look) {
        yaw = THREE.MathUtils.clamp(Math.atan2(this.look.x - s.x, 2.2), -1.15, 1.15);
        pitch = -this.lookNdc.y * 0.1;
      } else {
        const toCentre = Math.sign(-s.x) * 0.45;
        yaw = THREE.MathUtils.lerp(toCentre, Math.sin(this.clock * 1.4) * 0.28, s.amt);
      }
      s.figure.rotation.y += (yaw - s.figure.rotation.y) * k;
      const scale = 1 + 0.16 * s.amt;
      s.figure.scale.setScalar(scale);
      // breathing, and a little hop-lift on the chosen one
      s.rig.body.position.y = Math.sin(this.clock * 2 + i) * 0.012 + Math.abs(Math.sin(this.clock * 3)) * 0.02 * s.amt;
      s.rig.body.rotation.set(pitch, 0, 0);
      s.rig.armR.rotation.set(0, 0, -0.08 - 0.05 * Math.sin(this.clock * 2 + i));
      s.rig.armL.rotation.set(0, 0, 0.08 + 0.05 * Math.sin(this.clock * 2 + i));
      s.rig.elbowR.rotation.set(0, 0, 0);
      s.rig.elbowL.rotation.set(0, 0, 0);
      this.poseEmote(s, dt);
      (s.disc.material as THREE.MeshLambertMaterial).color.copy(IDLE).lerp(accent, s.amt);
      s.group.position.z = 0.45 * s.amt;
      // name tag under the pedestal
      const p = new THREE.Vector3(s.x, -0.1, s.group.position.z + 1).project(this.camera);
      s.tag.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
      s.tag.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
    });
    this.renderer!.render(this.scene, this.camera);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
}
