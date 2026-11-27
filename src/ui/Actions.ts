import { strings } from '../i18n/strings';

const t = strings.presence.command;

/** Small card for the selected person: send them to the home office or out of the door. */
export class Actions {
  private root = document.getElementById('actions') as HTMLElement;
  private name = document.getElementById('actions-name') as HTMLElement;
  private home = document.getElementById('actions-home') as HTMLButtonElement;
  private out = document.getElementById('actions-out') as HTMLButtonElement;

  private back = document.getElementById('actions-back') as HTMLButtonElement;
  private note = document.getElementById('actions-note') as HTMLElement;
  private noteTimer = 0;

  private follow = document.getElementById('actions-follow') as HTMLButtonElement;
  private steer = document.getElementById('actions-steer') as HTMLButtonElement;

  constructor(onHome: () => void, onOut: () => void, onSteer: () => void, onFollow: () => void, onBack: () => void) {
    this.follow.addEventListener('click', onFollow);
    this.steer.addEventListener('click', onSteer);
    this.label(this.home, t.home);
    this.label(this.out, t.errand);
    this.label(this.back, t.callBack);
    this.back.addEventListener('click', onBack);
    this.home.addEventListener('click', onHome);
    this.out.addEventListener('click', onOut);
  }

  /** The label of an icon button: its name for screen readers and the tooltip on hover. */
  private label(b: HTMLButtonElement, text: string): void {
    b.setAttribute('aria-label', text);
    b.dataset.tip = text;
  }

  /** Says why a click was refused, above the card, for a few seconds (or until another person is selected). */
  say(text: string): void {
    this.note.textContent = text;
    this.note.hidden = false;
    clearTimeout(this.noteTimer);
    this.noteTimer = window.setTimeout(() => (this.note.hidden = true), 3000);
  }

  /** `name` null hides the card; without `inOffice` only Folgen works, for a dog (`callable` false) next to the greyed buttons, for a person on the way out or on a smoke break (`callable`) next to Zurückrufen instead of them. */
  show(name: string | null, inOffice: boolean, homeFull: boolean, steering = false, following = false, callable = false): void {
    const wasHidden = this.root.hidden;
    this.root.hidden = !name;
    if (!name) return;
    if (wasHidden || this.name.textContent !== name) {
      // shown, or another person selected: the card slides in (a finished animation leaves nothing behind)
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.root.animate(
          [
            { opacity: 0, transform: 'translate(-50%, 1.5rem)' },
            { opacity: 1, transform: 'translate(-50%, 0)' },
          ],
          { duration: 250, easing: 'ease-out' },
        );
      }
      this.name.textContent = name;
      this.note.hidden = true;
      clearTimeout(this.noteTimer);
    }
    this.follow.setAttribute('aria-pressed', String(following));
    this.label(this.follow, following ? 'Folgen beenden' : 'Folgen');
    this.steer.setAttribute('aria-pressed', String(steering));
    this.label(this.steer, steering ? 'Steuern beenden' : 'Steuern (WASD)');
    for (const b of [this.home, this.out]) b.hidden = callable;
    this.steer.hidden = callable && !steering; // steering can always be ended from here
    this.back.hidden = !callable;
    this.steer.disabled = !inOffice && !steering;
    this.out.disabled = !inOffice;
    this.home.disabled = !inOffice || homeFull;
    // why Homeoffice is greyed out: a tooltip in the game's own style (`data-tip`, see `.m-actions .m-button[data-tip]`), not a browser title
    const tip = inOffice && homeFull ? t.homeFull : '';
    this.home.dataset.tip = tip || t.home;
    if (tip) this.home.setAttribute('aria-description', tip);
    else this.home.removeAttribute('aria-description');
  }
}
