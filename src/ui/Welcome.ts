import { browserStorage } from '../game/storage';
import { team } from '../data/team';
import { fxRandom } from '../game/rng';
import { strings } from '../i18n/strings';
import { pickGreeter, shouldShowWelcome } from './welcomeRules';

const KEY = 'saftladen.welcome';
const t = strings.welcome;

const wasSeen = (): boolean => {
  try {
    return browserStorage.getItem(KEY) === '1'; // even with ?seed: a dismissed card stays dismissed
  } catch {
    return false;
  }
};

const markSeen = (): void => {
  try {
    browserStorage.setItem(KEY, '1'); // the one key ?seed writes: a card dismissed on a feature URL stays dismissed
  } catch {
    /* storage may be unavailable */
  }
};

/**
 * Welcome card: a random Geschäftsleitung member greets you. The game is held while it is open. Off by default
 * (#319): shown on `#welcome`, from the Hilfe link in the settings and, until dismissed once, with `?welcome=1`.
 */
export class Welcome {
  private root = document.getElementById('welcome') as HTMLElement;
  private portrait = document.getElementById('welcome-portrait') as HTMLImageElement;
  private bubble = document.getElementById('welcome-bubble') as HTMLElement;
  private bullets = document.getElementById('welcome-bullets') as HTMLElement;
  private startBtn = document.getElementById('welcome-start') as HTMLButtonElement;
  private helpBtn = document.getElementById('open-welcome') as HTMLButtonElement;

  constructor(private hold: (held: boolean) => void) {
    document.getElementById('welcome-title')!.textContent = t.title;
    this.startBtn.textContent = t.start;
    this.helpBtn.textContent = t.help;
    for (const text of t.bullets) {
      const li = document.createElement('li');
      li.className = 'm-welcome__bullet';
      li.textContent = text;
      this.bullets.appendChild(li);
    }
    this.startBtn.addEventListener('click', () => this.close());
    this.helpBtn.addEventListener('click', () => this.open());
    // capture: while the card is up no key reaches the game
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.root.hidden || e.key === 'Tab') return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.key === 'Enter' || e.key === 'Escape') this.close();
      },
      true,
    );
    window.addEventListener('hashchange', () => location.hash === '#welcome' && this.open());
    if (shouldShowWelcome(location.search, location.hash, wasSeen())) this.open();
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    if (this.isOpen) return;
    const greeter = pickGreeter(team, fxRandom);
    if (greeter?.portrait) {
      this.portrait.src = import.meta.env.BASE_URL + greeter.portrait;
      this.portrait.alt = greeter.name;
      this.portrait.hidden = false;
      this.bubble.textContent = t.greeting(greeter.name.split(' ')[0]);
    } else {
      this.portrait.hidden = true;
      this.bubble.textContent = t.greeting('vom Team');
    }
    this.root.hidden = false;
    this.hold(true);
    this.startBtn.focus();
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    markSeen();
    if (location.hash === '#welcome') history.replaceState(null, '', location.pathname + location.search);
    this.hold(false);
    this.helpBtn.focus();
  }
}
