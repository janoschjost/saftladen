import { awayStatus, strings, type AwayPhase } from '../i18n/strings';
import { makeCollapsible } from './collapsible';

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

const t = strings.presence;

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
    const all = document.getElementById('away-all') as HTMLElement;
    const title = this.root.querySelector('.m-away__title') as HTMLElement;
    this.root.setAttribute('aria-label', t.panel.title);
    title.prepend(`${t.panel.title} `);
    all.textContent = t.panel.callAllBack;
    all.addEventListener('click', onAll);
    makeCollapsible(this.root, title, 'saftladen.away.collapsed', 'dock');
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
        back.title = t.panel.callBack;
        back.setAttribute('aria-label', t.panel.callBackName(e.name.split(' ')[0]));
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
        row.el.title = t.hint[e.kind];
      }
      const text = awayStatus(e.kind, e.phase, e.left);
      if (row.status.textContent !== text) row.status.textContent = text;
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = String(entries.length);
  }
}
