import { strings } from '../i18n/strings';

const t = strings.presence.command;

/** Small card for the selected person: send them to the home office or out of the door. */
export class Actions {
  private root = document.getElementById('actions') as HTMLElement;
  private name = document.getElementById('actions-name') as HTMLElement;
  private home = document.getElementById('actions-home') as HTMLButtonElement;
  private out = document.getElementById('actions-out') as HTMLButtonElement;

  private follow = document.getElementById('actions-follow') as HTMLButtonElement;
  private steer = document.getElementById('actions-steer') as HTMLButtonElement;

  constructor(onHome: () => void, onOut: () => void, onSteer: () => void, onFollow: () => void) {
    this.follow.addEventListener('click', onFollow);
    this.steer.addEventListener('click', onSteer);
    this.home.textContent = t.home;
    this.out.textContent = t.errand;
    this.home.addEventListener('click', onHome);
    this.out.addEventListener('click', onOut);
  }

  /** `name` null hides the card. */
  show(name: string | null, homeFull: boolean, steering = false, following = false): void {
    this.root.hidden = !name;
    if (!name) return;
    if (this.name.textContent !== name) this.name.textContent = name;
    this.follow.setAttribute('aria-pressed', String(following));
    this.follow.textContent = following ? 'Folgen beenden (F)' : 'Folgen (F)';
    this.steer.setAttribute('aria-pressed', String(steering));
    this.steer.textContent = steering ? 'Steuern beenden' : 'Steuern (WASD)';
    this.home.disabled = homeFull;
    this.home.title = homeFull ? t.homeFull : '';
  }
}
