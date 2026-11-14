import * as THREE from 'three';
import { DEFAULT_LAYOUT, type ItemOverride, type Layout } from '../data/layout';
import type { RoomItem } from '../render/roomItem';
import { EditorPanel } from '../ui/EditorPanel';

const KEY = 'saftladen.layout';
/** Dragging snaps the offset to this grid (metres); Alt while dragging = free. */
const GRID = 0.25;
/** Arrow keys nudge by this much (Shift = one grid step). */
const FINE = 0.05;

const sameOverride = (a: ItemOverride, b: ItemOverride): boolean =>
  (a.dx ?? 0) === (b.dx ?? 0) && (a.dz ?? 0) === (b.dz ?? 0) && (a.rot ?? 0) === (b.rot ?? 0) && !!a.hidden === !!b.hidden;

/**
 * Room editor: click a piece of furniture to select it, drag it over the floor, turn it in quarter turns, remove it.
 * The layout (differences to the office model) lives in localStorage and can be exported / imported as JSON;
 * `DEFAULT_LAYOUT` (data/layout.ts) is the layout the app ships with.
 */
export class RoomEditor {
  active = false;
  private selected: RoomItem | null = null;
  private hovered: RoomItem | null = null;
  /** `before`: where the item stood, `was`: what was cut off then; `blocking`: what it cuts off on top where it is now (null: the spot is fine) */
  private drag: { item: RoomItem; before: ItemOverride; was: string[]; dx: number; dz: number; gx: number; gz: number; blocking: string | null } | null = null;
  /** the last pointerdown grabbed an item (the click that follows must not deselect it) */
  private grabbed = false;
  private snap = true;
  private selBox = new THREE.Box3();
  private hoverBox = new THREE.Box3();
  private selHelper: THREE.Box3Helper;
  private hoverHelper: THREE.Box3Helper;
  private selColor: THREE.Color;
  private blockedColor: THREE.Color;
  private panel: EditorPanel;

  constructor(
    scene: THREE.Scene,
    private items: RoomItem[],
    /** floor size in metres: items stay on it */
    private floor: { width: number; depth: number },
    /** furniture moved for good (drop, turn, remove, import, reset): rebuild the nav grid and everything that hangs on it */
    private onChange: () => void,
    /** what the furniture where it stands now cuts off (seats, places, doors); empty when nobody is cut off */
    private blocked: () => string[],
  ) {
    const css = getComputedStyle(document.documentElement);
    const color = (variable: string) => new THREE.Color(css.getPropertyValue(variable).trim());
    this.selColor = color('--color-live');
    this.blockedColor = color('--color-blocked');
    const helper = (box: THREE.Box3, variable: string) => {
      const h = new THREE.Box3Helper(box, color(variable));
      (h.material as THREE.LineBasicMaterial).depthTest = false;
      h.renderOrder = 1000;
      h.visible = false;
      scene.add(h);
      return h;
    };
    this.hoverHelper = helper(this.hoverBox, '--color-accent');
    this.selHelper = helper(this.selBox, '--color-live');

    this.panel = new EditorPanel({
      toggle: () => this.setActive(!this.active),
      rotate: () => this.rotate(),
      resetItem: () => this.resetItem(),
      remove: () => this.remove(),
      restore: (id) => this.restore(id),
      setSnap: (on) => (this.snap = on),
      moveTo: (x, z) => this.moveTo(x, z),
      exportJson: () => this.exportJson(),
      importJson: (text) => this.importJson(text),
      resetAll: () => this.resetAll(),
      saveToRepo: () => this.saveToRepo(),
    });

    // the saved layout applies before the game derives the nav grid and the seats from the items
    const layout = { ...DEFAULT_LAYOUT, ...this.stored() };
    for (const it of this.items) if (layout[it.id]) it.set(layout[it.id]);
    this.refresh();
  }

  /** An item is under the pointer (cursor feedback). */
  get hovering(): boolean {
    return this.active && !!this.hovered;
  }

  get dragging(): boolean {
    return !!this.drag;
  }

  /** The item the editor has selected, if any. */
  get selectedItem(): RoomItem | null {
    return this.selected;
  }

  /** While dragging: what the item cuts off where it is now (red outline), null when it may be dropped there. */
  get dragBlocked(): string | null {
    return this.drag?.blocking ?? null;
  }

  setActive(on: boolean): void {
    this.active = on;
    if (!on) {
      this.drop();
      this.selected = this.hovered = null;
    }
    this.panel.setOpen(on);
    this.refresh();
  }

