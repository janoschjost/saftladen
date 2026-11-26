import * as THREE from 'three';
import { team } from '../data/team';
import { buildCharacter, type CharacterRig } from '../render/characterBuilder';
import { addKurt } from '../render/kurtBuilder';
import { KURT } from '../game/AlterEgo';
import { strings } from '../i18n/strings';
import { buildCat } from '../render/catBuilder';
import { buildDog } from '../render/dogBuilder';
import { HOME_COUNT, HOME_LABELS, HomeOffice } from '../render/homeOffice';
import { assignHomeRoom, hasOwnRoom, homeOwnerOf, homeRoomOf, reservedRooms } from '../data/homeAssignments';

const TURN_STEP = Math.PI / 4;
const AUTO_SPEED = 0.6; // rad/s
const START_YAW = Math.PI * 0.2;

/** Full-screen "choose character" menu: pick a person, spin them around on a turntable. */
export class CharacterPicker {
  private root = document.getElementById('picker') as HTMLElement;
  private canvasHost = document.getElementById('picker-stage') as HTMLElement;
  private list = document.getElementById('picker-list') as HTMLElement;
  private nameEl = document.getElementById('picker-name') as HTMLElement;
  private countEl = document.getElementById('picker-count') as HTMLElement;
  private roleEl = document.getElementById('picker-role') as HTMLElement;
  private homeStage = document.getElementById('picker-home-stage') as HTMLElement;
  private homeCaption = document.getElementById('picker-home-caption') as HTMLElement;
  private homeSelect = document.getElementById('picker-home') as HTMLSelectElement;
  private spinBtn = document.getElementById('picker-spin') as HTMLButtonElement;
  private alterBtn = document.getElementById('picker-alter') as HTMLButtonElement;
  /** the figure on the turntable (to swap in an alter ego) */
  private rig: CharacterRig | null = null;
  /** showing the selected person's alter ego (Kurt, #32) */
  private alter = false;
  private openBtn = document.getElementById('open-picker') as HTMLButtonElement;

