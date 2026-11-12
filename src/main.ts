import './scss/main.scss';
import { Game } from './game/Game';
import { applySeedParam } from './game/debugParams';
import { CharacterPicker } from './ui/CharacterPicker';
import { DayMenu } from './ui/DayMenu';

const hideLoader = (): void => {
  const loader = document.getElementById('loader');
  document.body.classList.remove('is-loading');
  if (!loader) return;
  loader.classList.add('is-done');
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  window.setTimeout(() => loader.remove(), 800);
};

try {
  if (import.meta.env.DEV) applySeedParam();
  const game = new Game(document.getElementById('stage') as HTMLElement);
  if (import.meta.env.DEV) void import('./game/debugParams').then((m) => m.applyDebugParams(game));
  new CharacterPicker();
  new DayMenu((id) => game.startDay(id));
} finally {
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(() => requestAnimationFrame(hideLoader)));
}
