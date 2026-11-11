import { devEvents } from '../game/DevEvents';

/** Dev panel: one button per registered dev event, grouped. Toggle with the "Dev" button or the ` key. */
export class DevPanel {
  private root = document.getElementById('dev') as HTMLElement;
  private body = document.getElementById('dev-body') as HTMLElement;
  private status = document.getElementById('dev-status') as HTMLElement;
  private toggle = document.getElementById('toggle-dev') as HTMLButtonElement;

  constructor() {
    this.toggle.addEventListener('click', () => this.setOpen(!this.isOpen()));
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.key === '`') this.setOpen(!this.isOpen());
    });
    devEvents.onChange(() => this.render());
    this.render();
  }

  private isOpen(): boolean {
    return !this.root.hidden;
  }

  private setOpen(open: boolean): void {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-pressed', String(open));
  }

  private render(): void {
    const events = devEvents.list();
    const groups = new Map<string, typeof events>();
    for (const e of events) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
    this.body.replaceChildren();
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
          this.status.textContent = devEvents.trigger(ev.id);
        });
        wrap.appendChild(b);
      }
      this.body.append(h, wrap);
    }
  }
}
