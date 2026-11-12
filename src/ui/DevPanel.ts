import { devEvents } from '../game/DevEvents';
import { sidePanel } from './SidePanel';
import { isTyping } from './typing';

/** Dev tab of the side panel: one button per registered dev event, grouped. Toggle with the dock button or the ` key. */
export class DevPanel {
  private body = document.getElementById('dev-body') as HTMLElement;
  private status = document.getElementById('dev-status') as HTMLElement;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (isTyping(e.target)) return;
      if (e.key === '`') sidePanel().toggle('dev');
    });
    devEvents.onChange(() => this.render());
    this.render();
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
