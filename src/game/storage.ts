/**
 * Dev only: `?seed=<n>` means "show me exactly this world", so the page starts like a fresh browser profile. It reads
 * nothing saved in `localStorage` and writes nothing back (one exception: whether the welcome card was dismissed,
 * `browserStorage`): edits made on such a page last for the session. `?test` keeps the real storage: every e2e test has
 * a fresh profile anyway, and some check what is saved. The production bundle ignores `?seed`, so it always uses the
 * real storage.
 */
export const savedStateIgnored = ((): boolean => {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'e2e') || typeof location === 'undefined') return false;
  const q = new URLSearchParams(location.search);
  const seed = q.get('seed');
  return !!seed && Number.isFinite(Number(seed)) && !q.has('test'); // as applySeedParam: only a seed that is applied
})();

type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** The browser's `localStorage`, even with `?seed`: only for what a fresh profile keeps (whether the welcome card was dismissed). */
export const browserStorage: KeyValueStore = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

const session = new Map<string, string>();

/**
 * Where the game remembers things between visits: `localStorage`, with `?seed` a copy that lasts for the session (see
 * `savedStateIgnored`). Like `localStorage` it may throw (storage blocked): callers keep their try/catch.
 */
export const storage: KeyValueStore = savedStateIgnored
  ? {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => void session.set(key, value),
      removeItem: (key) => void session.delete(key),
    }
  : browserStorage;
