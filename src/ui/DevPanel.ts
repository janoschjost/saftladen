import type { DevEvents } from '../game/DevEvents';
import { devSections } from './devSections';
import { exclusivePanel } from './exclusive';

/** Switches of the label overlays in the dev panel (all off at start). */
export interface LabelSwitches {
  tables: (on: boolean) => void;
  seats: (on: boolean) => void;
  rooms: (on: boolean) => void;
}

const LABELS: Array<[keyof LabelSwitches, string]> = [
  ['tables', 'Tische'],
  ['seats', 'Plätze'],
  ['rooms', 'Räume'],
];

/** Dev panel: one button per registered dev event, grouped. Opened from the settings popover ("Dev-Events") or with the ` key. */
export class DevPanel {
  private root = document.getElementById('dev') as HTMLElement;
  private body = document.getElementById('dev-body') as HTMLElement;
  private status = document.getElementById('dev-status') as HTMLElement;
  private toggle = document.getElementById('open-dev') as HTMLButtonElement;

  private labelsOn = { tables: false, seats: false, rooms: false };
  private closeOthers = exclusivePanel('dev', () => this.setOpen(false));

  constructor(private events: DevEvents, private labels: LabelSwitches) {
    this.toggle.addEventListener('click', () => this.setOpen(!this.isOpen()));
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === '`') this.setOpen(!this.isOpen());
    });
    document.getElementById('dev-close')!.addEventListener('click', () => this.setOpen(false));
    this.events.onChange(() => this.render());
    this.render();
  }

  private isOpen(): boolean {
    return !this.root.hidden;
  }

  private setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-pressed', String(open));
    if (open) this.closeOthers();
  }

  /** "Beschriftungen": one toggle each for the row, seat and room numbers (pressed = shown). They are always off after a reload. */
  private labelsGroup(): HTMLElement {
    const group = document.createElement('div');
    const h = document.createElement('h3');
    h.className = 'm-dev__group';
    h.textContent = 'Beschriftungen';
    const wrap = document.createElement('div');
    wrap.className = 'm-dev__buttons';
    for (const [kind, text] of LABELS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'm-button';
      b.dataset.labels = kind;
      b.textContent = text;
      b.setAttribute('aria-pressed', String(this.labelsOn[kind]));
      b.addEventListener('click', () => {
        const on = !this.labelsOn[kind];
        this.labelsOn[kind] = on;
        this.labels[kind](on);
        b.setAttribute('aria-pressed', String(on));
        this.status.textContent = `${text} ${on ? 'an' : 'aus'}`;
      });
      wrap.appendChild(b);
    }
    group.append(h, wrap);
    return group;
  }

  private render(): void {
    const events = this.events.list();
    const groups = new Map<string, typeof events>();
    for (const e of events) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
    this.body.replaceChildren(this.labelsGroup());
    for (const [name, list] of groups) {
      const h = document.createElement('h3');
      h.className = 'm-dev__group';
      h.textContent = name;
      const wrap = document.createElement('div');
      wrap.className = 'm-dev__buttons';
      for (const ev of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'm-button';
        b.textContent = ev.label;
        b.addEventListener('click', () => {
          this.status.textContent = this.events.trigger(ev.id);
        });
        wrap.appendChild(b);
      }
      this.body.append(h, wrap);
    }
    if (import.meta.env.DEV || import.meta.env.MODE === 'e2e') for (const section of devSections()) section(this.body, this.status);
  }
}
