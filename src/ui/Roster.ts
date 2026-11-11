import { makeCollapsible } from './collapsible';

export interface AwayEntry {
  id: string;
  name: string;
  portrait: string | null;
  kind: 'errand' | 'home';
  /** still on the way out / on the way back */
  moving: boolean;
  /** seconds until they are back */
  left: number;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** "Not in the office" list: who is out and who works from home. Clicking a home-office person opens their live feed. */
export class Roster {
  private root = document.getElementById('away') as HTMLElement;
  private list = document.getElementById('away-list') as HTMLElement;
  private count = document.getElementById('away-count') as HTMLElement;
  private rows = new Map<string, { el: HTMLButtonElement; status: HTMLElement; kind: string }>();

  constructor(
    private onPick: (id: string) => void,
    private onBack: (id: string) => void,
    onAll: () => void,
  ) {
    (document.getElementById('away-all') as HTMLElement).addEventListener('click', onAll);
    makeCollapsible(this.root, this.root.querySelector('.m-away__title') as HTMLElement, 'saftladen.away.collapsed', 'dock');
  }

  update(entries: AwayEntry[]): void {
    const ids = new Set(entries.map((e) => e.id));
    for (const [id, row] of this.rows) {
      if (ids.has(id)) continue;
      row.el.parentElement?.remove();
      this.rows.delete(id);
    }
    for (const e of entries) {
      let row = this.rows.get(e.id);
      if (!row) {
        const li = document.createElement('li');
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'm-away__item';
        const avatar = document.createElement(e.portrait ? 'img' : 'span');
        avatar.className = 'm-away__avatar';
        if (avatar instanceof HTMLImageElement) {
          avatar.src = import.meta.env.BASE_URL + e.portrait;
          avatar.alt = '';
          avatar.width = 32;
          avatar.height = 32;
        } else {
          avatar.textContent = e.name.slice(0, 1);
        }
        const name = document.createElement('span');
        name.className = 'm-away__name';
        name.textContent = e.name.split(' ')[0];
        const status = document.createElement('span');
        status.className = 'm-away__status';
        el.append(avatar, name, status);
        el.addEventListener('click', () => {
          if (el.dataset.kind === 'home') this.onPick(e.id);
        });
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'm-away__back';
        back.title = 'Zurück ins Büro holen';
        back.setAttribute('aria-label', `${e.name.split(' ')[0]} zurückholen`);
        back.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M10 6H2.5M5.5 3 2.5 6l3 3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        back.addEventListener('click', () => this.onBack(e.id));
        li.append(el, back);
        this.list.appendChild(li);
        row = { el, status, kind: '' };
        this.rows.set(e.id, row);
      }
      if (row.kind !== e.kind) {
        row.kind = e.kind;
        row.el.dataset.kind = e.kind;
        row.el.classList.toggle('is-home', e.kind === 'home');
        row.el.title = e.kind === 'home' ? 'Arbeitet im Homeoffice: klicken für Livebild' : 'Kurz weg, gleich zurück';
      }
      const text = e.kind === 'home' ? (e.moving ? 'Geht nach Hause' : 'Homeoffice') : e.moving ? 'Geht raus' : `Weg · zurück in ${fmt(e.left)}`;
      if (row.status.textContent !== text) row.status.textContent = text;
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = String(entries.length);
  }
}