  private renderer: THREE.WebGLRenderer | null = null;
  private homeRenderer: THREE.WebGLRenderer | null = null;
  private homes = new Map<number, HomeOffice>();
  private home: HomeOffice | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  private turntable = new THREE.Group();
  private figure: THREE.Group | null = null;
  private itemEls: HTMLButtonElement[] = [];
  private index = 0;
  private yaw = START_YAW;
  private pitch = 0.12;
  private zoom = 1;
  private autoSpin = false;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private lastTime = 0;
  private raf = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.buildScene();
    this.buildList();
    this.bind();
  }

  private buildScene(): void {
    this.scene.add(this.turntable);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.12, 48),
      new THREE.MeshLambertMaterial({ color: '#fff' }),
    );
    disc.position.y = -0.06;
    disc.receiveShadow = true;
    this.scene.add(disc);

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#c9b8a4', 1.4));
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(3, 6, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 1, far: 20 });
    this.scene.add(sun);
  }

  private buildList(): void {
    team.forEach((m, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'm-picker__item';
      btn.dataset.index = String(i);
      if (m.portrait) {
        const img = document.createElement('img');
        img.className = 'm-picker__thumb';
        img.src = import.meta.env.BASE_URL + m.portrait;
        img.alt = '';
        img.width = 40;
        img.height = 40;
        img.loading = 'lazy';
        btn.appendChild(img);
      } else {
        const ph = document.createElement('span');
        ph.className = 'm-picker__thumb';
        btn.appendChild(ph);
      }
      const label = document.createElement('span');
      label.textContent = m.name;
      btn.appendChild(label);
      btn.addEventListener('click', () => this.select(i));
      li.appendChild(btn);
      this.list.appendChild(li);
      this.itemEls.push(btn);
    });
  }

  private bind(): void {
    this.openBtn.addEventListener('click', () => this.open());
    document.getElementById('picker-close')!.addEventListener('click', () => this.close());
    document.getElementById('picker-prev')!.addEventListener('click', () => this.step(-1));
    document.getElementById('picker-next')!.addEventListener('click', () => this.step(1));
    document.getElementById('picker-left')!.addEventListener('click', () => this.turn(-TURN_STEP));
    document.getElementById('picker-right')!.addEventListener('click', () => this.turn(TURN_STEP));
    this.spinBtn.addEventListener('click', () => this.setAutoSpin(!this.autoSpin));
    this.alterBtn.addEventListener('click', () => this.setAlter(!this.alter));
    this.homeSelect.addEventListener('change', () => {
      assignHomeRoom(team[this.index].id, this.homeSelect.value === '' ? null : Number(this.homeSelect.value));
      this.updateHomeSelect();
      this.showHome();
    });

    const host = this.canvasHost;
    host.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      host.setPointerCapture(e.pointerId);
      host.classList.add('is-dragging');
      this.setAutoSpin(false);
    });
    host.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw += (e.clientX - this.lastX) * 0.012;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - this.lastY) * 0.005, -0.15, 0.7);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    const end = () => {
      this.dragging = false;
      host.classList.remove('is-dragging');
    };
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoom = THREE.MathUtils.clamp(this.zoom * Math.exp(e.deltaY * 0.001), 0.5, 1.6);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      switch (e.key) {
        case 'Escape': this.close(); break;
        case 'ArrowUp': this.step(-1); break;
        case 'ArrowDown': this.step(1); break;
        case 'ArrowLeft': this.turn(-TURN_STEP); break;
        case 'ArrowRight': this.turn(TURN_STEP); break;
        case ' ': this.setAutoSpin(!this.autoSpin); break;
        default: return;
      }
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }

  private setAutoSpin(on: boolean): void {
    this.autoSpin = on;
    this.spinBtn.setAttribute('aria-pressed', String(on));
  }

  private turn(delta: number): void {
    this.setAutoSpin(false);
    this.yaw += delta;
  }

  private step(dir: number): void {
    this.select((this.index + dir + team.length) % team.length);
  }

  private select(i: number): void {
    this.index = i;
    const m = team[i];
    if (this.figure) {
      this.turntable.remove(this.figure);
      this.figure.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    const rig = buildCharacter(m.look);
    if (m.alterEgo) addKurt(rig);
    this.rig = rig;
    this.alter = false;
    this.alterBtn.hidden = !m.alterEgo;
    this.alterBtn.setAttribute('aria-pressed', 'false');
    this.alterBtn.textContent = `Als ${KURT.name}`;
    rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
    const group = new THREE.Group();
    group.add(rig.root);
    // the owner's pets stand beside them on the turntable: dog first, then the cats
    const pets = [...(m.dog ? [buildDog(m.dog)] : []), ...(m.cats ?? []).map((c) => buildCat(c.kind))];
    const slots: Array<[number, number, number]> = [[0.62, 0.18, 0.5], [0.5, -0.38, -0.3], [0.3, 0.5, 0.9]];
    pets.forEach((pet, n) => {
      const [x, z, ry] = slots[n % slots.length];
      pet.root.position.set(x, 0, z);
      pet.root.rotation.y = ry;
      pet.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = true;
      });
      group.add(pet.root);
    });
    group.position.x = pets.length ? -0.28 : 0;
    this.figure = group;
    this.turntable.add(group);
    this.updateHomeSelect();
    this.showHome();
    this.nameEl.textContent = m.name;
    this.roleEl.textContent = m.role;
    this.countEl.textContent = `${i + 1} / ${team.length}`;
    this.itemEls.forEach((el, n) => {
      const on = n === i;
      el.classList.toggle('is-active', on);
      el.setAttribute('aria-current', String(on));
      if (on) el.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Turntable and home office preview show the selected person's alter ego (true) or the person (false). */
  private setAlter(on: boolean): void {
    const m = team[this.index];
    if (!m.alterEgo || !this.rig?.setAlter) return;
    this.alter = on;
    this.rig.setAlter(on);
    this.alterBtn.setAttribute('aria-pressed', String(on));
    this.alterBtn.textContent = on ? `Als ${m.name.split(' ')[0]}` : `Als ${KURT.name}`;
    this.nameEl.textContent = on ? KURT.name : m.name;
    this.roleEl.textContent = on ? strings.alterEgo.role : m.role;
    this.showHome();
  }

  /** Room shown for a person: their special / assigned room, else a stable pick among the rooms nobody else owns. */
  private roomFor(id: string): number {
    const own = homeRoomOf(id);
    if (own !== null) return own;
    const taken = reservedRooms(id);
    const free = Array.from({ length: HOME_COUNT }, (_, r) => r).filter((r) => !taken.has(r));
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return free.length ? free[h % free.length] : h % HOME_COUNT;
  }

  /** Puts the selected person into their home office scene in the side card. */
  private showHome(): void {
    const m = team[this.index];
    const room = this.roomFor(m.id);
    let home = this.homes.get(room);
    if (!home) {
      home = new HomeOffice(room);
      this.homes.set(room, home);
    }
    if (this.home && this.home !== home) this.home.setOccupant(null);
    this.home = home;
    home.setOccupant(m, true, this.alter);
    this.homeCaption.textContent = HOME_LABELS[room];
  }

  /** Home office room of the selected person: a regular room can be picked (one owner each), special people have their own fixed room. */
  private updateHomeSelect(): void {
    const m = team[this.index];
    const sel = this.homeSelect;
    if (hasOwnRoom(m.id)) {
      sel.replaceChildren(new Option(`${HOME_LABELS[homeRoomOf(m.id)!]} (eigener Raum)`, ''));
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.replaceChildren(new Option('Automatisch', ''));
    for (let r = 0; r < HOME_COUNT; r++) {
      const owner = homeOwnerOf(r);
      const ownerName = owner && owner !== m.id ? team.find((t) => t.id === owner)?.name.split(' ')[0] : null;
      sel.add(new Option(ownerName ? `${HOME_LABELS[r]} · ${ownerName}` : HOME_LABELS[r], String(r)));
    }
    sel.value = String(homeRoomOf(m.id) ?? '');
  }

  open(): void {
    if (!this.root.hidden) return;
    this.root.hidden = false;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.canvasHost.appendChild(this.renderer.domElement);
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvasHost);
      this.homeRenderer = new THREE.WebGLRenderer({ antialias: true });
      this.homeRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.homeRenderer.shadowMap.enabled = true;
      this.homeStage.appendChild(this.homeRenderer.domElement);
      this.resizeObserver.observe(this.homeStage);
    }
    this.yaw = START_YAW;
    this.zoom = 1;
    this.setAutoSpin(false);
    this.select(this.index);
    this.resize();
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  close(): void {
    this.root.hidden = true;
    cancelAnimationFrame(this.raf);
    this.openBtn.focus();
  }

  private resize(): void {
    if (!this.renderer) return;
    const w = this.canvasHost.clientWidth;
    const h = this.canvasHost.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    const hw = this.homeStage.clientWidth;
    const hh = this.homeStage.clientHeight;
    if (this.homeRenderer && hw && hh) {
      this.homeRenderer.setSize(hw, hh, false);
      this.homeRenderer.domElement.style.width = '100%';
      this.homeRenderer.domElement.style.height = '100%';
    }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(t: number): void {
    const dt = Math.min((t - this.lastTime) / 1000, 0.1);
    this.lastTime = t;
    if (this.autoSpin && !this.dragging) this.yaw += AUTO_SPEED * dt;
    this.turntable.rotation.y = this.yaw;

    const dist = 6 * this.zoom;
    this.camera.position.set(0, 1 + Math.sin(this.pitch) * dist, Math.cos(this.pitch) * dist);
    this.camera.lookAt(0, 0.8, 0);
    this.renderer!.render(this.scene, this.camera);
    if (this.home && this.homeRenderer && this.homeStage.clientWidth) {
      this.home.update(dt);
      this.home.render(this.homeRenderer, 0, 0, this.homeStage.clientWidth, this.homeStage.clientHeight);
    }
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
}
