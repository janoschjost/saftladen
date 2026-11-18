import { awayStatus, strings, type AwayPhase } from '../i18n/strings';
import { icon } from './icons';
import { makeCollapsible } from './collapsible';

/** On a phone the dock starts folded (an open feed grid would cover the office); a remembered state wins. */
const PHONE_FOLDED = matchMedia('(max-width: 840px)').matches;

export interface AwayEntry {
  id: string;
  name: string;
  portrait: string | null;
  kind: 'errand' | 'home' | 'smoke';
  /** on the way out, gone, or on the way back in */
  phase: AwayPhase;
  /** seconds until they are back */
  left: number;
}

const t = strings.presence;
/** Portraits are files in public/ or rendered data URLs (Kurt). */
const srcOf = (portrait: string) => (portrait.startsWith('data:') ? portrait : import.meta.env.BASE_URL + portrait);

/** "Not in the office" list: who is out and who works from home. Clicking a home-office person opens their live feed. */
export class Roster {
  private root = document.getElementById('away') as HTMLElement;
  private list = document.getElementById('away-list') as HTMLElement;
  private count = document.getElementById('away-count') as HTMLElement;
  private rows = new Map<string, { el: HTMLButtonElement; status: HTMLElement; kind: string; name: HTMLElement; avatar: HTMLElement; label: string; portrait: string | null }>();

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
    makeCollapsible(this.root, title, 'saftladen.away.collapsed', 'dock', PHONE_FOLDED);
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
          avatar.src = srcOf(e.portrait!);
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
        back.innerHTML = icon('back', 12);
        back.addEventListener('click', () => this.onBack(e.id));
        li.append(el, back);
        this.list.appendChild(li);
        row = { el, status, kind: '', name, avatar, label: e.name, portrait: e.portrait };
        this.rows.set(e.id, row);
      }
      if (row.kind !== e.kind) {
        row.kind = e.kind;
        row.el.dataset.kind = e.kind;
        row.el.classList.toggle('is-home', e.kind === 'home');
        row.el.title = t.hint[e.kind];
      }
      if (row.label !== e.name) {
        // the same person under another name (Marco walking out as Kurt)
        row.label = e.name;
        row.name.textContent = e.name.split(' ')[0];
      }
      if (row.portrait !== e.portrait && row.avatar instanceof HTMLImageElement && e.portrait) {
        row.portrait = e.portrait;
        row.avatar.src = srcOf(e.portrait);
      }
      const text = awayStatus(e.kind, e.phase, e.left);
      if (row.status.textContent !== text) row.status.textContent = text;
    }
    this.root.hidden = entries.length === 0;
    this.count.textContent = String(entries.length);
  }
}