  /** `raycaster` is set up for the pointer; `ground` is the floor point under it. True when an item was grabbed. */
  pointerDown(raycaster: THREE.Raycaster, ground: THREE.Vector3 | null): boolean {
    const item = this.pick(raycaster);
    this.grabbed = !!item;
    if (!item) return false;
    this.selected = item;
    if (ground) this.drag = { item, before: item.override ?? {}, was: this.blocked(), dx: item.dx, dz: item.dz, gx: ground.x, gz: ground.z, blocking: null };
    this.refresh();
    return true;
  }

  pointerMove(raycaster: THREE.Raycaster, ground: THREE.Vector3 | null, free: boolean): void {
    const d = this.drag;
    if (!d) {
      const hit = this.pick(raycaster);
      if (hit !== this.hovered) {
        this.hovered = hit;
        this.refresh();
      }
      return;
    }
    if (!ground) return;
    const step = this.snap && !free ? GRID : 0.01;
    const dx = d.dx + Math.round((ground.x - d.gx) / step) * step;
    const dz = d.dz + Math.round((ground.z - d.gz) / step) * step;
    if (this.place(d.item, dx, dz)) d.blocking = this.added(d.was);
    this.refresh();
  }

  pointerUp(): void {
    this.drop();
  }

  /** The click after a pointerdown: true when that pointerdown grabbed an item. */
  takeClick(): boolean {
    const g = this.grabbed;
    this.grabbed = false;
    return g;
  }

  deselect(): void {
    this.selected = null;
    this.refresh();
  }

  /** Keyboard shortcuts; true when the key was used (the game then ignores it). */
  key(e: KeyboardEvent): boolean {
    if (e.metaKey || e.ctrlKey) return false;
    if (e.code === 'KeyE') {
      this.setActive(!this.active);
      return true;
    }
    if (!this.active) return false;
    if (e.code === 'Escape') {
      if (!this.selected) this.setActive(false);
      else this.deselect();
      return true;
    }
    const it = this.selected;
    if (!it) return false;
    if (e.code === 'KeyR') {
      this.rotate();
      return true;
    }
    if (e.code === 'Delete' || e.code === 'Backspace') {
      this.remove();
      return true;
    }
    const dir: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const v = dir[e.code];
    if (!v) return false;
    e.preventDefault();
    const step = e.shiftKey ? GRID : FINE;
    this.change(it, () => this.place(it, it.dx + v[0] * step, it.dz + v[1] * step));
    return true;
  }

