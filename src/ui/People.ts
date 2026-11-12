const KEY = 'saftladen.people.open';

/**
 * "Leute": the right-hand dock with the away roster and the live home-office feeds. Opened from the settings popover;
 * remembered; `#homes` opens it right away (all home offices are taken, the feeds are the point).
 */
export class People {
  private root = document.getElementById('people') as HTMLElement;
  private toggle = document.getElementById('open-people') as HTMLButtonElement;
  private away = document.getElementById('away') as HTMLElement;
  private feeds = document.getElementById('feeds') as HTMLElement;
  private empty = document.getElementById('people-empty') as HTMLElement;

  constructor() {
    let open = location.hash === '#homes';
    try {
      open ||= localStorage.getItem(KEY) === '1';
    } catch {
      /* storage may be unavailable */
    }
    this.setOpen(open, false);
    this.toggle.addEventListener('click', () => this.setOpen(this.root.hasAttribute('hidden')));
  }

  setOpen(open: boolean, remember = true): void {
    this.root.hidden = !open;
    this.toggle.setAttribute('aria-pressed', String(open));
    if (!remember) return;
    try {
      localStorage.setItem(KEY, open ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  /** Shows a short note when nobody is away (roster and feeds both empty). */
  sync(): void {
    const none = this.away.hidden && this.feeds.hidden;
    if (this.empty.hidden === none) this.empty.hidden = !none;
  }
}
