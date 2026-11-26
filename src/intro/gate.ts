import type { Game } from '../game/Game';
import { storage } from '../game/storage';
import { strings } from '../i18n/strings';
import { shouldPlayIntro } from './introRules';

const KEY = 'saftladen.intro';

const wasSeen = (): boolean => {
  try {
    return storage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

const markSeen = (): void => {
  try {
    storage.setItem(KEY, '1');
  } catch {
    /* storage may be unavailable */
  }
};

/**
 * Plays the origin-story intro (#322) once, on a visitor's first plain load, and again on `#intro` or from its link in
 * the settings. The game is held while it runs; the scene itself is loaded only when it plays.
 */
export function installIntro(game: Game): void {
  const root = document.getElementById('intro') as HTMLElement;
  const link = document.getElementById('open-intro') as HTMLButtonElement;
  const skip = document.getElementById('intro-skip') as HTMLButtonElement;
  root.setAttribute('aria-label', strings.intro.label);
  link.textContent = strings.intro.label;
  skip.textContent = strings.intro.skip;

  const ended = (): void => {
    markSeen();
    if (location.hash === '#intro') history.replaceState(null, '', location.pathname + location.search);
  };
  const play = (): void => {
    if (!root.hidden) return;
    root.hidden = false; // the dark stage covers the office at once, the scene follows
    game.paused = true;
    const letGo = (): void => {
      game.paused = false;
      game.flyIn();
    };
    import('./Intro')
      .then((m) => m.playIntro(root, { start: game.flyInStart, handOver: letGo, done: ended }))
      .catch(() => {
        // no scene (chunk not loaded, no WebGL context): straight to the office
        root.hidden = true;
        letGo();
        ended();
      });
  };
  link.addEventListener('click', play);
  window.addEventListener('hashchange', () => location.hash === '#intro' && play());
  if (shouldPlayIntro(location.search, location.hash, wasSeen())) play();
}
