import { filterPalette } from './chromeRules';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface PaletteEntry {
  id: string;
  group: string;
  label: string;
  /** the key that does the same, shown as a keycap */
  key?: string;
  /** extra text on the right (a person's status) */
  detail?: string;
  run: () => void;
}

/** Cmd/Ctrl+K command palette: search over every action, dev event and person. A dialog with a focus trap that gives focus back on close. */
export class Palette {
  private root = $('palette');
  private input = $<HTMLInputElement>('palette-input');
  private list = $('palette-list');
  private empty = $('palette-empty');
  private opener: HTMLElement | null = null;
  private all: PaletteEntry[] = [];
  private shown: PaletteEntry[] = [];
  private index = 0;

  constructor(private provide: () => PaletteEntry[]) {
    $('palette-dim').addEventListener('click', () => this.close());
    for (const id of ['open-palette', 'dock-more']) $(id).addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.input.addEventListener('input', () => this.render(true));
    this.input.addEventListener('keydown', (e) => this.key(e));
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.isOpen) this.close();
        else this.open();
      }
    });
    // focus trap: Tab stays in the dialog (the input is its only stop; the list is driven by arrow keys)
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        this.input.focus();
      }
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.all = this.provide();
    this.input.value = '';
    this.root.hidden = false;
    this.render(true);
    this.input.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    const back = this.opener;
    this.opener = null;
    if (back && document.contains(back)) back.focus();
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!this.shown.length) return;
      this.index = (this.index + (e.key === 'ArrowDown' ? 1 : -1) + this.shown.length) % this.shown.length;
      this.mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.run(this.shown[this.index]);
    }
  }

  private run(entry?: PaletteEntry): void {
    if (!entry) return;
    this.close();
    entry.run();
  }

  private render(reset: boolean): void {
    const ranked = filterPalette(this.all, this.input.value);
    // group the ranked entries, groups in order of their best entry
    const order: string[] = [];
    for (const e of ranked) if (!order.includes(e.group)) order.push(e.group);
    this.shown = order.flatMap((g) => ranked.filter((e) => e.group === g));
    if (reset) this.index = 0;
    this.index = Math.min(this.index, Math.max(0, this.shown.length - 1));
    this.empty.hidden = this.shown.length > 0;
    const rows: HTMLElement[] = [];
    let group = '';
    this.shown.forEach((entry, i) => {
      if (entry.group !== group) {
        group = entry.group;
        const h = document.createElement('li');
        h.className = 'm-palette__group';
        h.setAttribute('role', 'presentation');
        h.textContent = group;
        rows.push(h);
      }
      const li = document.createElement('li');
      li.className = 'm-palette__item';
      li.id = `palette-item-${i}`;
      li.setAttribute('role', 'option');
      const label = document.createElement('span');
      label.className = 'm-palette__label';
      label.textContent = entry.label;
      li.appendChild(label);
      if (entry.detail) {
        const d = document.createElement('span');
        d.className = 'm-palette__detail';
        d.textContent = entry.detail;
        li.appendChild(d);
      }
      if (entry.key) {
        const k = document.createElement('kbd');
        k.className = 'm-keycap';
        k.textContent = entry.key;
        li.appendChild(k);
      }
      li.addEventListener('click', () => this.run(entry));
      li.addEventListener('pointermove', () => {
        if (this.index === i) return;
        this.index = i;
        this.mark();
      });
      rows.push(li);
    });
    this.list.replaceChildren(...rows);
    this.mark();
  }

  /** Highlights the current row and keeps it in view. */
  private mark(): void {
    const items = this.list.querySelectorAll<HTMLElement>('.m-palette__item');
    items.forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === this.index));
      if (i === this.index) {
        this.input.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      }
    });
    if (!items.length) this.input.removeAttribute('aria-activedescendant');
  }
}
