import './scss/main.scss';
import { Game } from './game/Game';
import { CharacterPicker } from './ui/CharacterPicker';

const hideLoader = (): void => {
  const loader = document.getElementById('loader');
  document.body.classList.remove('is-loading');
  if (!loader) return;
  loader.classList.add('is-done');
  loader.addEventListener('transitionend', () => loader.remove(), { once: true });
  window.setTimeout(() => loader.remove(), 800);
};

try {
  new Game(document.getElementById('stage') as HTMLElement);
  new CharacterPicker();
} finally {
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(() => requestAnimationFrame(hideLoader)));
}
