import * as THREE from 'three';
import { team } from '../data/team';
import shippedSeats from '../data/seats.json';
import { HOME_LABELS, HomeOffice, ROOM_COUNT, heldPoses, type ArmPose } from '../render/homeOffice';
import { MOUTH, posePuffs, smokeArmPose, smokePoses } from '../render/smokeProps';
import { kurtPortrait, kurtWave } from '../render/kurtBuilder';
import { PoofFx } from '../render/poofFx';
import { petPortrait } from '../render/petPortrait';
import { SIT_DROP } from '../render/officeBuilder';
import { CLICK_SLOP, Views, type ViewMode } from '../render/Views';
import { nearestHit, nearestOnScreen, type Column } from './pick';
import { Bubbles } from '../render/Bubbles';
import { DayHud } from '../ui/DayHud';
import { DAY_STORIES } from '../data/dayStories';
import { formatTime, type DayCtx, type DayTask } from './Day';
import { buildWorld, WORLD } from '../render/World';
import { Actions } from '../ui/Actions';
import { ActionSheet, type SheetPick } from '../ui/ActionSheet';
import { NowChip } from '../ui/NowChip';
import { People } from '../ui/People';
import { OFFICE_ACTIONS, type OfficeAction } from '../data/actions';
import { ACTION_POLAR, ARRIVE_RADIUS, FOLLOW_ZOOM, type Shot } from '../render/cameraFly';
import { Feeds } from '../ui/Feeds';
import { Overlay } from '../ui/Overlay';
import { Roster } from '../ui/Roster';
import { Seats } from '../ui/Seats';
import { DevPanel } from '../ui/DevPanel';
import { registerDevSection } from '../ui/devSections';
import { castSection } from '../ui/devCast';
import { overlaySection } from '../ui/devOverlays';
import { DebugOverlays } from './DebugOverlays';
import { Settings } from '../ui/Settings';
import { TimeControl } from '../ui/TimeControl';
import { exposeDevConsole } from './DevEvents';
import { DeskLights } from './DeskLights';
import type { Desk } from './Office';
import { RoomLight } from './RoomLight';
import { Easter } from './Easter';
import { Dog } from './Dog';
import { Christmas } from './Christmas';
import { RainFx } from '../render/rainFx';
import { PuddleFx } from '../render/puddleFx';
import { SpawnFx } from '../render/spawnFx';
import { loadState, saveState } from '../ui/persist';
import { DOOR_LANES, laneBusy } from './Door';
import { setTvMode } from '../render/screens';
import { Person } from './Person';
import { strings } from '../i18n/strings';
import { RoomEditor } from './RoomEditor';
import { HIP_HEIGHT, LEG_ORDER, petPose, poseFrame, SIT_POSE, smooth } from './petPose';
import { applySky, type SkyRig } from './TimeOfDay';
import { MAX_FRAME, type Drawer, type FrameTime } from './seams';
import { FramePacer, type FrameState } from './framePacer';
import { Sim } from './Sim';
import { first } from './simEvents';
import { Walker } from './Walker';
import { kurtOnScreen } from './AlterEgo';
import { random } from './rng';
import { poseGameboy } from './gameboyPose';
import { poseCamera } from './cameraPose';
import { poseRepair } from './repairPose';
import { savedStateIgnored, storage } from './storage';

const STEP = 1 / 60; // fixed simulation step
const NEAR_PX = 20; // a click that hits nobody still picks whoever is this close on screen
const OFF_SCREEN = Object.freeze({ x: -9999, y: -9999 }); // `projectPoint` of a point outside the camera's depth range
const TALK_REACH = 2.6; // metres: how far the player can be from somebody to talk to them
const ANSWERS = ['Hoi!', 'Na, alles klar?', 'Gerade viel los…', 'Kaffee später?', 'Schönen Tag!', 'Ha, du hier?', 'Moment, bin gleich bei dir.', 'Hast du das Meeting gesehen?', 'Mir fehlt Kaffee.', 'Läuft!'];
const BUSY_ANSWERS = ['Grad keine Zeit!', 'Später…', 'Bin im Fokus.', 'Psst, Call!', 'Mhm.'];
const SEATS_KEY = 'saftladen.seats';
const STEER_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const OVERCAST = new THREE.Color('#8c95a3'); // sky colour in the rain
const ACTION_MAX = 240; // seconds: an action's chip and camera give up after this long at the latest
const ACTION_NO_LEAD = 6; // seconds the chip stays for an action that moves nobody (e.g. rain)

/** What an action may change on a person; the first person whose values change is the one the camera follows. */
const leadState = (p: Person): unknown[] => [p.printJob, p.foosJob, p.meetPhase, p.coffeeJob, p.vapeJob, p.phoneJob, p.talk, p.presence === 'in' ? null : p.presence];

export class Game {
  private scene = new THREE.Scene();
  /** the office and everybody in it; this class is its view and its input */
  readonly sim!: Sim;
  private views!: Views;
  private roof!: THREE.Object3D;
  private roofCords!: (visible: boolean) => void;
  private roofWanted = false;
  private editor!: RoomEditor;
  private overlay: Overlay;
  private poofFx = new PoofFx(this.scene);
  /** alter egos whose desk monitor shows Kurt right now, with that desk (see updateAlterEgos) */
  private kurtScreens = new Map<Person, Desk>();
  private rainFx!: RainFx;
  private puddleFx!: PuddleFx;
  private spawnFx!: SpawnFx;
  private xmas!: Christmas;
  private settings!: Settings;
  private sheet!: ActionSheet;
  private now!: NowChip;
  private peoplePanel!: People;
  /**
   * The action started from the Aktionen sheet: `lead` is the person it moved first (`keys`: which of their
   * `leadState` values it set), `owned` while the camera is the action's (the player has not grabbed it),
   * `settled` once the camera rests on the place.
   */
  private action: { def: OfficeAction | null; caption: string; lead: Person | null; keys: number[]; owned: boolean; settled: boolean; age: number; azimuth: number } | null = null;
  private picker = document.getElementById('picker') as HTMLElement;
  private dayMenu = document.getElementById('day-menu') as HTMLElement;
  private lastPresence = new Map<Person, Person['presence']>();
  private persistTimer = 2;
  private sky!: SkyRig;
  private deskLights!: DeskLights;
  private meetingLight!: RoomLight;
  private easter!: Easter;
  private timeControl!: TimeControl;
  private feeds = new Feeds();
  private roster: Roster;
  private actions: Actions;
  private seats: Seats;
  private homes: Array<HomeOffice | null> = Array.from({ length: ROOM_COUNT }, () => null);
  private entrance!: { left: THREE.Object3D; right: THREE.Object3D };
  private doorOpen = { left: 0, right: 0 };
  private metaTimer = 0;
  private rosterTimer = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private centre = new THREE.Vector2(0, 0);
  private pointerInside = false;
  private hovered: Walker | null = null;
  /** who a click would select now (hand cursor, hover ring), see `updateHover` */
  private over: Walker | null = null;
  private selected: Walker | null = null;
  /** the camera trails this walker (follow mode) */
  private followed: Walker | null = null;
  private dragStart = { x: 0, y: 0 };
  /** dev only: debug overlays (nav grid, state labels, paths), see the dev panel */
  debug: DebugOverlays | null = null;
  private dragged: Walker | null = null;
  /** who the last press started on (kept until the next one): lifted (`dragged`) only once the pointer moves past `CLICK_SLOP` */
  private pressed: Walker | null = null;
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
  /** speech bubbles in the scene (read by the e2e tests: `__game.bubbles.state`) */
  private bubbles = new Bubbles(this.scene);
  private bubbleClock = 0;
  /** dev: how many times the son was called into the home office (`HomeOffice.callSon` takes it from here) */
  private sonCalls = 0;
  private keys = new Set<string>();
  /** Shift is down (fallback when the Shift keydown went missing, e.g. pressed before the window had focus) */
  private shift = false;
  private dragOffset = new THREE.Vector2();
  private dragMoved = false;
  private fwd = new THREE.Vector3();
  private scratch = new THREE.Vector3();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ring: THREE.Mesh;
  private hoverRing: THREE.Mesh;
  private savedSeats: Record<string, number> = {};
  private acc = 0;
  /** game time in seconds: what the frames' time source gave, times the clock speed, plus what `advance` ran; stands still while paused. Poses and bubbles animate on it. */
  private clock = 0;
  /** frames run so far */
  private frames = 0;
  /** called with every stretch of game time that passes (dev params, tests): they follow game time, so `advance` takes them along */
  private steppers = new Set<(dt: number) => void>();
  private time: FrameTime;
  private drawer: Drawer;
  /** which display refreshes draw a frame (#212) */
  private pacer = new FramePacer();
  /** false: every refresh draws (`?test`, where time stands still anyway); the pacer still says what it would do */
  private paced: boolean;
  private focused = document.hasFocus();
  private paceState: FrameState = { timeScale: 0, viewMoved: true, keysHeld: false, focused: true };
  /** the last refresh the pacer skipped while the game was held (ms) */
  private heldAt = -Infinity;
  /** the camera moved on the last frame drawn */
  private viewMoved = true;
  private lastCamera: THREE.Camera | null = null;
  private lastView = new THREE.Matrix4();
  private lastProjection = new THREE.Matrix4();

