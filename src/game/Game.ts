import * as THREE from 'three';
import { team } from '../data/team';
import shippedSeats from '../data/seats.json';
import { buildCharacter } from '../render/characterBuilder';
import { buildCat } from '../render/catBuilder';
import { buildDog } from '../render/dogBuilder';
import { petPortrait } from '../render/petPortrait';
import { HOME_COUNT, HOME_LABELS, HomeOffice, ROOM_COUNT, heldPoses, type ArmPose } from '../render/homeOffice';
import { SIT_DROP } from '../render/officeBuilder';
import { Views, type ViewMode } from '../render/Views';
import { DayHud } from '../ui/DayHud';
import { DAY_STORIES } from '../data/dayStories';
import { formatTime, type DayCtx, type DayTask } from './Day';
import { buildOffice, CORRIDOR_POINT, type OfficeModel } from '../render/officeModel';
import { buildWorld, NAV_CELL, WORLD } from '../render/World';
import { Actions } from '../ui/Actions';
import { Feeds } from '../ui/Feeds';
import { Overlay } from '../ui/Overlay';
import { Roster } from '../ui/Roster';
import { Seats } from '../ui/Seats';
import { DevPanel } from '../ui/DevPanel';
import { Settings } from '../ui/Settings';
import { TimeControl } from '../ui/TimeControl';
import { devEvents } from './DevEvents';
import { DeskLights } from './DeskLights';
import { Easter } from './Easter';
import { Dog } from './Dog';
import { PetCare } from './PetCare';
import { Weather } from './Weather';
import { Christmas } from './Christmas';
import { RainFx } from '../render/rainFx';
import { loadState, saveState } from '../ui/persist';
import { DOOR } from './Door';
import { Doors } from './Doors';
import { Kitchen } from './Coffee';
import { MeetingRoom } from './Meeting';
import { Pod } from './Pod';
import { PhoneBooth } from './PhoneBooth';
import { NavGrid } from './NavGrid';
import { Office } from './Office';
import { Person } from './Person';
import { Presence } from './Presence';
import { RoomEditor } from './RoomEditor';
import { Social } from './Social';
import { TimeOfDay, applySky, type SkyRig } from './TimeOfDay';
import { Traffic } from './Traffic';
import type { Walker } from './Walker';

