import { awayStatus, strings, type AwayPhase } from '../i18n/strings';
import { sidePanel } from './SidePanel';

export interface AwayEntry {
  id: string;
  name: string;
  portrait: string | null;
  kind: 'errand' | 'home';
  /** on the way out, gone, or on the way back in */
  phase: AwayPhase;
  /** seconds until they are back */
  left: number;
}

/** Somebody who is in the office: what they are doing decides the dot. */
export interface OfficeEntry {
  id: string;
  name: string;
  portrait: string | null;
  kind: 'desk' | 'meeting' | 'coffee' | 'talk' | 'walk';
  status: string;
}

const t = strings.presence;
const c = strings.chrome;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

interface Row {
  el: HTMLButtonElement;
  dot: HTMLElement;
  status: HTMLElement;
  kind: string;
}

/** Roster in the Leute tab: who is in the office and who is not (errand / home office), plus the `n draussen` button and its avatar stack. */
export class Roster {
  private away = $('away');
  private awayList = $('away-list');
  private awayTotal = $('away-total');
  private awayButton = $<HTMLButtonElement>('away-button');
  private awayCount = $('away-count');
  private avatars = $('away-avatars');
  private officeList = $('office-list');
  private officeCount = $('office-count');
  private awayRows = new Map<string, Row>();
  private officeRows = new Map<string, Row>();
  private stack = '';
  private selected: string | null = null;

  constructor(
    private onPick: (id: string) => void,
    private onBack: (id: string) => void,
    onAll: () => void,
    private onSelect: (id: string) => void,
  ) {
    const all = $('away-all');
    all.textContent = t.panel.callAllBack;
    all.addEventListener('click', onAll);
    this.awayButton.addEventListener('click', () => sidePanel().show('people'));
  }

  /** Marks the selected person's row. */
  setSelected(id: string | null): void {
    if (id === this.selected) return;
    this.selected = id;
    for (const [rowId, row] of [...this.officeRows, ...this.awayRows]) {
      const on = rowId === id;
      row.el.classList.toggle('is-selected', on);
      if (on) row.el.setAttribute('aria-current', 'true');
      else row.el.removeAttribute('aria-current');
    }
  }

  private makeRow(id: string, name: string, portrait: string | null): Row {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'm-roster__item';
    el.dataset.id = id;
    const avatar = document.createElement(portrait ? 'img' : 'span');
    avatar.className = 'm-roster__avatar';
    if (avatar instanceof HTMLImageElement) {
      avatar.src = import.meta.env.BASE_URL + portrait;
      avatar.alt = '';
      avatar.width = 32;
      avatar.height = 32;
      avatar.loading = 'lazy';
    } else {
      avatar.textContent = name.slice(0, 1);
    }
    const label = document.createElement('span');
    label.className = 'm-roster__name';
    label.textContent = name.split(' ')[0];
    const dot = document.createElement('span');
    dot.className = 'm-roster__dot';
    dot.setAttribute('aria-hidden', 'true');
    const status = document.createElement('span');
    status.className = 'm-roster__status';
    el.append(avatar, label, status, dot);
    if (id === this.selected) el.classList.add('is-selected');
    return { el, dot, status, kind: '' };
  }

  updateOffice(entries: OfficeEntry[]): void {
    const ids = new Set(entries.map((e) => e.id));
    for (const [id, row] of this.officeRows) {
      if (ids.has(id)) continue;
      row.el.parentElement?.remove();
      this.officeRows.delete(id);
    }
    for (const e of entries) {
      let row = this.officeRows.get(e.id);
      if (!row) {
        row = this.makeRow(e.id, e.name, e.portrait);
        row.el.addEventListener('click', () => this.onSelect(e.id));
        const li = document.createElement('li');
        li.appendChild(row.el);
        this.officeList.appendChild(li);
        this.officeRows.set(e.id, row);
      }
      if (row.kind !== e.kind) {
        row.kind = e.kind;
        row.dot.dataset.kind = e.kind;
      }
      if (row.status.textContent !== e.status) row.status.textContent = e.status;
    }
    this.officeCount.textContent = String(entries.length);
  }

  updateAway(entries: AwayEntry[]): void {
    const ids = new Set(entries.map((e) => e.id));
    for (const [id, row] of this.awayRows) {
      if (ids.has(id)) continue;
      row.el.parentElement?.remove();
      this.awayRows.delete(id);
    }
    for (const e of entries) {
      let row = this.awayRows.get(e.id);
      if (!row) {
        row = this.makeRow(e.id, e.name, e.portrait);
        const el = row.el;
        el.addEventListener('click', () => {
          if (el.dataset.kind === 'home') this.onPick(e.id);
        });
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'm-roster__back';
        back.title = t.panel.callBack;
        back.setAttribute('aria-label', t.panel.callBackName(e.name.split(' ')[0]));
        back.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M10 6H2.5M5.5 3 2.5 6l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        back.addEventListener('click', () => this.onBack(e.id));
        const li = document.createElement('li');
        li.className = 'm-roster__away';
        li.append(el, back);
        this.awayList.appendChild(li);
        this.awayRows.set(e.id, row);
      }
      if (row.kind !== e.kind) {
        row.kind = e.kind;
        row.el.dataset.kind = e.kind;
        row.dot.dataset.kind = e.kind === 'home' ? 'home' : 'away';
        row.el.classList.toggle('is-home', e.kind === 'home');
        row.el.title = t.hint[e.kind];
      }
      const text = awayStatus(e.kind, e.phase, e.left);
      if (row.status.textContent !== text) row.status.textContent = text;
    }
    this.away.hidden = entries.length === 0;
    this.awayTotal.textContent = String(entries.length);
    this.awayButton.hidden = entries.length === 0;
    this.awayCount.textContent = c.away(entries.length);
    const stack = entries.slice(0, 3).map((e) => e.id + (e.portrait ?? '')).join('|');
    if (stack === this.stack) return;
    this.stack = stack;
    this.avatars.replaceChildren(
      ...entries.slice(0, 3).map((e) => {
        const el = document.createElement(e.portrait ? 'img' : 'span');
        el.className = 'm-away-button__avatar';
        if (el instanceof HTMLImageElement) {
          el.src = import.meta.env.BASE_URL + e.portrait;
          el.alt = '';
          el.width = 24;
          el.height = 24;
        } else {
          el.textContent = e.name.slice(0, 1);
        }
        return el;
      }),
    );
  }
}
