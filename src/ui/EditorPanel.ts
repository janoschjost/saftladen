import type { RoomItem } from '../render/roomItem';
import { sidePanel } from './SidePanel';

export interface EditorPanelActions {
  toggle(): void;
  rotate(): void;
  resetItem(): void;
  remove(): void;
  restore(id: string): void;
  setSnap(on: boolean): void;
  /** absolute position of the selected item's centre, game metres */
  moveTo(x: number, z: number): void;
  exportJson(): string;
  /** returns a status message */
  importJson(text: string): string;
  resetAll(): void;
  /** writes the layout into the repo (dev server); resolves to a status message */
  saveToRepo(): Promise<string>;
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** Editor tab of the side panel (and the tool column in the plan view): data of the selected item, its actions, and the layout as JSON (export / import / reset). */
export class EditorPanel {
  private selection = el('editor-selection');
  private empty = el('editor-empty');
  private name = el('editor-name');
  private id = el('editor-id');
  private kind = el('editor-kind');
  private x = el<HTMLInputElement>('editor-x');
  private z = el<HTMLInputElement>('editor-z');
  private offset = el('editor-offset');
  private turn = el('editor-turn');
  private removeButton = el<HTMLButtonElement>('editor-remove');
  private removed = el('editor-removed');
  private removedList = el('editor-removed-list');
  private count = el('editor-count');
  private json = el<HTMLTextAreaElement>('editor-json');
  private statusEl = el('editor-status');
  private removedKey = '';
  private toolSelect = el<HTMLButtonElement>('tool-select');
  private toolRotate = el<HTMLButtonElement>('tool-rotate');
  private toolRemove = el<HTMLButtonElement>('tool-remove');
  private toolSnap = el<HTMLButtonElement>('tool-snap');
  private snap = el<HTMLInputElement>('editor-snap');

  constructor(private actions: EditorPanelActions) {
    this.toolSelect.addEventListener('click', () => actions.toggle());
    this.toolRotate.addEventListener('click', () => actions.rotate());
    this.toolRemove.addEventListener('click', () => actions.remove());
    this.toolSnap.addEventListener('click', () => {
      this.snap.checked = !this.snap.checked;
      this.snap.dispatchEvent(new Event('change'));
    });
    el('editor-rotate').addEventListener('click', () => actions.rotate());
    el('editor-reset-item').addEventListener('click', () => actions.resetItem());
    this.removeButton.addEventListener('click', () => actions.remove());
    this.snap.addEventListener('change', () => {
      actions.setSnap(this.snap.checked);
      this.toolSnap.setAttribute('aria-pressed', String(this.snap.checked));
    });
    for (const input of [this.x, this.z]) {
      input.addEventListener('change', () => {
        const x = Number(this.x.value);
        const z = Number(this.z.value);
        if (Number.isFinite(x) && Number.isFinite(z)) actions.moveTo(x, z);
      });
    }
    el('editor-save').addEventListener('click', () => {
      this.status('Speichere …');
      actions.saveToRepo().then((msg) => this.status(msg));
    });
    el('editor-export').addEventListener('click', () => {
      this.json.value = actions.exportJson();
      this.json.select();
      const done = (copied: boolean) => this.status(copied ? 'Layout exportiert und kopiert. Für alle fix machen: in src/data/layout.ts als DEFAULT_LAYOUT einfügen.' : 'Layout exportiert (unten). Für alle fix machen: in src/data/layout.ts als DEFAULT_LAYOUT einfügen.');
      if (navigator.clipboard) navigator.clipboard.writeText(this.json.value).then(() => done(true), () => done(false));
      else done(false);
    });
    el('editor-import').addEventListener('click', () => {
      if (!this.json.value.trim()) return this.status('Layout-JSON ins Feld einfügen, dann Import.');
      this.status(actions.importJson(this.json.value));
    });
    el('editor-reset-all').addEventListener('click', () => {
      if (!window.confirm('Alle Änderungen am Raum verwerfen?')) return;
      actions.resetAll();
      this.status('Raum zurückgesetzt.');
    });
  }

  setOpen(open: boolean): void {
    this.toolSelect.setAttribute('aria-pressed', String(open));
    const side = sidePanel();
    if (open) side.show('editor');
    else if (side.tab === 'editor') side.close();
    document.body.classList.toggle('is-editing-room', open);
  }

  status(text: string): void {
    this.statusEl.textContent = text;
  }

  /** `item`: the selection (or none); `changed`: how many items differ from the model; `removed`: the hidden ones. */
  show(item: RoomItem | null, changed: number, removed: RoomItem[]): void {
    this.selection.hidden = !item;
    this.empty.hidden = !!item;
    if (item) {
      this.name.textContent = item.label;
      this.id.textContent = item.id;
      this.kind.textContent = item.kind;
      if (document.activeElement !== this.x) this.x.value = item.x.toFixed(2);
      if (document.activeElement !== this.z) this.z.value = item.z.toFixed(2);
      this.offset.textContent = `${item.dx.toFixed(2)} / ${item.dz.toFixed(2)} m`;
      this.turn.textContent = `${item.rot * 90}°`;
      this.removeButton.disabled = !item.removable;
    }
    this.toolRotate.disabled = !item;
    this.toolRemove.disabled = !item || !item.removable;
    this.count.textContent = changed ? `· ${changed} geändert` : '';
    const key = removed.map((it) => it.id).join('|');
    if (key === this.removedKey) return;
    this.removedKey = key;
    this.removed.hidden = !removed.length;
    this.removedList.replaceChildren(
      ...removed.map((it) => {
        const li = document.createElement('li');
        li.className = 'm-editor__removed-row';
        const name = document.createElement('span');
        name.className = 'm-editor__removed-name';
        name.textContent = `${it.label} (${it.id})`;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'm-button';
        b.textContent = 'Zurück';
        b.addEventListener('click', () => this.actions.restore(it.id));
        li.append(name, b);
        return li;
      }),
    );
  }
}