const STEP = 1 / 60; // fixed simulation step
const TALK_REACH = 2.6; // metres: how far the player can be from somebody to talk to them
const ANSWERS = ['Hoi!', 'Na, alles klar?', 'Gerade viel los…', 'Kaffee später?', 'Schönen Tag!', 'Ha, du hier?', 'Moment, bin gleich bei dir.', 'Hast du das Meeting gesehen?', 'Mir fehlt Kaffee.', 'Läuft!'];
const BUSY_ANSWERS = ['Grad keine Zeit!', 'Später…', 'Bin im Fokus.', 'Psst, Call!', 'Mhm.'];
const BODY_RADIUS = 0.2; // how close to a wall a walker may get (nav cells are 0.5 m)
const SEATS_KEY = 'saftladen.seats';
const STEER_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const OVERCAST = new THREE.Color('#8c95a3'); // sky colour in the rain
const MAX_FRAME = 0.25; // avoid spiral of death after tab switches

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private views!: Views;
  private nav = new NavGrid(Math.ceil(WORLD.width / NAV_CELL), Math.ceil(WORLD.depth / NAV_CELL), NAV_CELL);
  private roof!: THREE.Object3D;
  private roofWanted = false;
  private office!: Office;
  private model!: OfficeModel;
  private editor!: RoomEditor;
  private walkers: Walker[] = [];
  private people: Person[] = [];
  private overlay: Overlay;
  private social = new Social();
  private traffic = new Traffic(this.nav);
  private presence!: Presence;
  private tod = new TimeOfDay();
  private weather = new Weather();
  private petCare = new PetCare();
  private rainFx!: RainFx;
  private xmas!: Christmas;
  private settings!: Settings;
  /** pets (dogs and cats), cached */
  private pets: Dog[] = [];
  private lastPresence = new Map<Person, Person['presence']>();
  private persistTimer = 2;
  private sky!: SkyRig;
  private deskLights!: DeskLights;
  private easter!: Easter;
  private timeControl!: TimeControl;
  private feeds = new Feeds();
  private roster: Roster;
  private actions: Actions;
  private seats: Seats;
  private homes: Array<HomeOffice | null> = Array.from({ length: ROOM_COUNT }, () => null);
  private entrance!: THREE.Object3D;
  private doorOpen = 0;
  private doors!: Doors;
  private meetingRoom!: MeetingRoom;
  private pod!: Pod;
  private kitchen!: Kitchen;
  private phoneBooth!: PhoneBooth;
  private metaTimer = 0;
  private rosterTimer = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private centre = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private hovered: Walker | null = null;
  private selected: Walker | null = null;
  /** the camera trails this walker (follow mode) */
  private followed: Walker | null = null;
  private dragStart = { x: 0, y: 0 };
  private dragged: Walker | null = null;
  private steered: Person | null = null;
  /** "Ein Tag im Leben": the person the player plays; `waiting` until they are (back) in the office */
  private day: {
    person: Person;
    state: 'waiting' | 'playing' | 'done' | 'failed';
    /** other people the tasks need in the office */
    needs: Person[];
    /** the current task is walked around by the player (else the person sits / stays put) */
    walking: boolean;
    time: number;
    prevMode: ViewMode;
    tasks: DayTask[];
    current: number;
    /** seconds of the day at which each finished task was done */
    splits: number[];
  } | null = null;
  private dayHud!: DayHud;
  /** what the walk-mode crosshair points at right now */
  private aim: { text: string; act: () => void } | null = null;
  /** reply bubble above the person the player talked to */
  private reply: { who: Person; text: string; t: number } | null = null;
  private keys = new Set<string>();
  /** Shift is down (fallback when the Shift keydown went missing, e.g. pressed before the window had focus) */
  private shift = false;
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

    const { sun, hemi } = buildWorld(this.scene);
    this.sky = { scene: this.scene, sun, hemi, dayBackground: new THREE.Color(stageColor) };
    const saved = loadState();
    if (typeof saved.cycle === 'number' && Number.isFinite(saved.cycle)) {
      this.tod.setCycle(saved.cycle);
      this.tod.night = this.tod.day < 0.45;
    }
    this.timeControl = new TimeControl(this.tod);
    applySky(this.tod, this.sky);
    this.rainFx = new RainFx(this.scene);
    this.xmas = new Christmas(this.scene);
    const model = (this.model = buildOffice(this.scene));
    // the editor puts the furniture where the saved layout wants it, before anything is derived from its position
    this.editor = new RoomEditor(this.scene, model.items, WORLD, () => this.relayout());
    this.blockNav();
    this.office = new Office(model, this.nav);
    this.deskLights = new DeskLights(this.scene, this.office, this.tod);
    this.easter = new Easter(this.scene);
    this.roof = model.roof;
    this.entrance = model.entrance;
    this.doors = new Doors(model.doors);
    this.meetingRoom = new MeetingRoom(model.meeting, this.nav);
    this.pod = new Pod(model.pod, this.nav);
    this.kitchen = new Kitchen(model.kitchen, this.nav);
    this.phoneBooth = new PhoneBooth(model.phoneBooth, this.nav);
    this.phoneBooth.onClosed = (closed) => this.doors.setLocked(this.phoneBooth.doorPos, closed);
    this.meetingRoom.onClosed = (closed) => this.doors.setLocked(this.meetingRoom.doorPos, closed);
    this.views = new Views(stage, this.renderer.domElement, this.nav, (mode) => {
      this.roof.visible = mode === 'walk' ? true : mode === 'plan' || mode === 'third' ? false : this.roofWanted;
      if (mode !== 'third' && this.day && this.day.state !== 'waiting') this.endDay(false); // the player switched the camera away
    });
    this.dayHud = new DayHud(() => this.endDay());
    this.views.setDoorways(model.doors.map((d) => ({ x: d.center.x, z: d.center.z, r: d.width / 2 })));
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
      () => this.toggleFollow(),
    );

    this.seats = new Seats(
      this.office.desks.length,
      team.map((m) => ({ id: m.id, name: m.name })),
      (id, number) => this.assignSeat(id, number),
    );

    this.settings = new Settings((state) => {
        model.rowLabels.visible = state.tables;
        model.roomLabels.visible = state.rooms;
        this.seats.setLabelsVisible(state.seats);
      this.weather.mode = state.xmas ? 'sun' : state.weather; // it snows instead of raining
      this.xmas.set(state.xmas);
    });

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() }),
    );
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.restoreSeats();
    this.spawn();
    new DevPanel();
    this.registerDevEvents();
    this.pets = this.walkers.filter((w): w is Dog => w instanceof Dog);
    this.presence = new Presence(this.people, this.tod, this.weather);
    this.presence.seed();
    for (const w of this.walkers) if (w instanceof Dog && w.owner.presence === 'out') w.sendAway(); // pets of people who start away
    this.bind();
    this.resize();
    // back to where the last visit ended (a deep link in the URL wins over the saved camera)
    if (!location.hash && saved.view) this.views.restore(saved.view, true);
    if (saved.selected) {
      const p = this.people.find((o) => o.id === saved.selected);
      if (p && p.inOffice) this.selected = this.followed = p;
    }
    window.addEventListener('pagehide', () => this.saveSession());
    this.overlay.setMeta(`${this.people.length} Personen, ${this.walkers.length - this.people.length} Tiere`);
    this.overlay.initLabels(this.people.map((p) => ({ id: p.id, name: p.member.name })));
    this.seats.setOwners(this.seatOwners());

    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private blockNav(): void {
    this.nav.clear();
    for (const b of this.model.blockers()) this.nav.blockWorld(b.min.x, b.min.z, b.max.x, b.max.z);
    this.nav.sealUnreachable(CORRIDOR_POINT);
    this.traffic.rebuild();
  }

  /** The room editor moved furniture: new nav grid, then desks, seats and standing spots follow. */
  private relayout(): void {
    this.blockNav();
    this.office.relayout(this.nav);
    this.meetingRoom.relayout(this.nav);
    this.pod.relayout(this.nav);
    this.kitchen.relayout(this.nav);
    this.phoneBooth.relayout(this.nav);
  }

  private restoreSeats(): void {
    let local: Record<string, number> | null = null;
    try {
      const raw = localStorage.getItem(SEATS_KEY);
      if (raw) local = JSON.parse(raw);
    } catch {
      /* storage may be unavailable or corrupt */
    }
    // seats saved in this browser win; in dev they are moved into src/data/seats.json (then the file is the truth)
    this.savedSeats = local && Object.keys(local).length ? local : { ...(shippedSeats as Record<string, number>) };
    if (local && Object.keys(local).length) void this.writeSeats(local);
  }

  /** Dev server only: writes the seat assignment to src/data/seats.json and drops the localStorage copy. */
  private async writeSeats(out: Record<string, number>): Promise<void> {
    try {
      const res = await fetch('/__save-seats', { method: 'POST', body: JSON.stringify(out) });
      if (!res.ok) throw new Error(String(res.status));
      localStorage.removeItem(SEATS_KEY);
    } catch {
      /* no dev server: localStorage stays */
    }
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
    void this.writeSeats(out);
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
      person.kitchen = this.kitchen;
      this.office.people.push(person);
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
        const dog = new Dog(m.dogName ?? `Hund von ${m.name}`, buildDog(m.dog), person, this.petStart(person, 1, 1), {
          portrait: petPortrait(`dog:${m.dog}`, () => buildDog(m.dog!)),
        });
        this.walkers.push(dog);
        this.scene.add(dog.root);
      }
      for (const [i, { kind, name }] of (m.cats ?? []).entries()) {
        const side = i % 2 ? 1 : -1;
        const cat = new Dog(name, buildCat(kind), person, this.petStart(person, side, -1), {
          id: `cat-${person.id}-${i}`,
          label: 'Bürokatze',
          portrait: petPortrait(`cat:${kind}`, () => buildCat(kind)),
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
        if (this.views.mode === 'walk' || this.views.mode === 'third') return; // dragging looks around instead
        if (this.editor.active) {
          // furniture instead of people; a click on anything else still moves the camera
          const g = this.groundAt(this.toNdc(e));
          if (!this.editor.pointerDown(this.raycaster, g)) return;
          e.stopImmediatePropagation();
          this.stage.setPointerCapture(e.pointerId);
          return;
        }
        const hit = this.pick(this.toNdc(e));
        if (!hit) return;
        const g = this.groundAt(this.toNdc(e));
        if (!g) return;
        e.stopImmediatePropagation();
        this.dragged = hit;
        this.dragMoved = false;
        this.dragStart = { x: e.clientX, y: e.clientY };
        hit.held = true;
        this.dragOffset.set(hit.pos.x - g.x, hit.pos.z - g.z);
        this.stage.setPointerCapture(e.pointerId);
      },
      true,
    );
    this.stage.addEventListener('pointermove', (e) => {
      this.pointerInside = true;
      this.toNdc(e, this.pointer);
      if (this.editor.active && this.views.mode !== 'walk' && this.views.mode !== 'third') this.editor.pointerMove(this.raycaster, this.groundAt(this.pointer), e.altKey);
      if (!this.dragged) return;
      const g = this.groundAt(this.pointer);
      if (!g) return;
      // a few pixels of hand jitter still count as a click, not a drag
      if (!this.dragMoved && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) < 5) return;
      this.dragMoved = true;
      const w = this.dragged;
      w.pos.x = THREE.MathUtils.clamp(g.x + this.dragOffset.x, 0.4, WORLD.width - 0.4);
      w.pos.z = THREE.MathUtils.clamp(g.z + this.dragOffset.y, 0.4, WORLD.depth - 0.4);
      // near a free chair: snap onto it (the person sits while carried)
      if (w instanceof Person) {
        w.snapDesk = this.office.desks.find((k) => w.canSit(k, true) && Math.min(Math.hypot(k.seat.x - w.pos.x, k.seat.z - w.pos.z), Math.hypot(k.approach.x - w.pos.x, k.approach.z - w.pos.z)) < 1) ?? null;
        if (w.snapDesk) {
          w.pos.x = w.snapDesk.seat.x;
          w.pos.z = w.snapDesk.seat.z;
        }
        w.snapMeetSeat = null;
        if (!w.snapDesk) {
          let best = 1;
          for (const k of [...this.meetingRoom.seats, ...(this.phoneBooth.seat && !this.phoneBooth.current ? [this.phoneBooth.seat] : [])]) {
            if (!w.canSitMeet(k, k !== this.phoneBooth.seat)) continue;
            const dist = Math.min(Math.hypot(k.seat.x - w.pos.x, k.seat.z - w.pos.z), Math.hypot(k.approach.x - w.pos.x, k.approach.z - w.pos.z));
            if (dist < best) {
              best = dist;
              w.snapMeetSeat = k;
            }
          }
          if (w.snapMeetSeat) {
            w.pos.x = w.snapMeetSeat.seat.x;
            w.pos.z = w.snapMeetSeat.seat.z;
          }
        }
      }
      w.prev.x = w.pos.x; // no interpolation while held, follow the cursor exactly
      w.prev.z = w.pos.z;
    });
    const drop = (e: PointerEvent) => {
      if (this.editor.dragging) {
        this.editor.pointerUp();
        if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
      }
      if (!this.dragged) return;
      const d = this.dragged;
      d.held = false;
      // snapped to a chair: stay sitting there
      if (d instanceof Person) {
        const desk = d.snapDesk;
        d.snapDesk = null;
        if (desk?.occupant && desk.occupant !== d) desk.occupant.evictFromDesk(desk);
        if (desk && d.sitDownAt(desk)) {
          this.dragged = null;
          if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
          return;
        }
        const chair = d.snapMeetSeat;
        d.snapMeetSeat = null;
        if (chair?.occupant && chair.occupant !== d && chair !== this.phoneBooth.seat) chair.occupant.evictFromMeeting(chair);
        if (chair && (chair === this.phoneBooth.seat ? this.phoneBooth.sitIn(d) : d.sitDownAtMeeting(chair))) {
          this.dragged = null;
          if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
          return;
        }
      }
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
      const landed = this.dragged;
      this.dragged = null;
      if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
      // let go in the meeting room next to somebody else: they start chatting
      if (landed instanceof Person && this.meetingRoom.contains(landed.pos)) {
        const group = this.people.filter((p) => (p === landed || this.meetingRoom.contains(p.pos)) && p.inOffice && !p.held && !p.controlled && !p.talk && !p.inMeeting && !p.playerChat && !p.printJob && !p.foosJob).slice(0, 6);
        if (group.includes(landed) && group.length >= 2) {
          group.forEach((p) => p.interrupt());
          this.social.start(group, { x: landed.pos.x, z: landed.pos.z }, this.nav);
        }
      }
    };
    this.stage.addEventListener('pointerup', drop);
    this.stage.addEventListener('pointercancel', drop);
    this.stage.addEventListener('pointerleave', () => {
      this.pointerInside = false;
      this.hovered = null;
    });
    this.stage.addEventListener('click', (e) => {
      if (this.editor.active) {
        // a click on the floor (not a camera drag) drops the selection
        if (!this.editor.takeClick() && !this.views.wasDrag) this.editor.deselect();
        return;
      }
      if (this.views.wasDrag || this.dragMoved) {
        this.dragMoved = false;
        return;
      }
      // pick at the click itself: the hover state may be a frame behind (or empty on touch)
      if (this.views.mode === 'walk') return this.interact();
      if (this.views.mode === 'third') return;
      const hit = this.pick(this.toNdc(e));
      if (hit) this.easter.click(hit);
      this.selected = hit && hit !== this.selected ? hit : null;
      this.followed = this.selected && !this.selected.away ? this.selected : null; // selecting starts follow mode right away
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      this.easter.key(e);
      if (this.day && e.code === 'Space') e.preventDefault(); // held to play in the day tasks, must not scroll or press a button
      if (this.views.mode !== 'walk' && this.views.mode !== 'third' && this.editor.key(e)) {
        if (this.editor.active) this.selected = null;
        return;
      }
      this.keys.add(e.code);
      this.shift = e.shiftKey;
      if (this.steered && STEER_KEYS.includes(e.code)) e.preventDefault();
      if (e.key.toLowerCase() === 'c' && this.selected instanceof Person) this.toggleSteer(this.selected);
      if (e.key.toLowerCase() === 'e' && this.views.mode === 'walk') this.interact();
      if (e.key.toLowerCase() === 'f') this.toggleFollow();
      if (e.key.toLowerCase() === 'n') this.overlay.toggleNames();
      if (e.key.toLowerCase() === 'r' && (this.views.mode === 'iso' || this.views.mode === 'orbit')) this.roof.visible = this.roofWanted = !this.roofWanted;
      if (e.key.toLowerCase() === 'h' && this.selected instanceof Person) this.presence.toggleHome(this.selected, this.nav);
      if (e.key === 'Escape') {
        if (this.day) this.endDay();
        this.selected = null;
        this.followed = null;
        this.release(this.steered);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.shift = e.shiftKey;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shift = false;
    });
    // every mouse event carries the modifier state too: Shift is still noticed when its key event got lost (focus change, pointer lock)
    for (const type of ['pointermove', 'pointerdown', 'mousemove', 'wheel'] as const) {
      window.addEventListener(type, (e) => (this.shift = e.shiftKey), { passive: true, capture: true });
    }
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
    this.updateDay(dt);
    this.updateSteer(dt);
    this.updateFollow(dt);
    while (this.acc >= STEP) {
      this.simulate(STEP);
      this.acc -= STEP;
    }
    this.tod.update(dt);
    applySky(this.tod, this.sky);
    this.updateEaster(dt);
    this.updateWeather(dt);
    this.updateArrivals();
    if ((this.persistTimer -= dt) <= 0) {
      this.persistTimer = 2;
      this.saveSession();
    }
    this.deskLights.update(dt);
    this.timeControl.sync();
    this.views.update(dt);
    this.updateHomes(dt);
    this.updateDoor(dt);
    this.updateAim();
    if (this.reply && (this.reply.t -= dt) <= 0) this.reply = null;
    this.render(this.acc / STEP);
    this.renderFeeds();
  }

  /** Hidden gags: disco lights, a person who has had enough of the clicking. */
  private updateEaster(dt: number): void {
    const gone = this.easter.update(dt);
    this.easter.dim(this.sky);
    if (gone) {
      this.release(gone);
      this.presence.send(gone, 'errand', this.nav);
    }
  }

  /** Remembers time of day, camera and selection for the next visit. */
  private saveSession(): void {
    saveState({ cycle: this.tod.cycle, view: this.views.snapshot(), selected: this.selected instanceof Person ? this.selected.id : undefined });
  }

  /** Showers: rain streaks and a greyer, darker light. */
  private updateWeather(dt: number): void {
    this.weather.update(dt);
    const r = this.weather.rain;
    this.rainFx.update(dt, r, 1 - this.tod.day);
    this.xmas.update(dt, this.tod.day, this.scene.background as THREE.Color, this.sky.sun);
    if (r > 0) {
      this.sky.sun.intensity *= 1 - 0.45 * r;
      this.sky.hemi.intensity *= 1 - 0.1 * r;
      (this.scene.background as THREE.Color).lerp(OVERCAST, 0.45 * r * this.tod.day);
    }
  }

  /** Somebody coming through the front door makes the pets announce it. */
  private updateArrivals(): void {
    for (const p of this.people) {
      if (p.presence === 'returning' && this.lastPresence.get(p) !== 'returning') this.petCare.greet(this.pets);
      this.lastPresence.set(p, p.presence);
    }
  }

  /** Everything the dev panel can trigger. New behaviour: register another event here (or anywhere via `devEvents.register`). */
  private registerDevEvents(): void {
    const free = () => this.people.filter((p) => p.inOffice && !p.held && !p.controlled);
    /** Pulls a person out of their conversation / desk / printer run so a dev event can take over. */
    const drop = (p: Person) => {
      this.social.leave(p);
      p.interrupt();
    };
    const pickFree = (n: number): Person[] => {
      const pool = free().sort(() => Math.random() - 0.5);
      return pool.slice(0, n);
    };
    const meeting = (n: number) => () => {
      const group = pickFree(n);
      if (group.length < 2) return null;
      group.forEach(drop);
      this.social.start(group, { ...CORRIDOR_POINT }, this.nav);
      return `Meeting mit ${group.length}: ${group.map((p) => p.member.name.split(' ')[0]).join(', ')}`;
    };
    devEvents.register({
      id: 'meeting-room',
      group: 'Meetings',
      label: 'Besprechungsraum (5)',
      run: () => {
        if (this.meetingRoom.current) return null;
        const group = pickFree(5);
        if (group.length < 2) return null;
        group.forEach(drop);
        const m = this.meetingRoom.start(group, this.nav);
        return m ? `Besprechung mit ${group.length}: ${group.map((p) => p.member.name.split(' ')[0]).join(', ')}` : null;
      },
    });
    devEvents.register({
      id: 'meeting-room-status',
      group: 'Meetings',
      label: 'Besprechung: Status',
      run: () => {
        const m = this.meetingRoom.current;
        return m ? `${m.phase} ${m.members.map((p) => `${p.member.name.split(' ')[0]}:${p.meetPhase}/${p.state}/${p.path.length}@${p.pos.x.toFixed(1)},${p.pos.z.toFixed(1)}`).join(' ')}` : 'keine Besprechung';
      },
    });
    devEvents.register({
      id: 'meeting-room-end',
      group: 'Meetings',
      label: 'Besprechung beenden',
      run: () => {
        const m = this.meetingRoom.current;
        if (!m) return null;
        m.members.forEach((p) => p.dismissMeeting());
        return 'Besprechung beendet';
      },
    });
    devEvents.register({
      id: 'pod',
      group: 'Meetings',
      label: 'Zwei ins Holzhaus',
      run: () => {
        if (this.pod.current) return null;
        const group = pickFree(2);
        if (group.length < 2) return null;
        group.forEach(drop);
        return this.pod.start(group, this.nav) ? `${group.map((p) => p.member.name.split(' ')[0]).join(' + ')} setzen sich ins Holzhaus` : null;
      },
    });
    devEvents.register({
      id: 'pod-end',
      group: 'Meetings',
      label: 'Holzhaus leeren',
      run: () => {
        const s = this.pod.current;
        if (!s) return null;
        s.abort();
        return 'Holzhaus wird verlassen';
      },
    });
    devEvents.register({
      id: 'coffee',
      group: 'Meetings',
      label: 'Kaffeepause (3)',
      run: () => {
        if (this.kitchen.current) return null;
        const group = pickFree(3);
        if (group.length < 2) return null;
        group.forEach(drop);
        return this.kitchen.start(group, this.nav) ? `Kaffeepause: ${group.map((p) => p.member.name.split(' ')[0]).join(', ')}` : null;
      },
    });
    devEvents.register({
      id: 'coffee-end',
      group: 'Meetings',
      label: 'Kaffeepause beenden',
      run: () => {
        const b = this.kitchen.current;
        if (!b) return null;
        b.end();
        return 'Kaffeepause beendet';
      },
    });
    devEvents.register({ id: 'meeting-chat', group: 'Meetings', label: 'Gespräch (2)', run: meeting(2) });
    devEvents.register({ id: 'meeting-small', group: 'Meetings', label: 'Meeting (4)', run: meeting(4) });
    devEvents.register({ id: 'meeting-big', group: 'Meetings', label: 'Meeting (6)', run: meeting(6) });
    devEvents.register({
      id: 'break-talks',
      group: 'Meetings',
      label: 'Gespräche beenden',
      run: () => {
        const n = this.social.active.length;
        this.social.active.slice().forEach((c) => c.members.slice().forEach((m) => this.social.leave(m)));
        return `${n} Gespräche beendet`;
      },
    });

    for (const p of this.people.filter((o) => o.member.look.vape)) {
      const first = p.member.name.split(' ')[0];
      devEvents.register({
        id: `vape-${p.id}`,
        group: 'Aktionen',
        label: `${first} dampft`,
        run: () => {
          if (!p.inOffice) {
            this.presence.callBack(p);
            return `${first} war nicht im Büro, wurde zurückgerufen: nochmal klicken, sobald er da ist`;
          }
          if (p.held) return null;
          drop(p);
          p.startVape(2);
          if (this.selected !== p) this.selected = p;
          return `${first} dampft`;
        },
      });
    }
    for (const p of this.people.filter((o) => o.member.look.phone)) {
      const first = p.member.name.split(' ')[0];
      devEvents.register({
        id: `phone-${p.id}`,
        group: 'Aktionen',
        label: `${first} telefoniert`,
        run: () => {
          if (!p.inOffice) {
            this.presence.callBack(p);
            return `${first} war nicht im Büro, wurde zurückgerufen: nochmal klicken, sobald er da ist`;
          }
          if (p.held) return null;
          drop(p);
          p.startPhone(this.nav);
          if (this.selected !== p) this.selected = p;
          return `${first} telefoniert`;
        },
      });
    }
    devEvents.register({
      id: 'phone-booth',
      group: 'Aktionen',
      label: 'Jemand telefoniert in der Kabine',
      run: () => {
        if (this.phoneBooth.current) return null;
        const p = pickFree(1).find((o) => o.member.look.phone) ?? this.people.find((o) => o.member.look.phone && o.inOffice && !o.held && !o.talk && !o.meetJob);
        if (!p) return null;
        drop(p);
        return this.phoneBooth.start(p, this.nav) ? `${p.member.name.split(' ')[0]} geht telefonieren in die Kabine` : null;
      },
    });
    devEvents.register({
      id: 'phone-booth-end',
      group: 'Aktionen',
      label: 'Telefonkabine leeren',
      run: () => {
        const s = this.phoneBooth.current;
        if (!s) return null;
        s.abort();
        return 'Kabine wird verlassen';
      },
    });
    devEvents.register({
      id: 'printer',
      group: 'Aktionen',
      label: 'Jemand druckt',
      run: () => {
        const p = pickFree(1)[0];
        if (!p) return null;
        drop(p);
        return p.startPrint(this.nav) ? `${p.member.name.split(' ')[0]} druckt` : null;
      },
    });

    devEvents.register({
      id: 'foosball',
      group: 'Aktionen',
      label: 'Zwei spielen Kicker',
      run: () => {
        const f = this.office.foosball;
        const [a, b] = pickFree(2);
        if (!f?.free || !b) return null;
        drop(a);
        drop(b);
        return f.start(a, b, this.nav) ? `${a.member.name.split(' ')[0]} und ${b.member.name.split(' ')[0]} spielen Kicker` : null;
      },
    });

    const away = (kind: 'errand' | 'home') => () => {
      const p = pickFree(1)[0];
      if (!p || (kind === 'home' && this.presence.homeFull)) return null;
      this.release(p);
      this.presence.send(p, kind, this.nav);
      return `${p.member.name.split(' ')[0]} geht ${kind === 'home' ? 'ins Homeoffice' : 'raus'}`;
    };
    devEvents.register({ id: 'errand', group: 'Anwesenheit', label: 'Jemand geht raus', run: away('errand') });
    devEvents.register({ id: 'home', group: 'Anwesenheit', label: 'Jemand ins Homeoffice', run: away('home') });
    devEvents.register({
      id: 'rain',
      group: 'Wetter',
      label: 'Regen an / aus',
      run: () => {
        this.weather.set(!this.weather.raining);
        this.settings.setWeather(this.weather.mode);
        return this.weather.raining ? 'Es regnet' : 'Der Regen hört auf';
      },
    });
    devEvents.register({
      id: 'door-greet',
      group: 'Tiere',
      label: 'Tiere begrüssen (Tür)',
      run: () => {
        this.petCare.greet(this.pets);
        return 'Die Tiere melden sich';
      },
    });
    devEvents.register({
      id: 'all-back',
      group: 'Anwesenheit',
      label: 'Alle zurück',
      run: () => {
        this.presence.callAllBack();
        return 'Alle kommen zurück';
      },
    });
  }

  /** Walk mode: do what the crosshair points at (open / close a door, talk to somebody). */
  private interact(): void {
    this.aim?.act();
  }

  /** Walk mode: finds the person or door in front of the player and updates the crosshair hint. */
  private updateAim(): void {
    if (this.views.mode !== 'walk') {
      this.aim = null;
      this.reply = null;
      this.overlay.setReticle(null);
      return;
    }
    const eye = this.views.eye;
    this.aim = null;
    this.raycaster.setFromCamera(this.centre, this.views.camera);
    const hits = this.raycaster.intersectObjects(
      this.people.filter((p) => !p.away && p.inOffice).map((p) => p.root),
      true,
    );
    if (hits.length && hits[0].distance < TALK_REACH) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.walker) o = o.parent;
      const p = o?.userData.walker;
      if (p instanceof Person) this.aim = { text: `E · mit ${p.member.name.split(' ')[0]} reden`, act: () => this.talkTo(p, eye) };
    }
    if (!this.aim) {
      const door = this.doors.facing(eye.x, eye.z, eye.dx, eye.dz);
      if (door) this.aim = door.locked ? { text: 'Tür verschlossen (Meeting läuft)', act: () => {} } : { text: door.open ? 'E · Tür schliessen' : 'E · Tür öffnen', act: door.toggle };
    }
    this.overlay.setReticle(this.aim?.text ?? '');
  }

  private talkTo(p: Person, eye: { x: number; z: number }): void {
    const stopped = p.talkTo({ x: eye.x, z: eye.z }, 4);
    const lines = stopped ? ANSWERS : BUSY_ANSWERS;
    this.reply = { who: p, text: lines[Math.floor(Math.random() * lines.length)], t: 3.5 };
  }

  /** Starts a day as this person: they come to the office if they are away, then the camera moves behind them. */
  startDay(id: string): void {
    const person = this.people.find((p) => p.id === id);
    if (!person) return;
    this.endDay();
    this.editor.setActive(false);
    this.selected = this.followed = null;
    const tasks = (DAY_STORIES[id] ?? []).map((make) => make());
    const needs = [...new Set(tasks.flatMap((t) => t.needs ?? []))].flatMap((nid) => this.people.find((p) => p.id === nid) ?? []);
    this.day = { person, state: 'waiting', needs, walking: true, time: 0, prevMode: this.views.mode === 'third' ? 'orbit' : this.views.mode, tasks, current: 0, splits: [] };
    (document.activeElement as HTMLElement | null)?.blur?.(); // space must not press a button
    this.dayHud.show(person.member.name);
    this.dayHud.setClock(0);
    this.dayHud.setTasks([]);
    this.dayHud.setMeter(null);
    const absent = [person, ...needs].filter((p) => !p.inOffice);
    if (absent.length) {
      this.dayHud.setStatus(`${absent.map((p) => p.member.name.split(' ')[0]).join(' und ')} kommt gleich ins Büro …`);
      absent.forEach((p) => this.presence.callBack(p));
    }
  }

  /** Leaves the day: the person is free again and the camera goes back to the view it came from. */
  endDay(restoreView = true): void {
    const d = this.day;
    if (!d) return;
    this.day = null;
    d.tasks.forEach((t) => t.dispose());
    this.release(d.person);
    this.dayHud.hide();
    if (restoreView && this.views.mode === 'third') this.views.setMode(d.prevMode);
  }

  /** The player's day: waits for the person to be in the office, then steers them from behind the shoulder. */
  private updateDay(dt: number): void {
    const d = this.day;
    if (!d) return;
    const p = d.person;
    if (d.state === 'waiting') {
      if (!p.inOffice || p.held || d.needs.some((q) => !q.inOffice || q.held)) return;
      if (!this.beginTask(d)) return;
      d.state = 'playing';
      this.dayHud.setStatus('');
      this.views.enterThird(p.pos.x, p.pos.z, p.yaw);
      this.updateDayHud();
      return;
    }
    // taken away (editor, Easter egg gone wrong, ...)
    if (!p.inOffice || (d.walking && this.steered !== p) || d.needs.some((q) => !q.inOffice)) return this.endDay();
    this.views.setThirdTarget(p.pos.x, p.pos.z);
    if (d.state !== 'playing') return;
    const task = d.tasks[d.current];
    if (!task) return;
    if (task.ready !== false) {
      d.time += dt;
      this.dayHud.setClock(d.time);
    }
    task.update(dt, this.dayCtx(p));
    if (task.failed) return this.failDay(d, task.failed);
    if (task.done) {
      d.splits.push(d.time);
      task.dispose();
      d.current++;
      if (d.current < d.tasks.length) this.beginTask(d);
      else this.finishDay(d);
    }
    this.updateDayHud();
  }

  /** Hands the person to the current task: the player walks them around, or the task sits / pins them itself. False when steering is not possible yet. */
  private beginTask(d: NonNullable<Game['day']>): boolean {
    const task = d.tasks[d.current];
    if (!task) return true;
    d.walking = task.walk !== false;
    if (!d.walking) this.release(d.person);
    else if (this.steered !== d.person) {
      this.toggleSteer(d.person);
      if (this.steered !== d.person) return false;
    }
    task.start(this.dayCtx(d.person));
    return true;
  }

  /** The player lost a task: everything freezes where it is and the card offers another try. */
  private failDay(d: NonNullable<Game['day']>, reason: string): void {
    d.state = 'failed';
    document.exitPointerLock?.();
    this.dayHud.setMeter(null);
    this.dayHud.showFail(reason, () => this.startDay(d.person.id), () => this.endDay());
  }

  private dayCtx(person: Person): DayCtx {
    return {
      scene: this.scene,
      nav: this.nav,
      person,
      say: (text, who = person) => (this.reply = { who, text, t: 1.8 }),
      keys: this.keys,
      other: (id) => this.people.find((p) => p.id === id) ?? null,
      seat: (p) => this.daySeat(p),
      pin: (p, spot) => {
        this.social.leave(p);
        p.interrupt();
        p.pinTo(spot);
      },
      release: (p) => p.unpin(),
    };
  }

  /** Sits the person at their own desk (somebody sitting there is asked to move) and pins them there. */
  private daySeat(p: Person): boolean {
    const desk = p.homeDesk ?? this.office.desks.find((k) => !k.occupant) ?? null;
    if (!desk) return false;
    this.social.leave(p);
    const sitting = p.task?.desk === desk && p.task.phase === 'work';
    if (!sitting) {
      p.interrupt();
      if (desk.occupant && desk.occupant !== p) desk.occupant.evictFromDesk(desk);
      if (desk.pending === p) desk.pending = null;
      p.sitDownAt(desk);
    }
    p.pinTo({ at: desk.seat, yaw: desk.yaw, sit: true });
    return true;
  }

  /** Task list and the pointer towards the nearest target. */
  private updateDayHud(): void {
    const d = this.day;
    if (!d) return;
    this.dayHud.setTasks(d.tasks.map((t, i) => ({ text: i < d.current || (d.state === 'done') ? t.title : `${t.title} ${t.progress}`, done: i < d.current })));
    const task = d.tasks[d.current];
    this.dayHud.setMeter(task && d.state === 'playing' ? task.meter ?? null : null);
    const me = d.person.pos;
    let best: { x: number; z: number } | null = null;
    let bestD = Infinity;
    for (const t of task && d.state === 'playing' ? task.targets : []) {
      const dist = Math.hypot(t.x - me.x, t.z - me.z);
      if (dist < bestD) {
        bestD = dist;
        best = t;
      }
    }
    if (!best) return this.dayHud.setPointer(null);
    const v = new THREE.Vector3(best.x, 0.8, best.z).project(this.views.camera);
    const behind = v.z > 1;
    let x = (v.x * 0.5 + 0.5) * window.innerWidth;
    let y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    if (behind) {
      x = window.innerWidth - x;
      y = window.innerHeight - y;
    }
    this.dayHud.setPointer({ x, y }, Math.round(bestD));
  }

  /** All tasks done: the clock stops and the result card shows the splits and the best time. */
  private finishDay(d: NonNullable<Game['day']>): void {
    d.state = 'done';
    document.exitPointerLock?.();
    const key = `saftladen.day.best.${d.person.id}`;
    let best = Infinity;
    try {
      best = Number(localStorage.getItem(key)) || Infinity;
      if (d.time < best) localStorage.setItem(key, String(d.time));
    } catch {
      /* storage blocked: no best time */
    }
    const rows = d.tasks.map((t, i) => ({ title: t.title, time: formatTime(d.splits[i] - (d.splits[i - 1] ?? 0)) }));
    this.dayHud.showResult(
      { name: d.person.member.name.split(' ')[0], total: formatTime(d.time), best: d.time < best ? null : formatTime(best), record: d.time < best, rows },
      () => this.startDay(d.person.id),
      () => this.endDay(),
    );
  }

  private toggleFollow(): void {
    if (this.followed) this.followed = null;
    else if (this.selected && !this.selected.away) this.followed = this.selected;
  }

  /** Follow mode: the camera trails the followed walker; ends when they leave or another one is picked. */
  private updateFollow(dt: number): void {
    const f = this.followed;
    if (!f) return;
    if (f.away || this.selected !== f) {
      this.followed = null;
      return;
    }
    if (f !== this.steered) this.views.follow(f.root.position.x, f.root.position.z, dt); // steering already trails the camera
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
      this.views.setSprint(false);
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
    p.steer.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.shift;
    this.views.setSprint(p.steer.run && this.views.mode === 'third');
    this.views.follow(p.pos.x, p.pos.z, dt);
  }

  private simulate(dt: number): void {
    this.presence.update(dt, this.nav);
    this.traffic.update(dt, this.walkers);
    for (const w of this.walkers) {
      w.traffic ??= this.traffic;
      // disco: everybody who is up stops and dances on the spot; an angry person stands and fumes
      if ((this.easter.disco > 0.3 && w instanceof Person && w.inOffice && w.sit < 0.05 && !w.held && !w.controlled) || this.easter.angry?.who === w) {
        w.moving += (0 - w.moving) * 0.25;
        continue;
      }
      w.update(dt, this.nav, this.walkers);
    }
    this.social.update(dt, this.people, this.nav, this.traffic);
    this.petCare.update(dt, this.people, this.pets, this.nav);
    this.meetingRoom.update(dt, this.people, this.nav);
    this.pod.update(dt, this.people, this.nav);
    this.kitchen.update(dt, this.people, this.nav);
    this.phoneBooth.update(dt, this.people, this.nav);
    this.separate();
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
        let dx = b.pos.x - a.pos.x;
        let dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 1.1;
        let d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        if (d2 < 1e-8) {
          // exactly on top of each other (same destination spot): part them in a fixed direction per pair
          dx = Math.cos(i * 2.4 + j) * 1e-3;
          dz = Math.sin(i * 2.4 + j) * 1e-3;
          d2 = dx * dx + dz * dz;
        }
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
      if (w.foosAmt > 0) {
        // foosball: both hands on the rods, quick sideways pushes and spins
        const t = performance.now() / 1000 + w.phase;
        r.armL.rotation.x = -1.1 + Math.sin(t * 9) * 0.25;
        r.armR.rotation.x = -1.1 + Math.sin(t * 7.3 + 1.5) * 0.25;
        r.armL.rotation.z = Math.sin(t * 5) * 0.12;
        r.armR.rotation.z = Math.sin(t * 4.3 + 1) * 0.12;
        r.body.position.y += Math.abs(Math.sin(t * 3)) * 0.015;
      } else {
        r.armL.rotation.z = r.armR.rotation.z = 0;
      }
      r.elbowL.rotation.set(0, 0, 0);
      r.elbowR.rotation.set(0, 0, 0);
      this.poseTired(w, r);
      if (r.vape) this.poseVape(w, r.vape, ph);
      if (r.phone) this.posePhone(w, r.phone);
      const talking = !!(w.talk || (w.playerChat && !w.petting)) && w.moving < 0.2 && !(w.sit > 0.5 && !w.speaking);
      w.talkAmt += ((talking ? 1 : 0) - w.talkAmt) * 0.12;
      w.speakAmt += ((talking && w.speaking ? 1 : 0) - w.speakAmt) * 0.15;
      const ta = w.talkAmt;
      const sa = w.speakAmt;
      if (ta > 0.01) {
        const t = performance.now() / 1000 + w.phase;
        const lively = w.talk?.kind === 'discussion' ? 1 : 0.65;
        // speaker: phrases of gestures (a slow envelope makes beats), a lean in and a sway towards the audience
        const beat = 0.55 + 0.45 * Math.sin(t * 1.7);
        const rs = -0.9 + Math.sin(t * 8) * 0.55 * lively * beat;
        const ls = -0.5 + Math.sin(t * 6.3 + 1) * 0.45 * lively * (1.1 - beat * 0.6);
        // listener: relaxed arms, slow nods, the odd tilt of the head
        const rl = Math.sin(t * 1.5) * 0.06;
        const ll = -Math.sin(t * 1.5) * 0.06;
        r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, THREE.MathUtils.lerp(rl, rs, sa), ta);
        r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, THREE.MathUtils.lerp(ll, ls, sa), ta);
        r.armR.rotation.z += sa * (0.12 + Math.sin(t * 3.1) * 0.06) * lively;
        r.armL.rotation.z -= sa * (0.1 + Math.sin(t * 2.7 + 1) * 0.05) * lively;
        r.body.position.y += (sa * Math.abs(Math.sin(t * 5)) * 0.03 * lively + (1 - sa) * Math.max(0, Math.sin(t * 2.2)) * 0.02) * ta;
        const nod = (1 - sa) * Math.max(0, Math.sin(t * 2.2 - 0.6)) * 0.07;
        r.body.rotation.x += (sa * 0.05 + nod) * ta;
        r.body.rotation.y = (sa * Math.sin(t * 1.3) * 0.14 + (1 - sa) * Math.sin(t * 0.6) * 0.04) * ta;
      } else {
        r.body.rotation.y = 0;
      }
      this.poseReaction(w, r);
      this.poseCup(w, r);
      this.poseSnack(w, r);
      this.poseEmote(w, r);
      this.poseEaster(w, r);
      this.poseGameboy(w, r);
      w.petAmt += ((w.petting && w.moving < 0.2 ? 1 : 0) - w.petAmt) * 0.12;
      if (w.petAmt > 0.01) {
        // bent forward, one hand stroking
        const a = w.petAmt;
        const t = performance.now() / 1000 + w.phase;
        r.body.rotation.x += 0.45 * a;
        r.body.position.y -= 0.06 * a;
        r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -0.45 + Math.sin(t * 7) * 0.18, a);
        r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, -0.15, a);
      }
    } else if (w instanceof Dog) {
      const r = w.rig;
      const s = Math.sin(ph * 1.6) * 0.8 * w.moving;
      const lie = w.lie;
      // lying: torso sinks to the floor, front legs stretch forward, hind legs fold back
      const base = (r.legs[0].userData.baseY ??= r.legs[0].position.y) as number;
      const drop = base * 0.8 * lie;
      r.legs[0].rotation.x = THREE.MathUtils.lerp(s, -1.45, lie);
      r.legs[1].rotation.x = THREE.MathUtils.lerp(-s, -1.45, lie);
      r.legs[2].rotation.x = THREE.MathUtils.lerp(-s, 1.45, lie);
      r.legs[3].rotation.x = THREE.MathUtils.lerp(s, 1.45, lie);
      for (const l of r.legs) l.position.y = base - drop;
      r.body.position.y = (bob * 1.2 + breathe) * (1 - lie) + breathe * lie - drop;
      // happy hops while petted, quick double hop while barking
      const now = performance.now() / 1000;
      const bark = w.barkT > 0 ? Math.max(0, Math.sin(w.barkT * 14)) * Math.min(1, w.barkT) : 0;
      r.body.position.y += Math.abs(Math.sin(now * 9 + w.phase)) * 0.04 * w.happy + bark * 0.11;
      const z = w.sleep;
      // asleep: roll onto the side, slow deep breaths, tail still, small floating Zzz
      const th = 1.45 * z;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const h = 0.44; // torso centre height: the body rolls around it
      const bx = h * sn;
      const by = r.body.position.y + h * (1 - cs) - 0.03 * z + Math.sin(performance.now() / 1100 + w.phase) * 0.012 * z;
      r.body.rotation.z = th;
      r.body.position.x = bx;
      r.body.position.y = by;
      r.legs.forEach((l, i) => {
        const q = (l.userData.q ??= { x: l.position.x, z: l.position.z }) as { x: number; z: number };
        l.rotation.order = 'ZXY';
        l.rotation.z = th;
        l.position.set(q.x * cs - 0.32 * sn + bx, q.x * sn + 0.32 * cs + by, q.z);
        if (z > 0) l.rotation.x = THREE.MathUtils.lerp(l.rotation.x, i < 2 ? -0.5 : 0.5, z);
      });
      r.tail.rotation.y = Math.sin(performance.now() / 90 + w.phase) * (0.35 + 0.4 * w.moving + 0.5 * w.happy) * (1 - 0.7 * lie) * (1 - z);
      this.poseZzz(w, z, r.face, -r.face.y * sn + bx, r.face.y * cs + by);
      // easter eggs: backflip after five clicks, hopping to the beat of the disco
      w.root.rotation.order = 'YXZ';
      const fl = this.easter.flip(w);
      w.root.rotation.x = fl ? fl.angle : 0;
      if (fl) w.root.position.y += fl.jump;
      if (this.easter.disco > 0.01) r.body.position.y += Math.abs(Math.sin(this.easter.beat * Math.PI)) * 0.1 * this.easter.disco * (1 - w.sleep);
    }
  }

  /** Little "z" bubbles drifting up from a sleeping pet. */
  private poseZzz(w: Dog, amt: number, face: { y: number; z: number; r: number }, hx: number, hy: number): void {
    let zs = w.root.userData.zzz as THREE.Sprite[] | undefined;
    if (!zs) {
      if (amt < 0.01) return;
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      g.font = 'bold 48px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 6;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.strokeText('z', 32, 34);
      g.fillStyle = '#fff';
      g.fillText('z', 32, 34);
      const tex = new THREE.CanvasTexture(c);
      zs = [0, 1, 2].map(() => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
        w.root.add(sp);
        return sp;
      });
      w.root.userData.zzz = zs;
    }
    const t = performance.now() / 1000;
    zs.forEach((sp, i) => {
      const k = (t / 3 + i / 3) % 1;
      sp.visible = amt > 0.02;
      sp.position.set(hx + 0.05 + k * 0.12, hy + face.r * 0.5 + k * 0.28, face.z + 0.05);
      const sc = (0.07 + 0.08 * k) / w.root.scale.y;
      sp.scale.set(sc, sc, 1);
      sp.material.opacity = Math.sin(k * Math.PI) * amt;
    });
  }

  /** Tired people: heavy eyelids, dark eye bags, a slouch and a yawn now and then (hand over the mouth). */
  private poseTired(w: Person, r: Person['rig']): void {
    const tired = this.tod.tired;
    let lids = tired;
    r.body.rotation.x = tired * 0.07 * (1 - w.sit * 0.5);
    r.body.position.y -= tired * 0.012 * (1 - w.sit);
    const idle = w.moving < 0.2 && w.phoneAmt < 0.05 && !w.vapeJob && !w.foosAmt && !((w.talk || w.playerChat) && w.speaking);
    if (tired > 0.35 && idle) {
      // one yawn every ~25 s, each person on their own beat
      const t = (performance.now() / 1000 + w.phase * 9) % 25;
      if (t < 2.4) {
        const k = Math.sin((t / 2.4) * Math.PI);
        r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -2.5, k * tired);
        r.armR.rotation.z = THREE.MathUtils.lerp(r.armR.rotation.z, 0.25, k * tired);
        r.body.rotation.x -= k * tired * 0.1;
        lids = Math.min(1, tired + k * 0.7);
      }
    }
    r.setTired(lids);
  }

  /** Coffee cup in the left hand: held in front of the chest, now and then raised to the mouth. The cup stays upright. */
  private poseCup(w: Person, r: Person['rig']): void {
    const a = w.cupAmt;
    r.cup.visible = a > 0.02;
    r.chips.visible = w.snackAmt > 0.02;
    // the arm is also busy while reaching for (or setting down) the mug on the desk, with an empty hand, or holding a bag of chips
    const arm = Math.max(a, w.drinkAmt, w.snackAmt);
    if (arm < 0.02) return;
    const sip = w.cupSip;
    const reach = w.cupReach; // out and down to the mug on the desk
    r.armL.rotation.x = THREE.MathUtils.lerp(r.armL.rotation.x, THREE.MathUtils.lerp(THREE.MathUtils.lerp(-1.25, -1.95, sip), -1.12, reach), arm);
    r.armL.rotation.z = (0.12 + 0.25 * sip - 0.42 * reach) * arm;
    if (r.chips.visible) r.chips.quaternion.copy(r.armL.quaternion).invert();
    if (!r.cup.visible) return;
    r.cup.quaternion.copy(r.armL.quaternion).invert();
    r.cup.rotateX(-0.7 * sip);
  }

  /** Handheld console in both hands in front of the chest, head bowed over it, thumbs twitching; the screen flickers. */
  private poseGameboy(w: Person, r: Person['rig']): void {
    const a = w.gameboy;
    r.gameboy.visible = a > 0.02;
    if (a < 0.02) return;
    const lerp = THREE.MathUtils.lerp;
    const t = performance.now() / 1000 + w.phase;
    r.armL.rotation.x = lerp(r.armL.rotation.x, -1.05, a);
    r.armR.rotation.x = lerp(r.armR.rotation.x, -1.05, a);
    r.armL.rotation.z = lerp(r.armL.rotation.z, 0.3, a);
    r.armR.rotation.z = lerp(r.armR.rotation.z, -0.3, a);
    r.elbowL.rotation.x = -1.35 * a + Math.sin(t * 23) * 0.04 * a;
    r.elbowR.rotation.x = -1.35 * a + Math.sin(t * 19 + 1) * 0.04 * a;
    r.body.rotation.x += 0.14 * a;
    r.gameboy.position.y = lerp(0.7, 1.0, a);
    r.gameboy.rotation.x = 0.5; // screen towards his face
    r.gameboyScreen.color.setHex(Math.sin(t * 9) > 0.85 ? 0x8bac0f : 0x9bbc0f);
  }

  /** Eating chips: the left hand holds the bag (see `poseCup`), the right hand fetches a chip and takes it to the mouth now and then. */
  private poseSnack(w: Person, r: Person['rig']): void {
    const k = w.snackBite * w.snackAmt;
    r.chip.visible = w.snackAmt > 0.5 && w.snackChipInHand;
    if (k <= 0) return;
    const lerp = THREE.MathUtils.lerp;
    r.armR.rotation.x = lerp(r.armR.rotation.x, -0.64, k);
    r.armR.rotation.z = lerp(r.armR.rotation.z, -0.39, k);
    r.elbowR.rotation.x = -2.15 * k;
    r.body.rotation.x -= 0.03 * k;
  }

  /** Little gestures: a yawn behind the hand, a stretch, scratching the head, a look to the side. Blends over whatever the arms were doing. */
  /** Disco dance (Konami code) and the shaking fists of somebody who has been clicked on too often. */
  private poseEaster(w: Person, r: Person['rig']): void {
    const lerp = THREE.MathUtils.lerp;
    const a = this.easter.disco;
    if (a > 0.01) {
      const b = this.easter.beat * Math.PI * 2;
      const up = 1 - w.sit;
      r.body.position.y += Math.abs(Math.sin(b / 2)) * 0.09 * a * up;
      r.body.rotation.z = Math.sin(b / 2) * 0.14 * a;
      r.armL.rotation.x = lerp(r.armL.rotation.x, -2.7 + Math.sin(b) * 0.45, a);
      r.armR.rotation.x = lerp(r.armR.rotation.x, -2.7 - Math.sin(b) * 0.45, a);
      r.armL.rotation.z = lerp(r.armL.rotation.z, -0.25 + Math.sin(b / 2) * 0.2, a);
      r.armR.rotation.z = lerp(r.armR.rotation.z, 0.25 + Math.sin(b / 2) * 0.2, a);
      r.elbowL.rotation.x = lerp(r.elbowL.rotation.x, 0, a);
      r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, 0, a);
      r.legL.rotation.x = lerp(r.legL.rotation.x, Math.sin(b / 2) * 0.5, a * up);
      r.legR.rotation.x = lerp(r.legR.rotation.x, -Math.sin(b / 2) * 0.5, a * up);
      r.kneeL.rotation.x = lerp(r.kneeL.rotation.x, Math.max(0, -Math.sin(b / 2)) * 0.9, a * up);
      r.kneeR.rotation.x = lerp(r.kneeR.rotation.x, Math.max(0, Math.sin(b / 2)) * 0.9, a * up);
    }
    if (this.easter.angry?.who === w) {
      const t = performance.now() / 1000;
      r.armL.rotation.x = -0.9 + Math.sin(t * 22) * 0.35;
      r.armR.rotation.x = -0.9 + Math.sin(t * 22 + Math.PI) * 0.35;
      r.elbowL.rotation.x = r.elbowR.rotation.x = -1.2;
      r.body.rotation.y = Math.sin(t * 30) * 0.18;
      r.body.position.y += Math.abs(Math.sin(t * 15)) * 0.04;
    }
  }

  /** Body language during a talk: laughing, pointing, shrugging, startled, nodding, thinking, waving, cheering. Blends over the usual talking pose. */
  private poseReaction(w: Person, r: Person['rig']): void {
    const rc = w.reaction;
    if (!rc || rc.t < 0) return;
    const p = rc.t / rc.dur;
    const a = Math.min(1, p * 6, (1 - p) * 6); // quick in, quick out
    if (a <= 0) return;
    const held = heldPoses(r);
    const t = rc.t;
    const hop = 1 - w.sit * 0.8;
    const lerp = THREE.MathUtils.lerp;
    const arm = (right: boolean, q: ArmPose) => {
      const shoulder = right ? r.armR : r.armL;
      const elbow = right ? r.elbowR : r.elbowL;
      const sign = right ? 1 : -1;
      shoulder.rotation.x = lerp(shoulder.rotation.x, q.x, a);
      shoulder.rotation.z = lerp(shoulder.rotation.z, sign * q.z, a);
      elbow.rotation.x = lerp(elbow.rotation.x, q.e, a);
      elbow.rotation.z = lerp(elbow.rotation.z, sign * q.ez, a);
    };
    switch (rc.kind) {
      case 'laugh':
        // holds the belly, head thrown back, shoulders shaking
        arm(false, { x: -0.7, z: 0.1, e: -1.3, ez: 0 });
        arm(true, { x: -0.3, z: 0.25, e: -0.4, ez: 0 });
        r.body.rotation.x -= 0.2 * a;
        r.body.rotation.z += Math.sin(t * 24) * 0.04 * a;
        r.body.position.y += Math.abs(Math.sin(t * 16)) * 0.03 * a * hop;
        break;
      case 'point':
        arm(true, { x: -1.55 + Math.sin(t * 11) * 0.18, z: 0.08, e: 0, ez: 0 });
        r.body.rotation.x += 0.08 * a;
        r.body.rotation.y += 0.1 * a;
        break;
      case 'shrug':
        arm(true, { x: -0.55, z: 0.5, e: -1.1, ez: 0 });
        arm(false, { x: -0.55, z: 0.5, e: -1.1, ez: 0 });
        r.body.position.y += 0.02 * a * hop;
        r.body.rotation.z += 0.09 * a * Math.sin(t * 5);
        break;
      case 'surprise':
        arm(true, { x: -0.5, z: 0.5, e: -0.7, ez: 0 });
        arm(false, { x: -0.5, z: 0.5, e: -0.7, ez: 0 });
        r.body.rotation.x -= 0.2 * a;
        r.body.position.y += Math.max(0, Math.sin(Math.min(1, p * 3) * Math.PI)) * 0.07 * hop;
        break;
      case 'nod':
        r.body.rotation.x += Math.sin(p * Math.PI * 4) * 0.12 * a;
        break;
      case 'think':
        arm(true, held.think);
        r.body.rotation.y += 0.12 * a * Math.sin(t * 2);
        r.body.rotation.x += 0.04 * a;
        break;
      case 'wave':
        arm(true, { x: -2.6, z: 0.35 + Math.sin(t * 13) * 0.25, e: -0.3, ez: 0 });
        break;
      case 'cheer':
        arm(true, { x: -2.9 + Math.sin(t * 9) * 0.15, z: 0.3, e: 0, ez: 0 });
        arm(false, { x: -2.9 - Math.sin(t * 9) * 0.15, z: 0.3, e: 0, ez: 0 });
        r.body.position.y += Math.abs(Math.sin(t * 8)) * 0.06 * a * hop;
        break;
    }
  }

  private poseEmote(w: Person, r: Person['rig']): void {
    const a = w.emoteAmt;
    if (a <= 0) return;
    const held = heldPoses(r);
    const t = performance.now() / 1000 + w.phase;
    const lerp = THREE.MathUtils.lerp;
    // ArmPose: x swing, z out to the side (away from the body), e elbow bend, ez elbow sideways; the left arm is on -x
    const arm = (right: boolean, p: ArmPose) => {
      const shoulder = right ? r.armR : r.armL;
      const elbow = right ? r.elbowR : r.elbowL;
      const sign = right ? 1 : -1;
      shoulder.rotation.x = lerp(shoulder.rotation.x, p.x, a);
      shoulder.rotation.z = lerp(shoulder.rotation.z, sign * p.z, a);
      elbow.rotation.x = lerp(elbow.rotation.x, p.e, a);
      elbow.rotation.z = lerp(elbow.rotation.z, sign * p.ez, a);
    };
    switch (w.emoteKind) {
      case 'yawn': {
        // hand over the mouth, head back, eyes screwed shut
        arm(true, held.vape);
        r.body.rotation.x -= 0.12 * a;
        r.setTired(Math.min(1, this.tod.tired + Math.sin(w.emoteP * Math.PI) * 0.8 * a));
        break;
      }
      case 'stretch': {
        const up: ArmPose = { x: -3.05, z: 0.35 + Math.sin(t * 2.5) * 0.04, e: 0, ez: 0 };
        arm(true, up);
        arm(false, up);
        r.body.rotation.x -= 0.14 * a;
        break;
      }
      case 'scratch':
        arm(true, { ...held.think, ez: held.think.ez + Math.sin(t * 14) * 0.12 });
        r.body.rotation.x += 0.04 * a;
        break;
      case 'look':
        r.body.rotation.y += w.emoteDir * 0.6 * a * Math.sin(Math.min(1, w.emoteP * 1.6) * Math.PI * 0.5);
        break;
    }
  }

  /** Phone at the ear during a call: upper arm lifted, forearm folded up, a little nod while walking. */
  private posePhone(w: Person, ph: NonNullable<Person['rig']['phone']>): void {
    const a = w.phoneAmt;
    const r = w.rig;
    ph.device.visible = a > 0;
    if (a > 0) {
      r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -0.35, a);
      r.armR.rotation.z = -0.3 * a;
      ph.elbow.rotation.x = -2.4 * a;
    } else {
      r.armR.rotation.z = 0;
      ph.elbow.rotation.x = 0;
    }
  }

  /** Right hand to the mouth while taking a drag, glowing tip, then a vapour cloud that drifts up and fades. */
  private poseVape(w: Person, v: NonNullable<Person['rig']['vape']>, _ph: number): void {
    const a = w.vapeAmt;
    const r = w.rig;
    v.device.visible = a > 0;
    if (a > 0) {
      r.armR.rotation.x = THREE.MathUtils.lerp(r.armR.rotation.x, -0.64, a);
      r.armR.rotation.z = -0.39 * a;
      v.elbow.rotation.x = -2.15 * a;
    } else {
      r.armR.rotation.z = 0;
      v.elbow.rotation.x = 0;
    }
    v.led.color.set(w.vapeDraw ? 0xff7a2a : 0x3a1a10);
    const t = w.puffT;
    v.puffs.forEach((m, i) => {
      const k = t - i * 0.18; // each puff leaves a little later
      const on = t >= 0 && k >= 0 && k < 1.8;
      m.visible = on;
      if (!on) return;
      const u = k / 1.8;
      const s = 0.08 + u * 0.22;
      m.scale.set(s, s * 0.8, s);
      m.position.set(0.12 + Math.sin(i * 2.3 + u * 3) * 0.08 * u, 1.5 + u * 0.55, 0.25 + u * 0.3 + i * 0.03);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - u) * Math.min(1, k * 6);
    });
  }

  private pick(ndc: THREE.Vector2): Walker | null {
    if (this.editor.active) return null; // the room editor owns the pointer
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
    this.hovered = this.dragged ?? (this.pointerInside && this.views.mode !== 'third' ? this.pick(this.pointer) : null);
    this.stage.classList.toggle('is-hovering', (!!this.hovered && !this.dragged) || (this.editor.hovering && !this.editor.dragging));
    this.stage.classList.toggle('is-holding', !!this.dragged || this.editor.dragging);
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
      !!this.selected && this.selected === this.followed,
    );
    if (active instanceof Person) {
      this.overlay.showTooltip(active.member.name, active.member.role, active.member.portrait, this.project(active));
    } else if (active instanceof Dog) {
      this.overlay.showTooltip(active.name, '',active.portrait, this.project(active));
    } else {
      this.overlay.hideTooltip();
    }
    const meet = this.meetingRoom.current;
    const coffee = this.kitchen.current;
    const rep = this.reply;
    this.overlay.setBubbles([
      ...(this.easter.angry && !this.easter.angry.who.away ? [{ id: `angry-${this.easter.angry.who.id}`, text: this.easter.angry.text, ...this.project(this.easter.angry.who, 0.55) }] : []),
      ...(rep && !rep.who.away ? [{ id: `reply-${rep.who.id}`, text: rep.text, ...this.project(rep.who, 0.55) }] : []),
      ...this.social.active.filter((c) => c.phase !== 'gather' && c.text).map((c) => ({ id: c.speaker.id, text: c.text, ...this.project(c.speaker, 0.55) })),
      ...(coffee?.phase === 'chat' ? [{ id: coffee.speaker.id, text: coffee.text, ...this.project(coffee.speaker, 0.55) }] : []),
      ...(this.meetingRoom.casual ? [{ id: this.meetingRoom.casual.speaker.id, text: this.meetingRoom.casual.text, ...this.project(this.meetingRoom.casual.speaker, 0.55) }] : []),
      ...this.pets
        .filter((d) => !d.away && (d.barkT > 0 || (d.petted && d.happy > 0.5)))
        .map((d) => ({ id: `pet-${d.id}`, text: d.barkT > 0 ? (d.isCat ? 'Miau!' : 'Wuff!') : '♥', ...this.project(d, 0.35) })),
      ...(meet?.phase === 'session' ? [{ id: meet.speaker.id, text: meet.text, ...this.project(meet.speaker, 0.55) }] : []),
    ]);
    this.metaTimer -= 1 / 60;
    if (this.metaTimer <= 0) {
      this.metaTimer = 0.5;
      const talking = this.social.chattingCount;
      const inMeeting = this.meetingRoom.count;
      const working = this.people.filter((p) => p.working).length;
      const absent = this.presence.away;
      const home = absent.filter((p) => p.awayKind === 'home').length;
      const inside = this.people.filter((p) => p.presence === 'in').length;
      const pets = this.walkers.filter((w) => w instanceof Dog && !w.away).length;
      const meta = [this.tod.clock, `${inside} im Büro`];
      if (this.weather.rain > 0.3) meta.push('Regen');
      if (this.presence.lunch) meta.push('Mittagspause');
      if (absent.length) {
        if (absent.length - home > 0) meta.push(`${absent.length - home} weg`);
        if (home > 0) meta.push(`${home} im Homeoffice`);
      }
      meta.push(`${pets} Tiere`);
      if (working) meta.push(`${working} arbeiten`);
      if (talking) meta.push(`${talking} im Gespräch`);
      if (inMeeting) meta.push(`${inMeeting} im Meeting`);
      this.overlay.setMeta(meta);
    }
    this.rosterTimer -= 1 / 60;
    if (this.rosterTimer <= 0) {
      this.rosterTimer = 0.25;
      this.roster.update(
        this.presence.away
          .map((p) => ({
            id: p.id,
            name: p.member.name,
            portrait: p.member.portrait,
            kind: p.awayKind === 'home' ? ('home' as const) : ('errand' as const),
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
  }

  /** The front door swings open while somebody is on the way through it. */
  private updateDoor(dt: number): void {
    const near = this.walkers.some((w) => !w.away && Math.hypot(w.pos.x - DOOR.x, w.pos.z - DOOR.z) < 1.4);
    this.doorOpen += ((near ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 6);
    this.entrance.rotation.y = -this.doorOpen * 1.7;
    this.doors.update(
      dt,
      [...this.walkers.filter((w) => !w.away).map((w) => w.pos), ...(this.views.mode === 'walk' ? [this.views.eye] : [])],
    );
  }

  /** Draws the home office scenes into the main canvas, behind the (transparent) feed tiles. */
  private renderFeeds(): void {
    const tiles = this.feeds.tiles();
    this.overlay.maskOut(tiles.map((t) => t.clip));
    if (!tiles.length) return;
    const r = this.renderer;
    const h = window.innerHeight;
    r.setScissorTest(true);
    for (const t of tiles) {
      const home = this.homes[t.variant];
      if (!home?.occupied) continue;
      home.render(r, t.rect.left, h - t.rect.bottom, t.rect.width, t.rect.height, [t.clip.left, h - t.clip.bottom, t.clip.width, t.clip.height]);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, window.innerWidth, window.innerHeight);
  }
}
