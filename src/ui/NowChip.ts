const FAIL_SECONDS = 3;

/** "Gerade passiert" chip (top centre) while an action runs: caption, Folgen toggle, Übersicht button. */
export class NowChip {
  private root = document.getElementById('now') as HTMLElement;
  private caption = document.getElementById('now-caption') as HTMLElement;
  private follow = document.getElementById('now-follow') as HTMLButtonElement;
  private overview = document.getElementById('now-overview') as HTMLButtonElement;
  private timer = 0;

  constructor(onFollow: () => void, onOverview: () => void) {
    this.follow.addEventListener('click', onFollow);
    this.overview.addEventListener('click', onOverview);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(caption: string, following: boolean): void {
    window.clearTimeout(this.timer);
    this.root.classList.remove('is-failed');
    this.follow.hidden = this.overview.hidden = false;
    this.caption.textContent = caption;
    this.setFollow(following);
    this.root.hidden = false;
  }

  setFollow(on: boolean): void {
    this.follow.setAttribute('aria-pressed', String(on));
    this.follow.textContent = on ? 'Folgen an' : 'Folgen aus';
  }

  /** The action could not start: a short note, no buttons, gone after a few seconds (then `after`, e.g. back to a running action). */
  fail(label: string, after?: () => void): void {
    window.clearTimeout(this.timer);
    this.root.classList.add('is-failed');
    this.follow.hidden = this.overview.hidden = true;
    this.caption.textContent = `${label}: nicht möglich`;
    this.root.hidden = false;
    this.timer = window.setTimeout(() => {
      this.hide();
      after?.();
    }, FAIL_SECONDS * 1000);
  }

  hide(): void {
    window.clearTimeout(this.timer);
    this.root.hidden = true;
  }
}