  private pick(raycaster: THREE.Raycaster): RoomItem | null {
    const hits = raycaster.intersectObjects(
      this.items.filter((it) => !it.hidden).map((it) => it.holder),
      true,
    );
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if (!o.visible) continue;
      while (o && !o.userData.roomItem) o = o.parent;
      if (o) return o.userData.roomItem as RoomItem;
    }
    return null;
  }

  /** Moves `it` to the offset, kept on the floor. False when nothing changed. */
  private place(it: RoomItem, dx: number, dz: number): boolean {
    dx = THREE.MathUtils.clamp(it.base.x + dx, 0, this.floor.width) - it.base.x;
    dz = THREE.MathUtils.clamp(it.base.z + dz, 0, this.floor.depth) - it.base.z;
    if (dx === it.dx && dz === it.dz) return false;
    it.set({ ...it.override, dx, dz });
    return true;
  }

  /** Dropped where it cuts something off: back to where the drag started. */
  private drop(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || sameOverride(d.item.override ?? {}, d.before)) return this.refresh(); // back where it was: nothing new is cut off
    this.keep(d.item, d.before, d.blocking);
  }

  /** Applies `edit` to `it` (false: nothing changed), see `keep`. */
  private change(it: RoomItem, edit: () => boolean | void): void {
    const before = it.override ?? {};
    const was = this.blocked();
    if (edit() !== false) this.keep(it, before, this.added(was));
  }

  /**
   * What the furniture cuts off now that `was` did not (the first of it), or null. Only what an edit adds counts: a
   * layout saved before the check existed may already cut something off, and that must not lock every other item.
   */
  private added(was: string[]): string | null {
    return this.blocked().find((b) => !was.includes(b)) ?? null;
  }

  /** `it` stays where it is now unless it cuts something off (`blocking`): then it goes back to `before` and the panel says why. */
  private keep(it: RoomItem, before: ItemOverride, blocking: string | null): void {
    if (!blocking) return this.commit();
    it.set(before);
    this.refresh();
    this.panel.status(`${it.label} würde ${blocking} versperren – bleibt, wo es war.`);
  }

  private rotate(): void {
    const it = this.selected;
    if (it) this.change(it, () => it.set({ ...it.override, rot: it.rot + 1 }));
  }

  private moveTo(x: number, z: number): void {
    const it = this.selected;
    if (it) this.change(it, () => this.place(it, x - it.base.x, z - it.base.z));
  }

  /** Back to where the shipped layout puts it. */
  private resetItem(): void {
    const it = this.selected;
    if (it) this.change(it, () => it.set(DEFAULT_LAYOUT[it.id]));
  }

  private remove(): void {
    const it = this.selected;
    if (!it) return;
    if (!it.removable) {
      this.panel.status(`${it.label} wird von der Simulation gebraucht und kann nicht entfernt werden.`);
      return;
    }
    it.set({ ...it.override, hidden: true });
    this.selected = null;
    this.commit();
  }

  private restore(id: string): void {
    const it = this.items.find((o) => o.id === id);
    if (!it) return;
    this.change(it, () => it.set({ ...it.override, hidden: false }));
    if (!it.hidden) this.selected = it;
    this.refresh();
  }

  private exportJson(): string {
    const out: Layout = {};
    for (const it of this.items) {
      const o = it.override;
      if (o) out[it.id] = o;
    }
    return JSON.stringify(out, null, 2);
  }

  /** Dev server only: writes the current layout to src/data/layout.json (the new shipped default). */
  private async saveToRepo(): Promise<string> {
    const out: Layout = {};
    for (const it of this.items) {
      const cur = it.override ?? {};
      if (!sameOverride(cur, {})) out[it.id] = cur;
    }
    try {
      const res = await fetch('/__save-layout', { method: 'POST', body: JSON.stringify(out) });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      return 'Speichern fehlgeschlagen – nur mit dem Dev-Server (npm run dev) möglich.';
    }
    try {
      localStorage.removeItem(KEY); // the file is the layout now
    } catch {
      /* ignore */
    }
    return 'In src/data/layout.json gespeichert. Jetzt committen.';
  }

  /** Replaces the whole layout; returns a status message. */
  private importJson(text: string): string {
    let layout: Layout;
    try {
      layout = JSON.parse(text);
    } catch {
      return 'Kein gültiges JSON.';
    }
    if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return 'Erwartet wird ein Objekt { id: { dx, dz, rot, hidden } }.';
    const known = new Set(this.items.map((it) => it.id));
    const unknown = Object.keys(layout).filter((id) => !known.has(id));
    const before = this.items.map((it) => it.override ?? {});
    for (const it of this.items) it.set(layout[it.id] && typeof layout[it.id] === 'object' ? layout[it.id] : {});
    const blocking = this.blocked()[0];
    if (blocking) {
      this.items.forEach((it, i) => it.set(before[i]));
      this.refresh();
      return `Nicht übernommen: das Layout würde ${blocking} versperren.`;
    }
    this.selected = null;
    this.commit();
    const n = Object.keys(layout).length - unknown.length;
    return unknown.length ? `${n} Objekte übernommen, ${unknown.length} unbekannte IDs ignoriert: ${unknown.slice(0, 3).join(', ')}` : `${n} Objekte übernommen.`;
  }

  /** Forgets the saved layout: everything goes back to the shipped one. */
  private resetAll(): void {
    for (const it of this.items) it.set(DEFAULT_LAYOUT[it.id]);
    this.selected = null;
    this.commit();
  }

  private stored(): Layout {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      return {}; // storage may be unavailable or corrupt
    }
  }

  /** Saves what differs from the shipped layout (an empty entry = "back at the model position"). */
  private save(): void {
    const out: Layout = {};
    for (const it of this.items) {
      const cur = it.override ?? {};
      if (!sameOverride(cur, DEFAULT_LAYOUT[it.id] ?? {})) out[it.id] = cur;
    }
    try {
      if (Object.keys(out).length) localStorage.setItem(KEY, JSON.stringify(out));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }

  private commit(): void {
    this.save();
    this.onChange();
    this.refresh();
  }

  /** Outlines and panel follow the selection. */
  private refresh(): void {
    const sel = this.active ? this.selected : null;
    const hov = this.active && !this.drag && this.hovered !== sel ? this.hovered : null;
    this.selHelper.visible = !!sel;
    if (sel) this.selBox.copy(sel.bounds()).expandByScalar(0.03);
    (this.selHelper.material as THREE.LineBasicMaterial).color.copy(this.dragBlocked ? this.blockedColor : this.selColor);
    this.hoverHelper.visible = !!hov;
    if (hov) this.hoverBox.copy(hov.bounds()).expandByScalar(0.03);
    this.panel.show(
      sel,
      this.items.filter((it) => it.changed).length,
      this.items.filter((it) => it.hidden),
    );
  }
}