  /**
   * `time` says how much time a frame adds, `drawer` puts it on the screen (`seams.ts`): the wall clock and WebGL for
   * players; the e2e tests take time that stands still and a drawer that draws nothing.
   */
  constructor(
    private stage: HTMLElement,
    { time, drawer, paced = true }: { time: FrameTime; drawer: Drawer; paced?: boolean },
  ) {
    this.time = time;
    this.drawer = drawer;
    this.paced = paced;
    stage.appendChild(this.drawer.renderer.domElement);

    const stageColor = getComputedStyle(document.documentElement).getPropertyValue('--color-scene').trim();
    this.scene.background = new THREE.Color(stageColor);

    const { sun, hemi } = buildWorld(this.scene);
    this.sky = { scene: this.scene, sun, hemi, dayBackground: new THREE.Color(stageColor) };
    const saved = loadState();
    this.rainFx = new RainFx(this.scene);
    this.puddleFx = new PuddleFx(this.scene);
    this.spawnFx = new SpawnFx(this.scene);
    this.xmas = new Christmas(this.scene);
    this.restoreSeats();
    this.sim = new Sim({
      scene: this.scene,
      cycle: typeof saved.cycle === 'number' && Number.isFinite(saved.cycle) ? saved.cycle : undefined,
      seats: this.savedSeats,
      homes: location.hash.includes('homes'),
      // the editor puts the furniture where the saved layout wants it, before anything is derived from its position
      portrait: petPortrait,
      // the interior doors open for the player's eye in the walk view too
      doorsSee: () => (this.views?.mode === 'walk' ? [this.views.eye] : []),
      // disco: everybody who is up stops and dances on the spot; an angry person stands and fumes
      stands: (w) => (this.easter.disco > 0.3 && w instanceof Person && w.inOffice && w.sit < 0.05 && !w.held && !w.controlled) || this.easter.angry?.who === w,
      // a dev event points at somebody: selected
      point: (w) => (this.selected = w),
      prepare: (m) => (this.editor = new RoomEditor(this.scene, m.items, WORLD, () => this.sim.relayout(), () => this.sim.blocked())),
    });
    const model = this.sim.model;
    if (Number.isInteger(saved.weekday) && saved.weekday! >= 0 && saved.weekday! < 7) this.sim.tod.weekday = saved.weekday!;
    this.timeControl = new TimeControl(this.sim.tod);
    applySky(this.sim.tod, this.sky);
    this.deskLights = new DeskLights(this.scene, this.sim.office, this.sim.tod);
    this.easter = new Easter(this.scene);
    this.roof = model.roof;
    this.roofCords = model.setRoofVisible;
    this.entrance = model.entrance;
    this.meetingLight = new RoomLight(this.scene, model.meeting.lamp, this.sim.tod, () => this.sim.meetingRoom.occupants(this.sim.people));
    this.views = new Views(stage, this.drawer.renderer.domElement, this.sim.walkColliders, (mode) => {
      this.setRoof(mode === 'walk' ? true : mode === 'plan' || mode === 'third' ? false : this.roofWanted);
      if (mode !== 'third' && this.day && this.day.state !== 'waiting') this.endDay(false); // the player switched the camera away
      if (mode !== 'orbit') this.handBack(); // the camera is the player's again
      this.settings?.setView(mode);
      if (mode === 'walk' || mode === 'third') {
        this.settings?.setOpen(false);
        this.sheet?.close();
      }
    });
    this.views.onUserCamera = () => this.handBack();
    this.dayHud = new DayHud(() => this.endDay());
    this.overlay = new Overlay();
    this.overlay.onNames = (on) => this.settings?.setNames(on);
    this.roster = new Roster(
      (id) => this.feeds.focus(id),
      (id) => {
        const p = this.sim.people.find((o) => o.id === id);
        if (p) this.sim.presence.callBack(p);
      },
      () => this.sim.presence.callAllBack(),
    );
    this.actions = new Actions(
      () => {
        if (!(this.selected instanceof Person)) return;
        this.release(this.selected);
        this.sim.presence.send(this.selected, 'home', this.sim.nav);
      },
      () => {
        if (!(this.selected instanceof Person)) return;
        this.release(this.selected);
        this.sim.presence.send(this.selected, 'errand', this.sim.nav);
      },
      () => this.selected instanceof Person && this.toggleSteer(this.selected),
      () => this.toggleFollow(),
    );

    this.seats = new Seats(
      this.sim.office.desks.length,
      team.map((m) => ({ id: m.id, name: m.name })),
      (id, number) => this.assignSeat(id, number),
    );

    this.settings = new Settings({
      onChange: (state) => {
        model.rowLabels.visible = state.tables;
        model.roomLabels.visible = state.rooms;
        this.seats.setLabelsVisible(state.seats);
        this.sim.weather.mode = state.xmas ? 'sun' : state.weather; // it snows instead of raining
        this.xmas.set(state.xmas);
      },
      onView: (mode) => this.views.setMode(mode),
      onNames: (on) => this.overlay.setNames(on),
    });
    this.settings.setView(this.views.mode);
    this.peoplePanel = new People();

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.65, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim() }),
    );
    this.ring.visible = false;
    this.scene.add(this.ring);
    // thinner and see-through: who a click would select
    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(0.52, 0.6, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: (this.ring.material as THREE.MeshBasicMaterial).color, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.hoverRing.visible = false;
    this.scene.add(this.hoverRing);

    exposeDevConsole(this.sim.events);
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') {
      this.debug = new DebugOverlays(this.scene);
      registerDevSection(overlaySection(this.debug));
      // console: dev.overlay('grid' | 'states' | 'paths', true)
      window.dev.overlay = (kind, on = true) => this.debug?.set(kind, on);
      registerDevSection(
        castSection({
          list: () => [...this.sim.people.map((p) => ({ id: p.id, name: first(p), kind: 'person' as const })), ...this.sim.pets.map((d) => ({ id: d.id, name: d.name, kind: 'pet' as const }))],
          removed: () => this.sim.removedIds,
          set: (id, removed) => this.setRemoved(id, removed),
        }),
      );
      // console: dev.remove('jan-hasler'), dev.restore('jan-hasler'), dev.removed()
      window.dev.remove = (id) => this.setRemoved(id, true);
      window.dev.restore = (id) => this.setRemoved(id, false);
      window.dev.removed = () => this.sim.removedIds;
    }
    this.registerViewEvents();
    new DevPanel(this.sim.events);
    this.now = new NowChip(
      () => this.toggleActionFollow(),
      () => this.endAction(true),
    );
    this.sheet = new ActionSheet(this.sim.events, {
      onPick: (pick) => this.runAction(pick),
      onToggle: (open) => open && this.settings.setOpen(false),
    });
    Walker.animate = true; // from now on arrivals and departures get a show
    this.bind();
    this.resize();
    // back to where the last visit ended (a deep link in the URL wins over the saved camera)
    if (!location.hash && saved.view) this.views.restore(saved.view, true);
    if (saved.selected) {
      const p = this.sim.people.find((o) => o.id === saved.selected);
      if (p && p.inOffice) this.selected = this.followed = p;
    }
    window.addEventListener('pagehide', () => this.saveSession());
    this.overlay.setMeta(`${this.sim.people.length} Personen, ${this.sim.walkers.length - this.sim.people.length} Tiere`);
    this.overlay.initLabels(this.sim.people.map((p) => ({ id: p.id, name: p.member.name })));
    this.seats.setOwners(this.seatOwners());

    this.drawer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  /** roof on/off, with the pendant cords that go with it */
  private setRoof(visible: boolean): void {
    this.roof.visible = visible;
    this.roofCords(visible);
  }

  private restoreSeats(): void {
    let local: Record<string, number> | null = null;
    try {
      const raw = storage.getItem(SEATS_KEY);
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
    if (savedStateIgnored) return; // ?seed: the assignment lasts for the session
    try {
      const res = await fetch('/__save-seats', { method: 'POST', body: JSON.stringify(out) });
      if (!res.ok) throw new Error(String(res.status));
      storage.removeItem(SEATS_KEY);
    } catch {
      /* no dev server: localStorage stays */
    }
  }

  /** Called by the seat panel: persists the assignment and applies it to the person (they move over when they next sit down). */
  private assignSeat(id: string, number: number | null): void {
    const p = this.sim.people.find((o) => o.id === id);
    if (!p) return;
    this.sim.office.assign(p, number);
    const out: Record<string, number> = {};
    for (const q of this.sim.people) if (q.homeDesk) out[q.id] = q.homeDesk.number;
    try {
      storage.setItem(SEATS_KEY, JSON.stringify(out));
    } catch {
      /* ignore */
    }
    void this.writeSeats(out);
    this.seats.setOwners(this.seatOwners());
  }

  private bind(): void {
    window.addEventListener('resize', () => this.resize());
    // capture phase + stopImmediatePropagation: grabbing a person must not start a camera pan
    this.stage.addEventListener(
      'pointerdown',
      (e) => {
        this.pressed = null;
        this.dragMoved = false;
        if (this.views.mode === 'walk' || this.views.mode === 'third') return; // dragging looks around instead
        if (this.editor.active) {
          // furniture instead of people; a click on anything else still moves the camera
          const g = this.groundAt(this.toNdc(e));
          if (!this.editor.pointerDown(this.raycaster, g)) return;
          e.stopImmediatePropagation();
          this.stage.setPointerCapture(e.pointerId);
          return;
        }
        // only the hit volume: a press just beside somebody still moves the camera (its click still picks them)
        const hit = this.pick(this.toNdc(e), false);
        if (!hit) return;
        const g = this.groundAt(this.toNdc(e));
        if (!g) return;
        e.stopImmediatePropagation();
        // nothing happens yet: a press is a click until it moves (pointermove lifts them)
        this.pressed = hit;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.stage.setPointerCapture(e.pointerId);
      },
      true,
    );
    this.stage.addEventListener('pointermove', (e) => {
      this.pointerInside = true;
      this.toNdc(e, this.pointer);
      if (this.editor.active && this.views.mode !== 'walk' && this.views.mode !== 'third') this.editor.pointerMove(this.raycaster, this.groundAt(this.pointer), e.altKey);
      // the press is over once the stage lets go of the pointer (a press that started on a panel is not ours)
      if (!this.pressed || !this.stage.hasPointerCapture(e.pointerId)) return;
      // a few pixels of hand jitter still count as a click, not a drag
      if (!this.dragMoved && Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) <= CLICK_SLOP) return;
      this.dragMoved = true; // from here on no click, even if nobody gets lifted
      if (!this.dragged) {
        if (this.pressed.away) return; // went out of the door during the press
        // they may have walked on since the press: grab them where they are now, relative to the pressed point
        const start = this.groundAt(this.toNdc({ clientX: this.dragStart.x, clientY: this.dragStart.y }));
        if (!start) return;
        this.dragged = this.pressed;
        this.dragged.pickUp();
        // carrying somebody selects them; the camera keeps following only if it already followed this one
        if (this.followed !== this.dragged) this.followed = null;
        this.selected = this.dragged;
        this.dragOffset.set(this.dragged.pos.x - start.x, this.dragged.pos.z - start.z);
      }
      const g = this.groundAt(this.pointer);
      if (!g) return;
      const w = this.dragged;
      w.pos.x = THREE.MathUtils.clamp(g.x + this.dragOffset.x, 0.4, WORLD.width - 0.4);
      w.pos.z = THREE.MathUtils.clamp(g.z + this.dragOffset.y, 0.4, WORLD.depth - 0.4);
      // near a free chair: snap onto it (the person sits while carried)
      if (w instanceof Person) {
        w.snapDesk = this.sim.office.desks.find((k) => w.canSit(k, true) && Math.min(Math.hypot(k.seat.x - w.pos.x, k.seat.z - w.pos.z), Math.hypot(k.approach.x - w.pos.x, k.approach.z - w.pos.z)) < 1) ?? null;
        if (w.snapDesk) {
          w.pos.x = w.snapDesk.seat.x;
          w.pos.z = w.snapDesk.seat.z;
        }
        w.snapMeetSeat = null;
        if (!w.snapDesk) {
          let best = 1;
          for (const k of [...this.sim.meetingRoom.seats, ...(this.sim.phoneBooth.seat && !this.sim.phoneBooth.current ? [this.sim.phoneBooth.seat] : [])]) {
            if (!w.canSitMeet(k, k !== this.sim.phoneBooth.seat)) continue;
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
        if (chair?.occupant && chair.occupant !== d && chair !== this.sim.phoneBooth.seat) chair.occupant.evictFromMeeting(chair);
        if (chair && (chair === this.sim.phoneBooth.seat ? this.sim.phoneBooth.sitIn(d) : d.sitDownAtMeeting(chair))) {
          this.dragged = null;
          if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
          return;
        }
      }
      // let go inside a wall / desk: settle on the nearest free floor
      const c = this.sim.nav.toCell(d.pos);
      if (!this.sim.nav.walkable(c.cx, c.cz)) {
        const free = this.sim.nav.nearestWalkable(d.pos, 10);
        if (free) {
          d.pos.x = free.x;
          d.pos.z = free.z;
          d.prev.x = free.x;
          d.prev.z = free.z;
        }
      }
      this.dragged.timer = 0.8 + random();
      const landed = this.dragged;
      this.dragged = null;
      if (this.stage.hasPointerCapture(e.pointerId)) this.stage.releasePointerCapture(e.pointerId);
      // let go in the meeting room next to somebody else: they start chatting
      if (landed instanceof Person && this.sim.meetingRoom.contains(landed.pos)) {
        const group = this.sim.people.filter((p) => (p === landed || this.sim.meetingRoom.contains(p.pos)) && p.inOffice && !p.held && !p.controlled && !p.talk && !p.inMeeting && !p.playerChat && !p.printJob && !p.foosJob).slice(0, 6);
        if (group.includes(landed) && group.length >= 2) {
          group.forEach((p) => p.interrupt());
          this.sim.social.start(group, { x: landed.pos.x, z: landed.pos.z }, this.sim.nav);
        }
      }
    };
    this.stage.addEventListener('pointerup', drop);
    this.stage.addEventListener('pointercancel', drop);
    this.stage.addEventListener('lostpointercapture', drop); // moves no longer reach the stage: put them down
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
      // a press on a person never reaches the camera, so only its own movement tells a drag
      if (this.dragMoved || (!this.pressed && this.views.wasDrag)) return;
      // pick at the click itself: the hover state may be a frame behind (or empty on touch)
      if (this.views.mode === 'walk') return this.interact();
      if (this.views.mode === 'third') return;
      const hit = this.pick(this.toNdc(e));
      if (hit) {
        this.easter.click(hit);
        this.handBack(); // selecting by hand: the selection's follow takes over
        if (hit === this.selected) return; // clicking them again keeps them, and follow as it is
      }
      this.selected = hit; // the floor, Esc or somebody else ends a selection
      this.followed = this.selected && !this.selected.away ? this.selected : null; // selecting starts follow mode right away
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const konami = this.easter.key(e);
      if (this.day && e.code === 'Space') e.preventDefault(); // held to play in the day tasks, must not scroll or press a button
      if (e.key === 'Escape' && this.action) {
        // Esc ends the action first: follow off, camera back to the overview (the next Esc deselects as before)
        this.endAction(true);
        return;
      }
      if (this.hudKeys && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === ',') {
          this.sheet.close();
          this.settings.setOpen(!this.settings.isOpen);
          return;
        }
        // A steers left while a person is steered, and ends the Konami code
        if (e.key.toLowerCase() === 'a' && !this.steered && !konami && !this.editor.active) {
          this.sheet.toggle();
          return;
        }
      }
      if (this.action?.owned && !this.steered && STEER_KEYS.includes(e.code)) this.handBack(); // WASD: the player takes the camera
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
      if (e.key.toLowerCase() === 'r' && (this.views.mode === 'iso' || this.views.mode === 'orbit')) this.setRoof((this.roofWanted = !this.roofWanted));
      if (e.key.toLowerCase() === 'h' && this.selected instanceof Person) this.sim.presence.toggleHome(this.selected, this.sim.nav);
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
      this.focused = false;
    });
    window.addEventListener('focus', () => {
      this.focused = true;
      this.pacer.wake(performance.now());
    });
    // any input brings the full frame rate back at once (the pacer drops it while nothing moves);
    // every mouse event carries the modifier state too: Shift is still noticed when its key event got lost (focus change, pointer lock)
    for (const type of ['pointerdown', 'pointermove', 'mousemove', 'wheel', 'keydown', 'keyup', 'touchstart'] as const) {
      window.addEventListener(
        type,
        (e) => {
          this.pacer.wake(e.timeStamp);
          this.focused = document.hasFocus(); // input without a focus event (the page loaded in the background, then got hovered)
          if (e instanceof MouseEvent) this.shift = e.shiftKey;
        },
        { passive: true, capture: true },
      );
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.drawer.renderer.setSize(w, h);
    this.views.resize(w, h);
    this.pacer.redraw(); // the canvas was cleared: draw it again at once, also while idle
  }

  /** held while a full-screen card (welcome) is up: no game time passes, the scene still renders */
  paused = false;

  private frame(now: number): void {
    const scale = this.timeScale();
    if (this.paced && !this.pacer.due(now, this.frameState())) {
      if (scale === 0) this.heldAt = now;
      return;
    }
    this.frames++;
    const dt = this.time.since(now);
    // only the time since the game was let go runs at its speed, not the skipped refreshes while it was held (Enter on the welcome card at 25x)
    const game = Math.min(dt, Math.max(0, now - this.heldAt) / 1000);
    this.heldAt = -Infinity;
    // pause stops the whole game; 10x / 25x run the whole office faster
    this.step(dt, dt > 0 ? (scale * game) / dt : scale);
    this.render(this.acc / STEP);
    this.renderFeeds();
  }

  /** What the pacer decides on: whether anything on screen can change, and whether the window is in front. */
  private frameState(): FrameState {
    const s = this.paceState; // one object, filled in on every refresh
    s.timeScale = this.timeScale();
    s.viewMoved = this.viewMoved;
    s.keysHeld = this.keys.size > 0;
    s.focused = this.focused;
    return s;
  }

  /** Game seconds per real second the player picked: 0 while paused (or while the welcome card holds the game), else 1x / 10x / 25x. */
  private timeScale(): number {
    return this.paused ? 0 : this.sim.tod.scale;
  }

  /**
   * Test hook: runs the game `seconds` ahead in fixed steps without drawing. The e2e tests wait in game time with
   * it, so a wait takes the same number of steps however slow the machine renders.
   */
  advance(seconds: number): void {
    for (let i = Math.round(seconds / STEP); i > 0; i--) this.step(STEP); // ignores pause and speed: a test waits in game seconds
  }

  /** Calls `fn` with every stretch of game time that passes, until the returned function is called. */
  onStep(fn: (dt: number) => void): () => void {
    this.steppers.add(fn);
    return () => this.steppers.delete(fn);
  }

  /**
   * What the e2e tests may read and call: `window.__game` under `?test` (`TestHook`). Everything a spec looks at goes
   * through here, so renaming a field of the game fails the type check of the spec that reads it. A spec changes the
   * game only through the methods (and through the page, like a player).
   */
  hook() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the getters below have their own `this`
    const g = this;
    return {
      /** Runs the game `seconds` ahead in fixed steps: how a test lets time pass. */
      advance: (seconds: number) => g.advance(seconds),
      /** One frame of `dt` real seconds as the loop takes it, at the speed the clock in the HUD is set to. */
      frame: (dt: number) => g.step(dt, g.timeScale()),
      /** the office and everybody in it: people, pets, places, presence, time of day, scenario, dev events */
      get sim() {
        return g.sim;
      },
      get views() {
        return g.views;
      },
      get scene() {
        return g.scene;
      },
      get renderer() {
        return g.drawer.renderer;
      },
      get xmas() {
        return g.xmas;
      },
      get easter() {
        return g.easter;
      },
      get bubbles() {
        return g.bubbles;
      },
      get meetingLight() {
        return g.meetingLight;
      },
      /** the drawn home office rooms, by room number (null: not built yet) */
      get homes() {
        return g.homes;
      },
      /** desks whose monitor shows Kurt */
      get kurtScreens() {
        return g.kurtScreens;
      },
      /** game seconds so far */
      get clock() {
        return g.clock;
      },
      /** frames run so far */
      get frames() {
        return g.frames;
      },
      /** frame pacing (#212): the rate the loop would draw at now, whether the window has focus, when input last woke it (ms) */
      get pace() {
        return { fps: g.pacer.rate(performance.now(), g.frameState()), focused: g.focused, woke: g.pacer.woke };
      },
      /** whether the office reaches the screen (not under `?test` without `&draw`) */
      get draws() {
        return g.drawer.draws;
      },
      get paused() {
        return g.paused;
      },
      /** game seconds per real second right now: 0 paused, else 1, 10 or 25 */
      get timeScale() {
        return g.timeScale();
      },
      get selected() {
        return g.selected;
      },
      /** the room editor (open, dragging, what a drag would cut off) */
      get editor() {
        return g.editor;
      },
      /** the running Aktionen card, if any */
      get action() {
        return g.action;
      },
      /** the running day (the playable story), if any */
      get day() {
        return g.day;
      },
      get roofVisible() {
        return g.roof.visible;
      },
      /** what the R key last asked for (the plan view hides the roof whatever it says) */
      get roofWanted() {
        return g.roofWanted;
      },
      get namesVisible() {
        return g.overlay.namesVisible;
      },
      /** the debug overlays (dev and e2e builds) */
      get debug() {
        return g.debug!; // there in every build that has this hook
      },
    };
  }

  /**
   * Everything a frame does except drawing it. `dt` is real time (camera, panels), `speed` how many game seconds pass
   * per real second: the world runs in chunks of at most one slow frame, so 25x behaves like 25 ordinary frames.
   */
  private step(dt: number, speed = 1): void {
    const game = dt * speed;
    const chunks = Math.max(1, Math.ceil(game / MAX_FRAME));
    for (let i = 0; i < chunks; i++) this.stepWorld(game / chunks);
    this.stepView(dt);
  }

  /** The part of a step that is game time: stands still while paused, runs faster at 10x / 25x. */
  private stepWorld(dt: number): void {
    this.acc += dt;
    this.clock += dt;
    this.updateDay(dt);
    this.updateSteer(dt);
    this.updateAction(dt);
    this.sim.presence.applyJump(); // a jump made while paused: nothing steps then
    while (this.acc >= STEP) {
      this.sim.step(STEP);
      setTvMode(this.sim.meetingRoom.tv);
      this.acc -= STEP;
    }
    this.sim.tod.update(dt);
    applySky(this.sim.tod, this.sky);
    this.updateEaster(dt);
    this.updateSpawnFx(dt);
    this.updateWeather(dt);
    this.updateArrivals();
    this.deskLights.update(dt);
    this.updateAlterEgos(dt);
    this.meetingLight.update(dt);
    this.sim.coatRacks.update(); // also while time stands still: a presence change made then (clock jump, dev panel) shows at once
    this.sim.office.updateScreens(dt);
    this.updateHomes(dt);
    this.updateDoor(dt);
    if (dt > 0) for (const tick of this.steppers) tick(dt); // not on a frame while time stands still
  }

  /** The part of a step that follows real time: camera, panels, the persist timer. Works while paused. */
  private stepView(dt: number): void {
    this.updateFollow(dt);
    this.timeControl.sync();
    this.views.update(dt);
    this.updateAim();
    if (this.reply && (this.reply.t -= dt) <= 0) this.reply = null;
    if ((this.persistTimer -= dt) <= 0) {
      this.persistTimer = 2;
      this.saveSession();
    }
  }

  /** Materialise show for everybody who arrives or leaves. */
  private updateSpawnFx(dt: number): void {
    for (const w of this.sim.walkers) {
      const e = w.takeFx();
      if (e) this.spawnFx.burst(w.pos.x, w.pos.z, e, w.headHeight * w.root.scale.y);
    }
    this.spawnFx.update(dt);
  }

  /** Kurt (#32): the poof when Marco turns into him or back, and Kurt on the monitor of Marco's empty desk. */
  private updateAlterEgos(dt: number): void {
    for (const p of this.sim.people) {
      if (!p.poof) continue;
      p.poof = false;
      if (!p.away) this.poofFx.burst(p.pos.x, 0.9, p.pos.z);
    }
    this.poofFx.update(dt);
    for (const p of this.sim.people) {
      if (!p.member.alterEgo) continue;
      const desk = p.homeDesk;
      const on = !!desk && kurtOnScreen({ hour: this.sim.tod.hour, presence: p.presence, awayKind: p.awayKind, deskUsed: !!desk.occupant });
      const shown = this.kurtScreens.get(p);
      if (shown && (!on || shown !== desk)) {
        // off, or his desk changed (seat editor): the old monitor goes back to normal
        this.kurtScreens.delete(p);
        if (!shown.occupant) shown.setScreen(false); // a new sitter has already switched on their own screen
      }
      if (on && desk && !this.kurtScreens.has(p)) {
        desk.showKurt(kurtWave(p.member.look));
        this.kurtScreens.set(p, desk);
      }
    }
  }

  /** Profile picture of a person as they look right now (Kurt's is rendered from the rig). */
  private portraitOf(p: Person, alter = p.asAlter): string | null {
    return alter ? kurtPortrait(p.member.look) ?? p.member.portrait : p.member.portrait;
  }

  /** Hidden gags: disco lights, a person who has had enough of the clicking. */
  private updateEaster(dt: number): void {
    const gone = this.easter.update(dt);
    this.easter.dim(this.sky);
    if (gone) {
      this.release(gone);
      this.sim.presence.send(gone, 'errand', this.sim.nav);
    }
  }

  /** Remembers time of day, weekday, camera and selection for the next visit. */
  private saveSession(): void {
    saveState({ cycle: this.sim.tod.cycle, weekday: this.sim.tod.weekday, view: this.views.snapshot(), selected: this.selected instanceof Person ? this.selected.id : undefined });
  }

  /** Showers: rain streaks and a greyer, darker light. */
  private updateWeather(dt: number): void {
    this.sim.weather.update(dt);
    const r = this.sim.weather.rain;
    this.rainFx.update(dt, r, 1 - this.sim.tod.day);
    this.puddleFx.update(dt, this.sim.weather.wet, r, this.sim.tod.day);
    this.xmas.update(dt, this.sim.tod.day, this.scene.background as THREE.Color, this.sky.sun);
    if (r > 0) {
      this.sky.sun.intensity *= 1 - 0.45 * r;
      this.sky.hemi.intensity *= 1 - 0.1 * r;
      (this.scene.background as THREE.Color).lerp(OVERCAST, 0.45 * r * this.sim.tod.day);
    }
  }

  /** Somebody coming through the front door makes the pets announce it. */
  private updateArrivals(): void {
    for (const p of this.sim.people) {
      if (p.presence === 'returning' && this.lastPresence.get(p) !== 'returning') this.sim.petCare.greet(this.sim.pets);
      this.lastPresence.set(p, p.presence);
    }
  }

  /** The dev events that need the view; the ones that only touch the simulation live with it (`simEvents.ts`). */
  private registerViewEvents(): void {
    const group = strings.presence.event.group;
    this.sim.events.register({
      id: 'remote-son',
      group,
      label: strings.presence.event.remoteSon,
      run: () => {
        const p = this.sim.presence.remoteWorker;
        if (!p?.member.son || !this.sim.presence.roomFor(p)) return null;
        // a remote day again: his plan sends him to the home office (a room is freed if need be), the son comes once he is there
        this.sim.presence.setVisit(p, false);
        this.release(p);
        this.sonCalls++;
        return strings.presence.event.sonComes(first(p));
      },
    });
    this.sim.events.register({
      id: 'home-laundry',
      group,
      label: 'Jemand im Homeoffice hängt Wäsche auf',
      run: () => {
        const home = this.homes.find((h) => h?.occupied && h.startLaundry());
        const who = this.sim.people.find((p) => p.id === home?.occupantId);
        return who ? `${first(who)} hängt Wäsche auf` : null;
      },
    });
    this.sim.events.register({
      id: 'rain',
      group: 'Wetter',
      label: 'Regen an / aus',
      run: () => {
        this.sim.weather.set(!this.sim.weather.raining);
        this.settings.setWeather(this.sim.weather.mode);
        return this.sim.weather.raining ? 'Es regnet' : 'Der Regen hört auf';
      },
    });
  }

  /**
   * Dev: takes a person or pet out of the sim (what they do ends cleanly, they vanish) or brings them back into it.
   * Returns a status text, or null for an unknown id. Not saved: a reload brings everybody back.
   */
  setRemoved(id: string, removed: boolean): string | null {
    const who = this.sim.walkers.find((w) => w.id === id);
    if (removed && who) {
      // what the player holds on to lets go first
      if (this.selected === who) this.selected = null;
      if (this.followed === who) this.followed = null;
      if (this.dragged === who) this.dragged = null;
      if (this.pressed === who) this.pressed = null;
      if (who instanceof Person) {
        if (this.day?.person === who) this.endDay(false);
        this.release(who);
        who.playerChat = null;
        who.petting = false;
        who.snackLeft = 0;
      }
    }
    return this.sim.setRemoved(id, removed);
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
      this.sim.people.filter((p) => !p.away && p.inOffice).map((p) => p.root),
      true,
    );
    if (hits.length && hits[0].distance < TALK_REACH) {
      let o: THREE.Object3D | null = hits[0].object;
      while (o && !o.userData.walker) o = o.parent;
      const p = o?.userData.walker;
      if (p instanceof Person) this.aim = { text: `E · mit ${p.member.name.split(' ')[0]} reden`, act: () => this.talkTo(p, eye) };
    }
    if (!this.aim) {
      const door = this.sim.doors.facing(eye.x, eye.z, eye.dx, eye.dz);
      if (door) this.aim = door.locked ? { text: 'Tür verschlossen (Meeting läuft)', act: () => {} } : { text: door.open ? 'E · Tür schliessen' : 'E · Tür öffnen', act: door.toggle };
    }
    this.overlay.setReticle(this.aim?.text ?? '');
  }

  private talkTo(p: Person, eye: { x: number; z: number }): void {
    const stopped = p.talkTo({ x: eye.x, z: eye.z }, 4);
    const lines = stopped ? ANSWERS : BUSY_ANSWERS;
    this.reply = { who: p, text: lines[Math.floor(random() * lines.length)], t: 3.5 };
  }

  /** Starts a day as this person: they come to the office if they are away, then the camera moves behind them. */
  startDay(id: string): void {
    const person = this.sim.people.find((p) => p.id === id);
    if (!person) return;
    this.endDay();
    this.editor.setActive(false);
    this.sheet.close();
    this.settings.setOpen(false);
    this.endAction(false);
    document.body.classList.add('is-day'); // gear and Aktionen make way for the day HUD
    this.selected = this.followed = null;
    const tasks = (DAY_STORIES[id] ?? []).map((make) => make());
    const needs = [...new Set(tasks.flatMap((t) => t.needs ?? []))].flatMap((nid) => this.sim.people.find((p) => p.id === nid) ?? []);
    this.day = { person, state: 'waiting', needs, walking: true, time: 0, prevMode: this.views.mode === 'third' ? 'orbit' : this.views.mode, tasks, current: 0, splits: [] };
    (document.activeElement as HTMLElement | null)?.blur?.(); // space must not press a button
    this.dayHud.show(person.member.name);
    this.dayHud.setClock(0);
    this.dayHud.setTasks([]);
    this.dayHud.setMeter(null);
    const absent = [person, ...needs].filter((p) => !p.inOffice);
    if (absent.length) {
      this.dayHud.setStatus(strings.presence.event.arriving(absent.map((p) => p.member.name.split(' ')[0])));
      absent.forEach((p) => this.sim.presence.callBack(p));
    }
  }

  /** Leaves the day: the person is free again and the camera goes back to the view it came from. */
  endDay(restoreView = true): void {
    const d = this.day;
    if (!d) return;
    this.day = null;
    document.body.classList.remove('is-day');
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
      nav: this.sim.nav,
      person,
      say: (text, who = person) => (this.reply = { who, text, t: 1.8 }),
      keys: this.keys,
      other: (id) => this.sim.people.find((p) => p.id === id) ?? null,
      seat: (p) => this.daySeat(p),
      pin: (p, spot) => {
        this.sim.drop(p);
        p.pinTo(spot);
      },
      release: (p) => p.unpin(),
    };
  }

  /** Sits the person at their own desk (somebody sitting there is asked to move) and pins them there. */
  private daySeat(p: Person): boolean {
    const desk = this.sim.seat(p);
    if (!desk) return false;
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
      best = Number(storage.getItem(key)) || Infinity;
      if (d.time < best) storage.setItem(key, String(d.time));
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

  /** Gear, Aktionen and their keys only exist outside the walk view, the day and the full-screen menus. */
  private get hudKeys(): boolean {
    return !this.day && this.views.mode !== 'walk' && this.views.mode !== 'third' && this.picker.hasAttribute('hidden') && this.dayMenu.hasAttribute('hidden');
  }

  /**
   * Starts an action by card id (`src/data/actions.ts`) or by dev event id (`?action=<id>`, tests). `quiet`: no
   * "nicht möglich" chip when it cannot run (the URL param retries).
   */
  startAction(id: string, quiet = false): 'started' | 'failed' | 'unknown' {
    const def = OFFICE_ACTIONS.find((a) => a.id === id) ?? null;
    const ev = this.sim.events.get(def?.eventId ?? id);
    if (!ev) return 'unknown';
    return this.runAction({ eventId: ev.id, label: def?.label ?? ev.label, action: def }, quiet);
  }

  /** Runs the event; when it ran, the camera flies in Orbit to the first person it moved (or to the place). */
  private runAction(pick: SheetPick, quiet = false): 'started' | 'failed' | 'unknown' {
    const ev = this.sim.events.get(pick.eventId);
    if (!ev) return 'unknown';
    const before = new Map(this.sim.people.map((p) => [p, leadState(p)]));
    const result = this.day ? null : ev.run();
    if (result === null) {
      // the camera stays where it is; a running action gets its chip back afterwards
      if (!quiet) this.now.fail(pick.label, () => this.action && this.now.show(this.action.caption, this.action.owned));
      return 'failed';
    }
    let lead: Person | null = null;
    let keys: number[] = [];
    for (const p of this.sim.people) {
      const was = before.get(p)!;
      const changed = leadState(p).flatMap((v, i) => (v !== was[i] && v !== null ? [i] : []));
      if (!changed.length) continue;
      lead = p;
      keys = changed;
      break;
    }
    this.endAction(false);
    if (this.views.mode !== 'orbit') this.views.setMode('orbit', true);
    this.followed = null; // the action directs the camera now
    const name = lead ? lead.member.name.split(' ')[0] : '';
    const text = pick.action?.caption ?? (typeof result === 'string' && result ? result : pick.label);
    const caption = name && !text.includes(name) ? `${text} · ${name}` : text;
    this.action = { def: pick.action, caption, lead, keys, owned: true, settled: false, age: 0, azimuth: this.views.orbitShot.azimuth };
    this.now.show(caption, true);
    this.aimCamera();
    return 'started';
  }

  /** The camera shot of an action's place: its angle and zoom. */
  private placeShot(def: OfficeAction): Shot {
    return { x: def.place.x, y: 0.6, z: def.place.z, azimuth: THREE.MathUtils.degToRad(def.angle), polar: ACTION_POLAR, dist: this.views.overviewShot().dist / def.zoom };
  }

  /** Close behind the lead person, from the side the camera looked from when the action started. */
  private leadShot(a: NonNullable<Game['action']>): Shot {
    const p = a.lead!.root.position;
    return { x: p.x, y: 0.8, z: p.z, azimuth: a.azimuth, polar: ACTION_POLAR, dist: this.views.overviewShot().dist / FOLLOW_ZOOM };
  }

  private arrived(a: NonNullable<Game['action']>): boolean {
    return !!a.def && !!a.lead && Math.hypot(a.lead.pos.x - a.def.place.x, a.lead.pos.z - a.def.place.z) < ARRIVE_RADIUS;
  }

  /** Points the camera for the running action: trail the walking lead (if "Kamera folgt bei Aktionen"), else the place. */
  private aimCamera(): void {
    const a = this.action;
    if (!a?.owned || this.views.mode !== 'orbit') return;
    if (a.lead && this.settings.followActions && !this.arrived(a)) {
      a.settled = false;
      this.views.flyTo(() => this.leadShot(a));
    } else if (a.def) {
      a.settled = true;
      this.views.flyTo(this.placeShot(a.def));
    } else if (a.lead) {
      this.views.flyTo(this.leadShot(a));
    }
  }

  /** Arrival on the place settles the camera; the end of the event (or the lead leaving) flies back to the overview. */
  private updateAction(dt: number): void {
    const a = this.action;
    if (!a) return;
    a.age += dt;
    const lead = a.lead;
    const busy = !!lead && !lead.away && leadState(lead).some((v, i) => a.keys.includes(i) && v !== null);
    if ((lead ? !busy : a.age > ACTION_NO_LEAD) || a.age > ACTION_MAX) return this.endAction(a.owned);
    if (a.owned && !a.settled && a.def && this.settings.followActions && this.arrived(a)) {
      a.settled = true;
      this.views.flyTo(this.placeShot(a.def));
    }
  }

  /** The player grabbed the camera (drag, wheel, WASD, a view change, a hand-picked person): the action lets go. */
  private handBack(): void {
    const a = this.action;
    if (!a?.owned) return;
    a.owned = false;
    this.views.stopFly();
    this.now.setFollow(false);
  }

  /** The chip's Folgen button. */
  private toggleActionFollow(): void {
    const a = this.action;
    if (!a) return;
    if (a.owned) return this.handBack();
    a.owned = true;
    this.followed = null;
    if (this.views.mode !== 'orbit') this.views.setMode('orbit', true);
    this.now.setFollow(true);
    this.aimCamera();
  }

  /** Ends the action's chip; `flyBack`: the camera returns to the overview. */
  private endAction(flyBack: boolean): void {
    const a = this.action;
    if (!a) return;
    this.action = null;
    this.now.hide();
    if (flyBack && this.views.mode === 'orbit') this.views.flyTo(this.views.overviewShot());
    else if (a.owned) this.views.stopFly();
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

  private render(alpha: number): void {
    for (const w of this.sim.walkers) if (!w.away || w.fx > 0) this.pose(w, alpha);
    this.drawer.frame(this.scene, this.views.camera, () => {
      this.updateHover();
      this.updateOverlay();
      if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') this.debug?.update(this.clock, this.sim.walkers, this.sim.nav, this.views.camera);
    });
    this.trackCamera();
  }

  /** Notes whether the camera moved since the last frame (another camera, a move or a zoom): the pacer keeps full rate while it does. */
  private trackCamera(): void {
    const c = this.views.camera;
    this.viewMoved = c !== this.lastCamera || !nearly(c.matrixWorld, this.lastView) || !nearly(c.projectionMatrix, this.lastProjection);
    this.lastCamera = c;
    this.lastView.copy(c.matrixWorld);
    this.lastProjection.copy(c.projectionMatrix);
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
    const dangle = Math.sin(this.clock / 0.25) * 0.14 * (w.lift / 0.45); // a slow sway of the hanging limbs, nothing like a walk cycle
    const swing = Math.sin(ph) * 0.42 * w.moving + dangle;
    const bob = 0; // hip height now follows the planted foot (see the leg block below)
    const breathe = Math.sin(this.clock / 0.6 + w.phase) * 0.008 * (1 - w.moving);

    if (w instanceof Person) {
      const r = w.rig;
      const sit = w.sit;
      // reset, the two halves, the pet pose between them and the hip hinge: `poseFrame` (petPose.ts) keeps each frame off the last one's pose
      poseFrame(w, r, this.clock, () => {
        // standing: walk cycle (knees bend while a leg swings forward); sitting: thighs flat, shins down
        r.legL.rotation.x = swing * (1 - sit) + SIT_POSE.leg * sit;
        r.legR.rotation.x = -swing * (1 - sit) + SIT_POSE.leg * sit;
        // knee bends while the leg swings forward through the middle of the step (foot lifts off), not at the extremes
        const cph = Math.cos(ph);
        const kneeSwing = 1.1 * w.moving;
        r.kneeL.rotation.x = Math.max(0, -cph) * kneeSwing * (1 - sit) + 0.06 * w.moving * (1 - sit) + SIT_POSE.knee * sit;
        r.kneeR.rotation.x = Math.max(0, cph) * kneeSwing * (1 - sit) + 0.06 * w.moving * (1 - sit) + SIT_POSE.knee * sit;
        // pelvis rides on the planted foot: lowest when the legs are spread, highest when they pass, so the feet touch the ground
        let hip = HIP_HEIGHT;
        if (sit < 0.01 && w.lift < 0.02 && w.moving > 0.01) {
          const depth = (a: number, k: number) => 0.4 * Math.cos(a) + 0.4 * Math.cos(a + k);
          // only part of the full drop: the legs are not perfectly stiff, and a full drop looks bouncy
          hip = HIP_HEIGHT + (Math.max(depth(r.legL.rotation.x, r.kneeL.rotation.x), depth(r.legR.rotation.x, r.kneeR.rotation.x)) - HIP_HEIGHT) * 0.5;
        }
        r.legL.position.y = r.legR.position.y = hip * (1 - sit) + (HIP_HEIGHT - SIT_DROP) * sit;
        r.armL.rotation.x = -swing * 0.8 * (1 - sit);
        r.armR.rotation.x = swing * 0.8 * (1 - sit);
        r.body.position.y = (hip - HIP_HEIGHT + bob + breathe) * (1 - sit) - SIT_DROP * sit;
        // gentle weight shift onto the planted leg
        r.body.rotation.z = Math.cos(ph) * 0.035 * w.moving * (1 - sit);
        r.body.position.x = Math.sin(ph) * 0.02 * w.moving * (1 - sit);
        if (w.working || w.editing) {
          // desk work (typing bursts, mouse, reading, leaning back): see DeskWork
          const dw = w.deskWork.pose;
          r.armL.rotation.x = dw.armL;
          r.armR.rotation.x = dw.armR;
          r.body.position.y += dw.bob;
          r.body.rotation.x += dw.lean;
        } else if (sit > 0.01) {
          r.armL.rotation.x += SIT_POSE.arm * sit;
          r.armR.rotation.x += SIT_POSE.arm * sit;
        }
        if (w.foosAmt > 0) {
          // foosball: both hands on the rods, quick sideways pushes and spins
          const t = this.clock + w.phase;
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
        if (!w.working && sit < 0.01) {
          // relaxed walking arms: elbows bend more as the hand swings forward
          r.elbowL.rotation.x = Math.min(0, r.armL.rotation.x) * 0.6 - 0.12 * w.moving;
          r.elbowR.rotation.x = Math.min(0, r.armR.rotation.x) * 0.6 - 0.12 * w.moving;
        }
        this.poseTired(w, r);
        if (r.vape) this.poseVape(w, r.vape, ph);
        if (r.phone) this.posePhone(w, r.phone);
        const talking = !!(w.talk || (w.playerChat && !w.petting && !w.nerfOn && !w.boomPose)) && w.moving < 0.2 && !(w.sit > 0.5 && !w.speaking);
        w.talkAmt += ((talking ? 1 : 0) - w.talkAmt) * 0.12;
        w.speakAmt += ((talking && w.speaking ? 1 : 0) - w.speakAmt) * 0.15;
        const ta = w.talkAmt;
        const sa = w.speakAmt;
        if (ta > 0.01) {
          const t = this.clock + w.phase;
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
      }, () => {
        this.poseNerf(w, r);
        this.poseBoombox(w, r);
        this.poseMail(w, r);
        this.poseCup(w, r);
        this.poseSnack(w, r);
        this.poseEmote(w, r);
        this.poseEaster(w, r);
        poseGameboy(r, w.gameboy, w.gameboyOnWc ? sit : 0, this.clock + w.phase);
        poseCamera(r, w.camera, w.flash, this.clock + w.phase);
        poseRepair(r, w.repair, w.repairHit, this.clock + w.phase);
        this.poseSmoke(w, r);
        this.poseUmbrella(w, r);
        if (r.tail) {
          // Kurt's tail sways from side to side with the steps, and rests still otherwise
          r.tail.rotation.y = Math.sin(ph) * 0.35 * w.moving;
          r.tail.rotation.x = -0.15 * sit;
        }
      });
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
      const now = this.clock;
      const bark = w.barkT > 0 ? Math.max(0, Math.sin(w.barkT * 14)) * Math.min(1, w.barkT) : 0;
      r.body.position.y += Math.abs(Math.sin(now * 9 + w.phase)) * 0.04 * w.happy + bark * 0.11;
      const z = w.sleep;
      // asleep: roll onto the side, slow deep breaths, tail still, small floating Zzz
      const th = 1.45 * z;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const h = 0.44; // torso centre height: the body rolls around it
      const bx = h * sn;
      const by = r.body.position.y + h * (1 - cs) - 0.03 * z + Math.sin(this.clock / 1.1 + w.phase) * 0.012 * z;
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
      r.tail.rotation.y = Math.sin(this.clock / 0.09 + w.phase) * (0.35 + 0.4 * w.moving + 0.5 * w.happy) * (1 - 0.7 * lie) * (1 - z);
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
    const t = this.clock;
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
    const tired = this.sim.tod.tired;
    let lids = tired;
    r.body.rotation.x = tired * 0.07 * (1 - w.sit * 0.5);
    r.body.position.y -= tired * 0.012 * (1 - w.sit);
    const idle = w.moving < 0.2 && w.phoneAmt < 0.05 && !w.vapeJob && !w.foosAmt && !((w.talk || w.playerChat) && w.speaking);
    if (tired > 0.35 && idle) {
      // one yawn every ~25 s, each person on their own beat
      const t = (this.clock + w.phase * 9) % 25;
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

  /** Nerf skirmish: aiming (right arm straight out with the gun, left hand supporting, a kick on every shot) or ducking (crouch, arms over the head). Eases in and out like the pet crouch. */
  private poseNerf(w: Person, r: Person['rig']): void {
    const on = w.nerfOn && w.moving < 0.2 && !w.held && w.sit < 0.05;
    const now = this.clock;
    const dt = Math.max(0, now - w.nerfClock); // game time since the last pose, however many steps that was
    w.nerfClock = now;
    w.nerfAmt = Math.min(1, Math.max(0, w.nerfAmt + (on ? 1 : -1) * (dt / 0.25)));
    w.nerfKick = Math.max(0, w.nerfKick - dt * 5);
    if (r.gun) r.gun.visible = w.nerfAmt > 0.02 && w.nerfKind === 'aim';
    if (w.nerfAmt <= 0) return;
    const a = smooth(w.nerfAmt);
    const lerp = THREE.MathUtils.lerp;
    if (w.nerfKind === 'aim') {
      const kick = w.nerfKick;
      r.armR.rotation.x = lerp(r.armR.rotation.x, -1.5 - 0.25 * kick, a);
      r.armR.rotation.z = lerp(r.armR.rotation.z, 0.04, a);
      r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, -0.08, a);
      r.armL.rotation.x = lerp(r.armL.rotation.x, -1.2, a);
      r.armL.rotation.z = lerp(r.armL.rotation.z, 0.25, a);
      r.elbowL.rotation.x = lerp(r.elbowL.rotation.x, -0.9, a);
      r.body.rotation.x += (-0.04 - 0.1 * kick) * a;
    } else if (w.nerfKind === 'shrug') {
      for (const [arm, elbow, side] of [[r.armL, r.elbowL, -1], [r.armR, r.elbowR, 1]] as const) {
        arm.rotation.x = lerp(arm.rotation.x, -0.5, a);
        arm.rotation.z = lerp(arm.rotation.z, side * 0.5, a);
        elbow.rotation.x = lerp(elbow.rotation.x, -1.3, a);
      }
      r.body.rotation.x += -0.03 * a;
    } else if (w.nerfKind === 'duck') {
      const p = petPose(a, 0.3, now + w.phase, w.root.scale.y);
      for (const [hip, knee, l] of [[r.legL, r.kneeL, p.legL], [r.legR, r.kneeR, p.legR]] as const) {
        hip.rotation.set(l.rx, l.ry, 0, LEG_ORDER);
        knee.rotation.x = l.knee;
      }
      r.legL.position.y = r.legR.position.y = HIP_HEIGHT - p.drop;
      r.body.position.y -= p.drop;
      r.body.rotation.x += 0.3 * a;
      for (const [arm, elbow, side] of [[r.armL, r.elbowL, -1], [r.armR, r.elbowR, 1]] as const) {
        arm.rotation.x = lerp(arm.rotation.x, -2.3, a);
        arm.rotation.z = lerp(arm.rotation.z, side * 0.3, a);
        elbow.rotation.x = lerp(elbow.rotation.x, -1.0, a);
      }
    }
  }

  /**
   * Boombox scene: on the shoulder (right arm up holding it, bobbing to the beat), scolding (left index finger wagging
   * at him, the boombox hanging from the right hand). Taken away, he is sad: head and shoulders hang and the arms dangle,
   * standing while she yells and walking off afterwards. Whoever stands near the music bobs along; she carries it with a
   * stiff right arm. Eases in and out like the Nerf poses.
   */
  private poseBoombox(w: Person, r: Person['rig']): void {
    const box = this.sim.boombox;
    const now = this.clock;
    const dt = Math.max(0, now - w.boomClock);
    w.boomClock = now;
    const on = !!w.boomPose && w.moving < 0.2 && !w.held && w.sit < 0.05;
    w.boomAmt = Math.min(1, Math.max(0, w.boomAmt + (on ? 1 : -1) * (dt / 0.25)));
    const sad = w.boomSad > 0 && !w.held && w.sit < 0.05;
    w.boomSadAmt = Math.min(1, Math.max(0, w.boomSadAmt + (sad ? 1 : -1) * (dt / 0.5)));
    const lerp = THREE.MathUtils.lerp;
    if (w.boomSadAmt > 0) {
      // slumped: leans forward and sinks (the head hangs), the arms hang straight down with a weak swing
      const s = smooth(w.boomSadAmt);
      const lean = 0.3;
      r.body.rotation.x += lean * s;
      r.body.position.y -= 0.05 * s;
      // the arms hang only when they are free (not holding a phone or a vape, not gesturing in a talk)
      const busy = w.phoneAmt > 0.05 || !!w.vapeJob || w.talkAmt > 0.1;
      for (const [arm, elbow, side] of busy ? [] : ([[r.armL, r.elbowL, -1], [r.armR, r.elbowR, 1]] as const)) {
        arm.rotation.x = lerp(arm.rotation.x, arm.rotation.x * 0.35 - lean, s);
        arm.rotation.z = lerp(arm.rotation.z, side * 0.04, s);
        elbow.rotation.x = lerp(elbow.rotation.x, -0.05, s);
      }
    }
    if (box.dancers.has(w)) {
      // two bobs a second, a little nod with each
      const b = Math.abs(Math.sin(box.beat * Math.PI * 2));
      r.body.position.y += b * 0.04;
      r.body.rotation.x += b * 0.08;
    }
    if (w.boomCarry && w.boomPose !== 'scold') {
      // the weight in the right hand: the arm hangs stiff, barely swinging
      r.armR.rotation.x *= 0.3;
      r.armR.rotation.z = 0.08;
      r.elbowR.rotation.x = -0.05;
    }
    if (w.boomAmt <= 0) return;
    const a = smooth(w.boomAmt);
    if (w.boomPose === 'play') {
      r.armR.rotation.x = lerp(r.armR.rotation.x, -0.2, a);
      r.armR.rotation.z = lerp(r.armR.rotation.z, 2.6, a);
      r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, -1.3, a);
    } else if (w.boomPose === 'scold') {
      const wag = Math.sin(now * 14) * 0.18;
      r.armL.rotation.x = lerp(r.armL.rotation.x, -1.9 + wag, a);
      r.armL.rotation.z = lerp(r.armL.rotation.z, -0.15, a);
      r.elbowL.rotation.x = lerp(r.elbowL.rotation.x, -0.5 - wag, a);
      r.armR.rotation.x = lerp(r.armR.rotation.x, 0, a);
      r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, -0.05, a);
      r.body.rotation.x += 0.12 * a;
      r.body.position.y += Math.abs(Math.sin(now * 7)) * 0.02 * a;
    }
  }

  /**
   * Carrying the post (see Mail.ts): a letter in the right hand (the arm bent forward), a parcel in both arms in front of
   * the chest. Eases in and out like the other poses; the mesh sits on the rig (see `Mail.take`).
   */
  private poseMail(w: Person, r: Person['rig']): void {
    const now = this.clock;
    const dt = Math.max(0, now - w.mailClock);
    w.mailClock = now;
    const on = !!w.mailCarry && !w.held && w.sit < 0.05;
    w.mailAmt = Math.min(1, Math.max(0, w.mailAmt + (on ? 1 : -1) * (dt / 0.3)));
    if (w.mailAmt <= 0) return;
    const a = smooth(w.mailAmt);
    const lerp = THREE.MathUtils.lerp;
    if (w.mailCarry === 'parcel') {
      // both forearms forward under the parcel
      for (const [arm, elbow, side] of [[r.armL, r.elbowL, -1], [r.armR, r.elbowR, 1]] as const) {
        arm.rotation.x = lerp(arm.rotation.x, -0.45, a);
        arm.rotation.z = lerp(arm.rotation.z, side * 0.02, a);
        elbow.rotation.x = lerp(elbow.rotation.x, -1.2, a);
      }
    } else {
      r.armR.rotation.x = lerp(r.armR.rotation.x, -0.5, a);
      r.armR.rotation.z = lerp(r.armR.rotation.z, 0.06, a);
      r.elbowR.rotation.x = lerp(r.elbowR.rotation.x, -1.3, a);
    }
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
      const t = this.clock;
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
    const t = this.clock + w.phase;
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
        r.setTired(Math.min(1, this.sim.tod.tired + Math.sin(w.emoteP * Math.PI) * 0.8 * a));
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
    posePuffs(v.puffs, w.puffT);
  }

  /**
   * Smoke break on the porch (#169): the cigarette in the right hand all along, a drag every 15–20 s (up to the lips,
   * the tip glows, a little lower, hold, exhale the puffs). The poses are solved per build (smokeProps.ts), so hand
   * and mouth meet for everybody.
   */
  private poseSmoke(w: Person, r: Person['rig']): void {
    const c = r.cigarette;
    if (!c) return;
    const lit = w.smokeLit && !w.away;
    c.stick.visible = lit;
    posePuffs(c.puffs, lit ? w.smokePuffT : -1, MOUTH.x);
    if (!lit) return;
    const p = smokeArmPose(smokePoses(r), w.smokeArm);
    const side = Math.sign(r.armR.position.x) || 1;
    r.armR.rotation.x = p.x;
    r.armR.rotation.z = p.z * side;
    r.elbowR.rotation.x = p.e;
    r.elbowR.rotation.z = p.ez * side;
    c.ember.color.setHex(w.smokeDraw ? 0xffb347 : 0xc0401a);
  }

  /** Outdoors in the rain the umbrella goes up in the left hand and opens; before the doorframe it folds shut and is gone (`Person.updateUmbrella`). */
  private poseUmbrella(w: Person, r: Person['rig']): void {
    const u = r.umbrella;
    if (!u) return;
    const a = w.away ? 0 : w.umbrellaAmt;
    u.root.visible = a > 0;
    if (!a) return;
    const p = smokePoses(r).umbrella;
    const lift = Math.min(1, a * 2); // the arm comes up first, then it opens
    const lerp = THREE.MathUtils.lerp;
    const side = Math.sign(r.armL.position.x) || -1;
    r.armL.rotation.x = lerp(r.armL.rotation.x, p.x, lift);
    r.armL.rotation.z = lerp(r.armL.rotation.z, p.z * side, lift);
    r.elbowL.rotation.x = lerp(r.elbowL.rotation.x, p.e, lift);
    r.elbowL.rotation.z = lerp(r.elbowL.rotation.z, p.ez * side, lift);
    // the shaft stays upright whatever the arm does
    u.root.quaternion.copy(r.armL.quaternion).multiply(r.elbowL.quaternion).invert();
    const open = Math.max(0, a * 2 - 1);
    u.canopy.scale.set(lerp(0.12, 1, open), lerp(1.6, 1, open), lerp(0.12, 1, open));
  }

  /**
   * Who is under the pointer: of the generous upright volumes around each body, the one nearest to the camera; with
   * `near`, else whoever is within `NEAR_PX` on screen. Thin arms, legs and a walking body are hard to hit otherwise.
   */
  private pick(ndc: THREE.Vector2, near = true): Walker | null {
    if (this.editor.active) return null; // the room editor owns the pointer
    this.raycaster.setFromCamera(ndc, this.views.camera);
    const here = this.sim.walkers.filter((w) => !w.away);
    const columns: Column[] = here.map((w) => {
      const p = w.root.position; // posed: lift and the interpolated step included
      return { x: p.x, z: p.z, r: w instanceof Person ? 0.4 : Math.max(0.3, w.headHeight * 0.6), y0: p.y, y1: p.y + w.headHeight + 0.15 };
    });
    const i = nearestHit(this.raycaster.ray, columns);
    if (i >= 0) return here[i];
    if (!near) return null;
    const pointer = { x: ((ndc.x + 1) / 2) * window.innerWidth, y: ((1 - ndc.y) / 2) * window.innerHeight };
    const side = new THREE.Vector3().setFromMatrixColumn(this.views.camera.matrixWorld, 0); // screen right, in the world
    const bodies = columns.map((c) => {
      const feet = this.projectPoint(c.x, c.y0, c.z);
      const head = this.projectPoint(c.x, c.y1, c.z);
      const edge = this.projectPoint(c.x + side.x * c.r, c.y0, c.z + side.z * c.r);
      if (feet === OFF_SCREEN || head === OFF_SCREEN || edge === OFF_SCREEN) return { feet: OFF_SCREEN, head: OFF_SCREEN, r: 0 }; // partly behind the camera: not by screen distance
      return { feet, head, r: Math.hypot(edge.x - feet.x, edge.y - feet.y) };
    });
    const j = nearestOnScreen(pointer, bodies, NEAR_PX);
    return j >= 0 ? here[j] : null;
  }

  private toNdc(e: { clientX: number; clientY: number }, out = new THREE.Vector2()): THREE.Vector2 {
    return out.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }

  /** Point on the floor plane (y = 0) under the pointer. */
  private groundAt(ndc: THREE.Vector2): THREE.Vector3 | null {
    this.raycaster.setFromCamera(ndc, this.views.camera);
    return this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
  }

  private updateHover(): void {
    this.hovered = this.dragged ?? (this.pointerInside && this.views.mode !== 'third' ? this.pick(this.pointer, this.views.mode !== 'walk') : null);
    // who a click would select: hand cursor and a ring on the floor (`updateOverlay`); not in walk mode, nor the editor (pick is null there)
    this.over = this.hovered && !this.dragged && this.views.mode !== 'walk' ? this.hovered : null;
    this.stage.classList.toggle('is-over-person', !!this.over);
    this.stage.classList.toggle('is-hovering', this.editor.hovering && !this.editor.dragging);
    this.stage.classList.toggle('is-holding', !!this.dragged || this.editor.dragging);
  }

  private projectPoint(x: number, y: number, z: number): { x: number; y: number } {
    const v = this.scratch.set(x, y, z).project(this.views.camera);
    if (v.z > 1 || v.z < -1) return OFF_SCREEN;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private seatOwners(): Map<number, string> {
    return new Map(this.sim.office.desks.filter((d) => d.owner).map((d) => [d.number, d.owner!.id]));
  }

  /** World point on top of the walker's head, following the posed body (sitting, leaning, hopping). */
  private headTop(w: Walker): THREE.Vector3 {
    w.root.updateMatrixWorld(true);
    if (w instanceof Dog) return w.rig.body.localToWorld(new THREE.Vector3(0, w.rig.face.y + w.rig.face.r, w.rig.face.z));
    // rig heights are in metres; the body's local units are unscaled
    const s = w.root.scale.y || 1;
    if (w instanceof Person) return w.rig.body.localToWorld(new THREE.Vector3(0, w.rig.headHeight / s, 0));
    return w.root.localToWorld(new THREE.Vector3(0, w.headHeight / s, 0));
  }

  private project(w: Walker, extra = 0.25): { x: number; y: number } {
    const v = new THREE.Vector3(w.root.position.x, w.headHeight + extra, w.root.position.z).project(this.views.camera);
    if (v.z > 1 || v.z < -1) return { x: -9999, y: -9999 }; // behind the camera
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }

  private updateOverlay(): void {
    const active = this.selected ?? this.hovered;
    const ringAt = (ring: THREE.Mesh, w: Walker | null) => {
      ring.visible = !!w;
      if (w) ring.position.set(w.root.position.x, 0.02, w.root.position.z);
    };
    ringAt(this.ring, this.selected);
    ringAt(this.hoverRing, this.over !== this.selected ? this.over : null);
    if (this.selected?.away) this.selected = null;
    this.actions.show(
      this.selected instanceof Person && this.selected.inOffice ? this.selected.displayName : null,
      this.sim.presence.homeFull,
      !!this.selected && this.selected === this.steered,
      !!this.selected && this.selected === this.followed,
    );
    if (active instanceof Person) {
      const pets = active.pets.filter((d) => d.comesToday).map((d) => d.name);
      const base = active.asAlter ? strings.alterEgo.role : active.member.role;
      const role = pets.length ? `${base} · ${strings.presence.pets.with(pets)}` : base;
      this.overlay.showTooltip(active.displayName, role, this.portraitOf(active), this.project(active));
    } else if (active instanceof Dog) {
      this.overlay.showTooltip(active.name, '',active.portrait, this.project(active));
    } else {
      this.overlay.hideTooltip();
    }
    const meet = this.sim.meetingRoom.current;
    const coffee = this.sim.kitchen.current;
    const rep = this.reply;
    const call = this.sim.welcome.call;
    const say = (id: string, text: string, who: Walker) => ({ id, text, head: this.headTop(who) });
    const bubbleDt = this.clock - this.bubbleClock;
    this.bubbleClock = this.clock;
    this.bubbles.update(
      [
        ...(this.easter.angry && !this.easter.angry.who.away ? [say(`angry-${this.easter.angry.who.id}`, this.easter.angry.text, this.easter.angry.who)] : []),
        ...(call && !call.who.away ? [say(`welcome-${call.who.id}`, call.text, call.who)] : []),
        ...this.sim.boombox.bubbles.map((b) => say(`boombox-${b.who.id}`, b.text, b.who)),
        ...this.sim.mail.bubbles.map((b) => say(`mail-${b.who.id}`, b.text, b.who)),
        ...(rep && !rep.who.away ? [say(`reply-${rep.who.id}`, rep.text, rep.who)] : []),
        ...this.sim.social.active.filter((c) => c.phase !== 'gather' && c.text).map((c) => say(c.speaker.id, c.text, c.speaker)),
        ...(coffee?.phase === 'chat' ? [say(coffee.speaker.id, coffee.text, coffee.speaker)] : []),
        ...(this.sim.meetingRoom.casual ? [say(this.sim.meetingRoom.casual.speaker.id, this.sim.meetingRoom.casual.text, this.sim.meetingRoom.casual.speaker)] : []),
        ...this.sim.pets
          .filter((d) => !d.away && (d.barkT > 0 || (d.petted && d.happy > 0.5)))
          .map((d) => say(`pet-${d.id}`, d.barkT > 0 ? (d.isCat ? 'Miau!' : 'Wuff!') : '♥', d)),
        ...(meet?.phase === 'session' ? [say(meet.speaker.id, meet.text, meet.speaker)] : []),
        ...(this.sim.serverRack.current?.text && !this.sim.serverRack.current.person.away ? [say(`rack-${this.sim.serverRack.current.person.id}`, this.sim.serverRack.current.text, this.sim.serverRack.current.person)] : []),
        ...(this.sim.smoke.chat ? [say(`porch-${this.sim.smoke.chat.speaker.id}`, this.sim.smoke.chat.text, this.sim.smoke.chat.speaker)] : []),
        ...this.sim.toilets.cabins.flatMap((c) => (c.session?.text && !c.session.person.away ? [say(`wc-${c.session.person.id}`, c.session.text, c.session.person)] : [])),
      ],
      this.views.camera,
      window.innerWidth,
      window.innerHeight,
      bubbleDt,
    );
    this.metaTimer -= 1 / 60;
    if (this.metaTimer <= 0) {
      this.metaTimer = 0.5;
      const talking = this.sim.social.chattingCount;
      const inMeeting = this.sim.meetingRoom.count;
      const working = this.sim.people.filter((p) => p.working).length;
      const absent = this.sim.presence.away;
      const home = absent.filter((p) => p.awayKind === 'home').length;
      const smoking = absent.filter((p) => p.onSmokeBreak).length;
      const inside = this.sim.people.filter((p) => p.presence === 'in').length;
      const pets = this.sim.walkers.filter((w) => w instanceof Dog && !w.away).length;
      const meta = [strings.presence.count.inOffice(inside)];
      if (this.sim.weather.rain > 0.3) meta.push('Regen');
      if (this.sim.presence.lunch) meta.push('Mittagspause');
      if (absent.length) {
        if (absent.length - home - smoking > 0) meta.push(strings.presence.count.errand(absent.length - home - smoking));
        if (home > 0) meta.push(strings.presence.count.home(home));
        if (smoking > 0) meta.push(strings.presence.count.smoke(smoking));
      }
      if (pets > 0) meta.push(`${pets} Tiere`);
      if (working) meta.push(`${working} arbeiten`);
      if (talking) meta.push(`${talking} im Gespräch`);
      if (inMeeting) meta.push(`${inMeeting} im Meeting`);
      this.overlay.setMeta(meta);
    }
    this.rosterTimer -= 1 / 60;
    if (this.rosterTimer <= 0) {
      this.rosterTimer = 0.25;
      this.peoplePanel.sync();
      this.roster.update(
        this.sim.presence.away
          .map((p) => ({
            id: p.id,
            name: p.displayName,
            portrait: this.portraitOf(p),
            kind: p.awayKind === 'home' || p.awayKind === 'smoke' ? p.awayKind : ('errand' as const),
            phase: p.presence === 'leaving' ? ('leave' as const) : p.presence === 'returning' ? ('return' as const) : ('out' as const),
            left: p.awayLeft,
          }))
          .sort((a, b) => Number(a.kind === 'home') - Number(b.kind === 'home') || a.left - b.left),
      );
    }
    this.seats.placeLabels(
      this.sim.office.desks.map((d) => ({ number: d.number, hidden: false, ...this.projectPoint(d.seat.x, 1.3, d.seat.z) })),
    );
    if (this.overlay.namesVisible) {
      this.overlay.placeLabels(this.sim.people.map((p) => ({ id: p.id, name: p.displayName, hidden: p.away, ...this.project(p, 0.1) })));
    }
  }

  /** Keeps the home office rooms and the feed tiles in line with who works from home right now. */
  private updateHomes(dt: number): void {
    const atHome = this.sim.people.filter((p) => p.presence === 'out' && p.awayKind === 'home');
    for (let v = 0; v < ROOM_COUNT; v++) {
      const who = atHome.find((p) => p.homeVariant === v) ?? null;
      const room = this.homes[v];
      if (!who && !room?.occupied) continue;
      const home = (this.homes[v] ??= new HomeOffice(v));
      if (who && (home.occupantId !== who.id || home.alter !== who.homeAlter)) home.setOccupant(who.member, false, who.homeAlter);
      else if (!who && home.occupied) home.setOccupant(null);
      if (who && this.sonCalls > 0 && home.callSon()) this.sonCalls--;
      if (who) {
        home.update(dt);
        this.feeds.setActivity(who.id, home.activityLabel);
      }
    }
    const entries = atHome.map((p) => ({ id: p.id, name: p.displayName, variant: p.homeVariant, room: HOME_LABELS[p.homeVariant] }));
    this.feeds.sync(entries);
  }

  /** Each wing of the front door swings open on its own while somebody is on the way through its lane (the interior doors: `Sim.step`). */
  private updateDoor(dt: number): void {
    for (const lane of DOOR_LANES) {
      const near = laneBusy(lane, this.sim.walkers);
      const k = lane.wing;
      this.doorOpen[k] += ((near ? 1 : 0) - this.doorOpen[k]) * Math.min(1, dt * 6);
      this.entrance[k].rotation.y = (k === 'left' ? -1 : 1) * this.doorOpen[k] * 1.7;
    }
  }

  /** Draws the home office scenes into the main canvas, behind the (transparent) feed tiles. */
  private renderFeeds(): void {
    const tiles = this.feeds.tiles();
    this.overlay.maskOut(tiles.map((t) => t.clip));
    if (!tiles.length) return;
    this.drawer.feeds((r) => {
      const h = window.innerHeight;
      r.setScissorTest(true);
      for (const t of tiles) {
        const home = this.homes[t.variant];
        if (!home?.occupied) continue;
        home.render(r, t.rect.left, h - t.rect.bottom, t.rect.width, t.rect.height, [t.clip.left, h - t.clip.bottom, t.clip.width, t.clip.height]);
      }
      r.setScissorTest(false);
      r.setViewport(0, 0, window.innerWidth, window.innerHeight);
    });
  }
}

/** What a spec gets as `g` in `read` / `until` (`e2e/game.ts`). */
export type TestHook = ReturnType<Game['hook']>;

declare global {
  interface Window {
    /** the test hook, set when a dev param is in the URL (`debugParams.ts`) */
    __game?: TestHook;
  }
}

/** Two matrices equal but for rounding: an orbit camera's damping eases on in ever smaller steps that nobody sees. */
function nearly(a: THREE.Matrix4, b: THREE.Matrix4): boolean {
  for (let i = 0; i < 16; i++) if (Math.abs(a.elements[i] - b.elements[i]) > 1e-5) return false;
  return true;
}
