import * as THREE from 'three';
import { team } from '../data/team';
import { buildCharacter } from '../render/characterBuilder';
import { buildCat } from '../render/catBuilder';
import { buildDog } from '../render/dogBuilder';
import { HOME_COUNT, HOME_LABELS, HomeOffice, ROOM_COUNT } from '../render/homeOffice';
import { SIT_DROP } from '../render/officeBuilder';
import { Views } from '../render/Views';
import { buildOffice, CORRIDOR_POINT } from '../render/officeModel';
import { buildWorld, NAV_CELL, WORLD } from '../render/World';
import { Actions } from '../ui/Actions';
import { Feeds } from '../ui/Feeds';
import { Overlay } from '../ui/Overlay';
import { Roster } from '../ui/Roster';
import { Seats } from '../ui/Seats';
import { Dog } from './Dog';
import { DOOR } from './Door';
import { NavGrid } from './NavGrid';
import { Office } from './Office';
import { Person } from './Person';
import { Presence } from './Presence';
import { Social } from './Social';
import type { Walker } from './Walker';

const STEP = 1 / 60; // fixed simulation step
const BODY_RADIUS = 0.2; // how close to a wall a walker may get (nav cells are 0.5 m)
const SEATS_KEY = 'saftladen.seats';
const STEER_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private views!: Views;
  private nav = new NavGrid(Math.ceil(WORLD.width / NAV_CELL), Math.ceil(WORLD.depth / NAV_CELL), NAV_CELL);
  private roof!: THREE.Object3D;
  private roofWanted = false;
  private office!: Office;
  private walkers: Walker[] = [];
  private people: Person[] = [];
  private overlay: Overlay;
  private social = new Social();
  private presence!: Presence;
  private feeds = new Feeds();
  private roster: Roster;
  private actions: Actions;
  private seats: Seats;
  private homes: Array<HomeOffice | null> = Array.from({ length: ROOM_COUNT }, () => null);
  private entrance!: THREE.Object3D;
  private doorOpen = 0;
  private metaTimer = 0;
  private rosterTimer = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerInside = false;
  private hovered: Walker | null = null;
  private selected: Walker | null = null;
  private dragged: Walker | null = null;
  private steered: Person | null = null;
  private keys = new Set<string>();
  private dragOffset = new THREE.Vector2();
  private dragMoved = false;
  private fwd = new THREE.Vector3();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ring: THREE.Mesh;
  private savedSeats: Record<string, number> = {};
  private acc = 0;
  private last = performance.now();

  constructor(private stage: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    stage.appendChild(this.renderer.domElement);

    const stageColor = getComputedStyle(document.documentElement).getPropertyValue('--color-scene').trim();
    this.scene.background = new THREE.Color(stageColor);

    buildWorld(this.scene);
    const model = buildOffice(this.scene);
    for (const b of model.blockers) this.nav.blockWorld(b.min.x, b.min.z, b.max.x, b.max.z);
    this.nav.sealUnreachable(CORRIDOR_POINT);
    this.office = new Office(model, this.nav);
    this.roof = model.roof;
    this.entrance = model.entrance;
    this.views = new Views(stage, this.renderer.domElement, this.nav, (mode) => {
      this.roof.visible = mode === 'walk' ? true : mode === 'plan' ? false : this.roofWanted;
    });
    this.overlay = new Overlay();
    this.roster = new Roster(
      (id) => this.feeds.focus(id),
      (id) => {
        const p = this.people.find((o) => o.id === id);
        if (p) this.presence.callBack(p);
      },
      () => this.presence.callAllBack(),
    );
    this.actions = new Actions(
      () => {
        if (!(this.selected instanceof Person)) return;
        this.release(this.selected);
        this.presence.send(this.selected, 'home', this.nav);
      },
      () => {
        if (!(this.selected instanceof Person)) return;
        this.release(this.selected);
        this.presence.send(this.selected, 'errand', this.nav);
      },
      () => this.selected instanceof Person && this.toggleSteer(this.selected),
    );

    this.seats = new Seats(
      this.office.desks.length,
      team.map((m) => ({ id: m.id, name: m.name })),
      (id, number) => this.assignSeat(id, number),
    );

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() }),
    );
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.restoreSeats();
    this.spawn();
    this.presence = new Presence(this.people);
    this.presence.seed();
    for (const w of this.walkers) if (w instanceof Dog && w.owner.presence === 'out') w.sendAway(); // pets of people who start away
    this.bind();
    this.resize();
    this.overlay.setMeta(`${this.people.length} Personen, ${this.walkers.length - this.people.length} Tiere`);
    this.overlay.initLabels(this.people.map((p) => ({ id: p.id, name: p.member.name })));
    this.seats.setOwners(this.seatOwners());

    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private restoreSeats(): void {
    let saved: Record<string, number> = {};
    try {
      saved = JSON.parse(localStorage.getItem(SEATS_KEY) ?? '{}');
    } catch {
      /* storage may be unavailable or corrupt */
    }
    this.savedSeats = saved;
  }

  /** Called by the seat panel: persists the assignment and applies it to the person (they move over when they next sit down). */
  private assignSeat(id: string, number: number | null): void {
    const p = this.people.find((o) => o.id === id);
    if (!p) return;
    this.office.assign(p, number);
    const out: Record<string, number> = {};
    for (const q of this.people) if (q.homeDesk) out[q.id] = q.homeDesk.number;
    try {
      localStorage.setItem(SEATS_KEY, JSON.stringify(out));
    } catch {
      /* ignore */
    }
    this.seats.setOwners(this.seatOwners());
  }

  private spawn(): void {
    const free = () => {
      const { cx, cz } = this.nav.randomWalkable();
      return this.nav.center(cx, cz);
    };
    for (const [index, m] of team.entries()) {
      const person = new Person(m, buildCharacter(m.look), free());
      person.office = this.office;
      person.preferredHome = index % HOME_COUNT;
      const seat = this.savedSeats[m.id];
      if (seat) this.office.assign(person, seat);
      if (Math.random() < 0.8) {
        const desk = this.office.claim(person, false);
        if (desk) person.sitAt(desk);
      }
      this.people.push(person);
      this.walkers.push(person);
      this.scene.add(person.root);
      if (m.dog) {
        const dog = new Dog(m.dogName ?? `Hund von ${m.name}`, buildDog(m.dog), person, this.petStart(person, 1, 1));
        this.walkers.push(dog);
        this.scene.add(dog.root);
      }
      for (const [i, { kind, name }] of (m.cats ?? []).entries()) {
        const side = i % 2 ? 1 : -1;
        const cat = new Dog(name, buildCat(kind), person, this.petStart(person, side, -1), {
          id: `cat-${person.id}-${i}`,
          label: 'Bürokatze',
          speed: 2.0 + i * 0.2,
          radius: 0.2,
          side,
        });
        this.walkers.push(cat);
        this.scene.add(cat.root);
      }
    }
  }

  /** Spawn spot next to the owner, on a free cell (never inside a wall). */
  private petStart(owner: Person, dx: number, dz: number): { x: number; z: number } {
    return this.nav.nearestWalkable({ x: owner.pos.x + dx * 0.8, z: owner.pos.z + dz * 0.8 }, 6) ?? { ...owner.pos };
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    // capture phase + stopImmediatePropagation: grabbing a person must not start a camera pan
    this.stage.addEventListener(
      'pointerdown',
      (e) => {
        if (this.views.mode === 'walk') return; // dragging looks around instead
        const hit = this.pick(this.toNdc(e));
        if (!hit) return;
        const g = this.groundAt(this.toNdc(e));
        if (!g) return;
        e.stopImmediatePropagation();
        this.dragged = hit;
        this.dragMoved = false;
        hit.held = true;
        this.dragOffset.set(hit.pos.x - g.x, hit.pos.z - g.z);
        this.stage.setPointerCapture(e.pointerId);
      },
      true,
    );
    this.stage.addEventListener('pointermove', (e) => {
      this.pointerInside = true;
      this.toNdc(e, this.pointer);
      if (!this.dragged) return;
      const g = this.groundAt(this.pointer);
      if (!g) return;
      this.dragMoved = true;
      const w = this.dragged;
      w.pos.x = THREE.MathUtils.clamp(g.x + this.dragOffset.x, 0.4, WORLD.width - 0.4);
      w.pos.z = THREE.MathUtils.clamp(g.z + this.dragOffset.y, 0.4, WORLD.depth - 0.4);
      w.prev.x = w.pos.x; // no interpolation while held, follow the cursor exactly
      w.prev.z = w.pos.z;
    });
    const drop = (e: PointerEvent) => {
      if (!this.dragged) return;
      const d = this.dragged;
      d.held = false;
      // let go inside a wall / desk: settle on the nearest free floor
      const c = this.nav.toCell(d.pos);
      if (!this.nav.walkable(c.cx, c.cz)) {
        const free = this.nav.nearestWalkable(d.pos, 10);
        if (free) {
          d.pos.x = free.x;
          d.pos.z = free.z;
          d.prev.x = free.x;
          d.prev.z = free.z;
        }
      }
      this.dragged.timer = 0.8 + Math.random();
      this.dragged = null;
      if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
    };
    this.stage.addEventListener('pointerup', drop);
    this.stage.addEventListener('pointercancel', drop);
    this.stage.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.hovered = null;
    });
    this.stage.addEventListener('click', () => {
      if (this.views.wasDrag || this.dragMoved) {
        this.dragMoved = false;
        return;
      }
      this.selected = this.hovered && this.hovered !== this.selected ? this.hovered : null;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code);
      if (this.steered && STEER_KEYS.includes(e.code)) e.preventDefault();
      if (e.key.toLowerCase() === 'c' && this.selected instanceof Person) this.toggleSteer(this.selected);
      if (e.key.toLowerCase() === 'n') this.overlay.toggleNames();
      if (e.key.toLowerCase() === 'r' && (this.views.mode === 'iso' || this.views.mode === 'orbit')) this.roof.visible = this.roofWanted = !this.roofWanted;
      if (e.key.toLowerCase() === 'h' && this.selected instanceof Person) this.presence.toggleHome(this.selected, this.nav);
      if (e.key === 'Escape') {
        this.selected = null;
        this.release(this.steered);
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.views.resize(w, h);
  }

  private frame(now: number): void {
    const dt = Math.min(MAX_FRAME, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    this.updateSteer(dt);
    while (this.acc >= STEP) {
      this.simulate(STEP);
      this.acc -= STEP;
    }
    this.views.update(dt);
    this.updateHomes(dt);
    this.updateDoor(dt);
    this.render(this.acc / STEP);
    this.renderFeeds();
  }

  /** Start / stop steering a person with WASD. Only one at a time, only people who are in the office. */
  private toggleSteer(p: Person): void {
    if (this.steered === p) return this.release(p);
    if (!p.inOffice) return;
    this.release(this.steered);
    p.controlled = true;
    this.steered = p;
  }

  private release(p: Person | null): void {
    if (!p || this.steered !== p) return;
    p.controlled = false;
    p.steer.x = p.steer.z = 0;
    p.timer = 0.5;
    this.steered = null;
  }

  /** Turns the held keys into a floor direction relative to the camera and lets the camera trail the person. */
  private updateSteer(dt: number): void {
    const p = this.steered;
    if (!p) return;
    if (!p.inOffice || p.away) return this.release(p);
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    // walk mode already uses WASD for the camera itself
    if (this.views.mode === 'walk' || (!f && !s)) {
      p.steer.x = p.steer.z = 0;
      return;
    }
    // "up" on screen, flattened to the floor; falls back to the camera's up vector when looking straight down
    const cam = this.views.camera;
    cam.getWorldDirection(this.fwd);
    let fx = this.fwd.x;
    let fz = this.fwd.z;
    if (Math.hypot(fx, fz) < 0.2) {
      this.fwd.setFromMatrixColumn(cam.matrixWorld, 1);
      fx = this.fwd.x;
      fz = this.fwd.z;
    }
    const l = Math.hypot(fx, fz) || 1;
    fx /= l;
    fz /= l;
    p.steer.x = fx * f + -fz * s;
    p.steer.z = fz * f + fx * s;
    p.steer.run = k.has('ShiftLeft') || k.has('ShiftRight');
    this.views.follow(p.pos.x, p.pos.z, dt);
  }

  private simulate(dt: number): void {
    this.presence.update(dt, this.nav);
    for (const w of this.walkers) w.update(dt, this.nav, this.walkers);
    this.social.update(dt, this.people, this.nav);
    this.separate();
    this.separate();
  }

  /** Soft collision: push overlapping walkers apart and keep them on the floor. */
  private separate(): void {
    const ws = this.walkers;
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        const a = ws[i];
        const b = ws[j];
        if (a.away || b.away || a.ignores(b) || a.fixed || b.fixed) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        const wa = a.held ? 0 : b.held ? 2 : 1;
        const wb = b.held ? 0 : a.held ? 2 : 1;
        a.pos.x -= dx * push * wa;
        a.pos.z -= dz * push * wa;
        b.pos.x += dx * push * wb;
        b.pos.z += dz * push * wb;
      }
    }
    for (const w of ws) {
      if (w.away || w.fixed) continue; // scripted walkers (door, desk) move through walls on purpose
      w.pos.x = THREE.MathUtils.clamp(w.pos.x, 0.4, WORLD.width - 0.4);
      w.pos.z = THREE.MathUtils.clamp(w.pos.z, 0.4, WORLD.depth - 0.4);
      // walls, windows and furniture are solid (seated people are scripted into their chair and skip this)
      if (!w.held) this.nav.resolve(w.pos, Math.min(w.radius, BODY_RADIUS));
    }
  }

  private render(alpha: number): void {
    for (const w of this.walkers) if (!w.away) this.pose(w, alpha);
    this.updateHover();
    this.updateOverlay();
    this.renderer.render(this.scene, this.views.camera);
  }

  /** Interpolated transform + procedural walk cycle. */
  private pose(w: Walker, alpha: number): void {
    const x = THREE.MathUtils.lerp(w.prev.x, w.pos.x, alpha);
    const z = THREE.MathUtils.lerp(w.prev.z, w.pos.z, alpha);
    let dy = w.yaw - w.prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    w.lift += ((w.held ? 0.45 : 0) - w.lift) * 0.25;
    w.root.position.set(x, w.lift, z);
    w.root.rotation.y = w.prevYaw + dy * alpha;

    const ph = THREE.MathUtils.lerp(w.prevPhase, w.phase, alpha);
    const dangle = Math.sin(performance.now() / 110) * 0.35 * (w.lift / 0.45);
    const swing = Math.sin(ph) * 0.7 * w.moving + dangle;
    const bob = Math.abs(Math.cos(ph)) * 0.05 * w.moving;
    const breathe = Math.sin(performance.now() / 600 + w.phase) * 0.008 * (1 - w.moving);

    if (w instanceof Person) {
      const r = w.rig;
      const sit = w.sit;
      // standing: walk cycle (knees bend while a leg swings forward); sitting: thighs flat, shins down
      r.legL.rotation.x = swing * (1 - sit) - 1.5 * sit;
      r.legR.rotation.x = -swing * (1 - sit) - 1.5 * sit;
      r.kneeL.rotation.x = Math.max(0, -swing) * 0.8 * (1 - sit) + 1.5 * sit;
      r.kneeR.rotation.x = Math.max(0, swing) * 0.8 * (1 - sit) + 1.5 * sit;
      r.legL.position.y = r.legR.position.y = 0.8 - SIT_DROP * sit;
      r.armL.rotation.x = -swing * 0.8 * (1 - sit);
      r.armR.rotation.x = swing * 0.8 * (1 - sit);
      r.body.position.y = (bob + breathe) * (1 - sit) - SIT_DROP * sit;
      if (w.working) {
        // typing: hands on the keyboard, small quick jitters, now and then a glance at the screen
        const t = performance.now() / 1000 + w.phase;
        r.armL.rotation.x = -1.2 + Math.sin(t * 17) * 0.05 + Math.sin(t * 5.3) * 0.04;
        r.armR.rotation.x = -1.2 + Math.sin(t * 14 + 2) * 0.05 + Math.sin(t * 4.1) * 0.04;
        r.body.position.y += Math.sin(t * 1.3) * 0.006;
      } else if (sit > 0.01) {
        r.armL.rotation.x += -1.2 * sit;
        r.armR.rotation.x += -1.2 * sit;
      }
      if (w.talk && w.moving < 0.2) {
        const t = performance.now() / 1000 + w.phase;
        const lively = w.talk.kind === 'discussion' ? 1 : 0.6;
        if (w.speaking) {
          // speaker: gesturing arms, little hops
          r.armR.rotation.x = -0.9 + Math.sin(t * 8) * 0.55 * lively;
          r.armL.rotation.x = -0.5 + Math.sin(t * 6.3 + 1) * 0.45 * lively;
          r.body.position.y += Math.abs(Math.sin(t * 5)) * 0.03 * lively;
        } else {
          // listener: slow nod, arms mostly relaxed
          r.armR.rotation.x = Math.sin(t * 1.5) * 0.06;
          r.armL.rotation.x = -Math.sin(t * 1.5) * 0.06;
          r.body.position.y += Math.max(0, Math.sin(t * 2.2)) * 0.02;
        }
      }
    } else if (w instanceof Dog) {
      const r = w.rig;
      const s = Math.sin(ph * 1.6) * 0.8 * w.moving;
      r.legs[0].rotation.x = s;
      r.legs[1].rotation.x = -s;
      r.legs[2].rotation.x = -s;
      r.legs[3].rotation.x = s;
      r.body.position.y = bob * 1.2 + breathe;
      r.tail.rotation.y = Math.sin(performance.now() / 90 + w.phase) * (0.35 + 0.4 * w.moving);
    }
  }

  private pick(ndc: THREE.Vector2): Walker | null {
    this.raycaster.setFromCamera(ndc, this.views.camera);
    const hits = this.raycaster.intersectObjects(
      this.walkers.filter((w) => !w.away).map((w) => w.root),
      true,
    );
    if (!hits.length) return null;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !o.userData.walker) o = o.parent;
    return (o?.userData.walker as Walker) ?? null;
  }

  private toNdc(e: PointerEvent, out = new THREE.Vector2()): THREE.Vector2 {
    return out.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  /** Point on the floor plane (y = 0) under the pointer. */
  private groundAt(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.views.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
  }

  private updateHover(): void {
    this.hovered = this.dragged ?? (this.pointerInside ? this.pick(this.pointer) : null);
    this.stage.classList.toggle('is-hovering', !!this.hovered && !this.dragged);
    this.stage.classList.toggle('is-holding', !!this.dragged);
  }

  private projectPoint(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.views.camera);
    if (v.z > 1 || v.z < -1) return { x: -9999, y: -9999 };
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private seatOwners(): Map<number, string> {
    return new Map(this.office.desks.filter((d) => d.owner).map((d) => [d.number, d.owner!.id]));
  }

  private project(w: Walker, extra = 0.25): { x: number; y: number } {
    const v = new THREE.Vector3(w.root.position.x, w.headHeight + extra, w.root.position.z).project(this.views.camera);
    if (v.z > 1 || v.z < -1) return { x: -9999, y: -9999 }; // behind the camera
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private updateOverlay(): void {
    const active = this.selected ?? this.hovered;
    if (this.selected) {
      this.ring.visible = true;
      this.ring.position.x = this.selected.root.position.x;
      this.ring.position.z = this.selected.root.position.z;
    } else {
      this.ring.visible = false;
    }
    if (this.selected?.away) this.selected = null;
    this.actions.show(
      this.selected instanceof Person && this.selected.inOffice ? this.selected.member.name : null,
      this.presence.homeFull,
      !!this.selected && this.selected === this.steered,
    );
    if (active instanceof Person) {
      this.overlay.showTooltip(active.member.name, active.member.role, active.member.portrait, this.project(active));
    } else if (active instanceof Dog) {
      this.overlay.showTooltip(active.name, active.label, null, this.project(active));
    } else {
      this.overlay.hideTooltip();
    }
    this.overlay.setBubbles(
      this.social.active
        .filter((c) => c.phase === 'talk')
        .map((c) => ({ id: c.speaker.id, text: c.text, ...this.project(c.speaker, 0.55) })),
    );
    this.metaTimer -= 1 / 60;
    if (this.metaTimer <= 0) {
      this.metaTimer = 0.5;
      const talking = this.social.chattingCount;
      const working = this.people.filter((p) => p.working).length;
      const absent = this.presence.absent;
      const home = absent.filter((p) => p.awayKind === 'home').length;
      const inside = this.people.length - absent.length;
      const pets = this.walkers.filter((w) => w instanceof Dog && !w.away).length;
      this.overlay.setMeta(
        `${inside} im Büro${absent.length ? `, ${absent.length - home} weg, ${home} im Homeoffice` : ''} · ${pets} Tiere${working ? ` · ${working} arbeiten` : ''}${talking ? ` · ${talking} im Gespräch` : ''}`,
      );
    }
    this.rosterTimer -= 1 / 60;
    if (this.rosterTimer <= 0) {
      this.rosterTimer = 0.25;
      this.roster.update(
        this.presence.absent
          .map((p) => ({
            id: p.id,
            name: p.member.name,
            portrait: p.member.portrait,
            kind: p.awayKind ?? 'errand',
            moving: p.presence !== 'out',
            left: p.awayLeft,
          }))
          .sort((a, b) => Number(a.kind === 'home') - Number(b.kind === 'home') || a.left - b.left),
      );
    }
    this.seats.placeLabels(
      this.office.desks.map((d) => ({ number: d.number, hidden: false, ...this.projectPoint(d.seat.x, 1.3, d.seat.z) })),
    );
    if (this.overlay.namesVisible) {
      this.overlay.placeLabels(this.people.map((p) => ({ id: p.id, hidden: p.away, ...this.project(p, 0.1) })));
    }
  }

  /** Keeps the home office rooms and the feed tiles in line with who works from home right now. */
  private updateHomes(dt: number): void {
    const atHome = this.people.filter((p) => p.presence === 'out' && p.awayKind === 'home');
    for (let v = 0; v < ROOM_COUNT; v++) {
      const who = atHome.find((p) => p.homeVariant === v) ?? null;
      const room = this.homes[v];
      if (!who && !room?.occupied) continue;
      const home = (this.homes[v] ??= new HomeOffice(v));
      if (who && home.occupantId !== who.id) home.setOccupant(who.member);
      else if (!who && home.occupied) home.setOccupant(null);
      if (who) {
        home.update(dt);
        this.feeds.setActivity(who.id, home.activityLabel);
      }
    }
    const entries = atHome.map((p) => ({ id: p.id, name: p.member.name, variant: p.homeVariant, room: HOME_LABELS[p.homeVariant] }));
    this.feeds.sync(entries);
    this.feeds.tick(dt);
  }

  /** The front door swings open while somebody is on the way through it. */
  private updateDoor(dt: number): void {
    const near = this.walkers.some((w) => !w.away && Math.hypot(w.pos.x - DOOR.x, w.pos.z - DOOR.z) < 1.4);
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    this.entrance.rotation.y = -this.doorOpen * 1.7;
  }

  /** Draws the home office scenes into the main canvas, behind the (transparent) feed tiles. */
  private renderFeeds(): void {
    const tiles = this.feeds.tiles();
    if (!tiles.length) return;
    const r = this.renderer;
    const h = window.innerHeight;
    r.setScissorTest(true);
    for (const t of tiles) {
      const home = this.homes[t.variant];
      if (!home?.occupied) continue;
      home.render(r, t.rect.left, h - t.rect.bottom, t.rect.width, t.rect.height);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}
