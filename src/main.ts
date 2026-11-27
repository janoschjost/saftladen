import './scss/main.scss';
import { Game } from './game/Game';
import { blindDrawer, screenDrawer, stillTime, wallTime } from './game/seams';
import { applySeedParam } from './game/debugParams';
import { CharacterPicker } from './ui/CharacterPicker';
import { DayMenu } from './ui/DayMenu';
import { Welcome } from './ui/Welcome';
import { installIntro } from './intro/gate';
import { loaderWaitMs } from './ui/loaderRules';
import { installIdeaMail } from './ui/ideaMail';

const hideLoader = (): void => {
  const loader = document.getElementById('loader');
  document.body.classList.remove('is-loading');
  if (!loader) return;
  loader.classList.add('is-done');
  loader.querySelector('[role=progressbar]')?.setAttribute('aria-valuenow', '100');
  // the bar fills (0.3 s), then the cross-fade (0.6 s)
  window.setTimeout(() => loader.remove(), 1200);
};

// dev server, and the bundle the e2e tests run against (`vite build --mode e2e`): never the production bundle
const dev = import.meta.env.DEV || import.meta.env.MODE === 'e2e';

try {
  if (dev) applySeedParam();
  // ?test (e2e): time stands still (&live: it follows the wall clock) and the office is not drawn (&draw draws it)
  const query = new URLSearchParams(location.search);
  const test = dev && query.has('test');
  // every load starts at the real time of day; a seeded or test page keeps the fixed start so that it replays the same
  const now = new Date();
  const startHour = test || (dev && query.has('seed')) ? undefined : now.getHours() + now.getMinutes() / 60;
  const game = new Game(document.getElementById('stage') as HTMLElement, {
    time: test && !query.has('live') ? stillTime : wallTime(),
    drawer: test && !query.has('draw') ? blindDrawer() : screenDrawer(),
    startHour,
    paced: !test, // under ?test every refresh runs a frame: time stands still there anyway
  });
  if (dev) void import('./game/debugParams').then((m) => m.applyDebugParams(game));
  if (dev) void import('./game/DevForce').then((m) => m.installForceState(game));
  new CharacterPicker();
  new DayMenu((id) => game.startDay(id));
  new Welcome((held) => (game.paused = held));
  installIntro(game);
  installIdeaMail(document.getElementById('idea-link') as HTMLAnchorElement);
} finally {
  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  const testPage = (import.meta.env.DEV || import.meta.env.MODE === 'e2e') && new URLSearchParams(location.search).has('test');
  void fontsReady.then(() =>
    requestAnimationFrame(() =>
      requestAnimationFrame(() => window.setTimeout(hideLoader, loaderWaitMs(performance.now(), testPage))),
    ),
  );
}
