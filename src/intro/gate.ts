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

  const welcome = document.getElementById('welcome') as HTMLElement;
  /** ends the scene at once, once it is there */
  let finish: (() => void) | null = null;

  const letGo = (): void => {
    game.paused = false;
    game.flyIn();
  };
  const ended = (): void => {
    finish = null;
    window.removeEventListener('keydown', onKey, true);
    markSeen();
    if (location.hash === '#intro') history.replaceState(null, '', location.pathname + location.search);
  };
  /** Skip, also while the scene is still loading (or could not be loaded: no chunk, no WebGL context): straight to the office. */
  const stop = (): void => {
    if (root.hidden) return;
    if (finish) return finish();
    root.hidden = true;
    letGo();
    ended();
  };
  // capture: from the moment the intro covers the office no key reaches the game; Enter and Esc skip it
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') return;
    e.stopImmediatePropagation();
    if (e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key)) return; // the browser's own keys (reload, dev tools) still work
    e.preventDefault();
    if (e.key === 'Enter' || e.key === 'Escape') stop();
  };
  const play = (): void => {
    if (!root.hidden || !welcome.hidden) return; // one at a time: the welcome card holds the game too
    root.hidden = false; // the dark stage covers the office at once, the scene follows
    game.paused = true;
    window.addEventListener('keydown', onKey, true);
    skip.focus();
    import('./Intro')
      .then((m) => {
        if (!root.hidden) finish = m.playIntro(root, { start: game.flyInStart, handOver: letGo, done: ended }); // not skipped meanwhile
      })
      .catch(stop);
  };
  skip.addEventListener('click', stop);
  link.addEventListener('click', play);
  window.addEventListener('hashchange', () => location.hash === '#intro' && play());
  if (shouldPlayIntro(location.search, location.hash, wasSeen())) play();
}
