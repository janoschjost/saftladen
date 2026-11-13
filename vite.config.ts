/// <reference types="vitest/config" />
import { statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/** Dev only: lets the app write JSON straight into the repo (room editor -> layout.json, seat panel -> seats.json). */
const saveJson = (name: string, route: string, file: string): Plugin => ({
  name,
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use(route, (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405;
        return res.end();
      }
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', async () => {
        try {
          const layout = JSON.parse(body);
          if (!layout || typeof layout !== 'object' || Array.isArray(layout)) throw new Error('not an object');
          await writeFile(fileURLToPath(new URL(file, import.meta.url)), JSON.stringify(layout, null, 2) + '\n');
          res.statusCode = 204;
        } catch {
          res.statusCode = 400;
        }
        res.end();
      });
    });
  },
});

/** In a git worktree `.git` is a file, in the main checkout a directory. */
const inWorktree = statSync(fileURLToPath(new URL('.git', import.meta.url)), { throwIfNoEntry: false })?.isFile() ?? false;

export default defineConfig({
  base: './',
  plugins: [saveJson('save-layout', '/__save-layout', './src/data/layout.json'), saveJson('save-seats', '/__save-seats', './src/data/seats.json')],
  // Main checkout: served at https://saftladen.test through a Herd proxy (herd proxy saftladen http://127.0.0.1:5173 --secure),
  // so it must get exactly 5173. Worktrees (parallel agent sessions) start at 5174 and take the next free port.
  // unit tests only; the browser tests in e2e/ run with Playwright (npm run test:e2e)
  // tests on the whole office simulate minutes of game time: seconds on a CI runner (~3× slower), past Vitest's 5 s default
  test: { include: ['src/**/*.test.ts'], testTimeout: 60_000 },
  server: { port: inWorktree ? 5174 : 5173, strictPort: !inWorktree, host: true, allowedHosts: ['saftladen.test'] },
});
