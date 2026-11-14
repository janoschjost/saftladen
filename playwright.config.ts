import { readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Own port, so the e2e run never talks to a dev server (5173 main, 5174+ worktrees) or to the e2e run of another
 * checkout running at the same time: the first port from 5199 that no other run holds. A run holds its port with a lock
 * file in the temp folder, created only if absent (two runs starting together cannot both get it), and removed when the
 * run ends; a lock whose run is gone is taken over. The runner picks the port once and hands it to its workers (they
 * load this file again) through `E2E_PORT`, which also overrides the pick. A second run in the same checkout stops: it
 * would rebuild `dist-e2e` under the first one.
 */
function e2ePort(): number {
  const dir = realpathSync(fileURLToPath(new URL('.', import.meta.url)));
  /** 'mine' once the lock is ours, 'taken' while another run holds it, 'stale' when its run is gone (removed: try again) */
  const tryLock = (port: number): 'mine' | 'taken' | 'stale' => {
    const lock = join(tmpdir(), `saftladen-e2e-${port}.lock`);
    try {
      writeFileSync(lock, `${process.pid}\n${dir}`, { flag: 'wx' });
      return 'mine';
    } catch {
      let held: string;
      try {
        held = readFileSync(lock, 'utf8');
      } catch {
        return 'stale'; // its run just ended and removed it
      }
      const [pid, owner] = held.split('\n');
      if (!(Number(pid) > 0)) return 'taken'; // still being written
      if (!alive(Number(pid))) {
        rmSync(lock, { force: true });
        return 'stale';
      }
      if (owner === dir) throw new Error(`another e2e run in this checkout (pid ${pid}) is still running on :${port}`);
      return 'taken';
    }
  };
  for (let port = 5199; port < 5299; port++) {
    let got = tryLock(port);
    for (let i = 0; got === 'stale' && i < 3; i++) got = tryLock(port);
    if (got !== 'mine') continue;
    process.on('exit', () => rmSync(join(tmpdir(), `saftladen-e2e-${port}.lock`), { force: true }));
    process.env.E2E_PORT = String(port);
    return port;
  }
  throw new Error('no free e2e port in 5199–5298');
}

const port = Number(process.env.E2E_PORT || e2ePort());

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI: no trace on the first run (recording every test doubles the run on a 2-core runner). A failed test runs
  // once more with a trace and fails the run either way. A test that fails the same way twice has its trace; one that
  // passes the second time is flaky: its error context is uploaded, and locally every failure has a trace.
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  // CI: stop and report before the job's own limit (ci.yml) cancels it and with it the upload of the traces
  // (the run takes 4 to 6 minutes there: the same commit was measured at 3.7 and at 5.9)
  globalTimeout: process.env.CI ? 12 * 60_000 : undefined,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // WebGL in software (SwiftShader): works headless, also on CI runners without a GPU
      use: { ...devices['Desktop Chrome'], launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } },
    },
  ],
  // a bundle, not the dev server: that one sends 130 modules per page, most of a test's time on a CI runner.
  // Mode e2e keeps the dev params and the test hook in (src/main.ts).
  webServer: {
    command: `npx vite build --mode e2e --outDir dist-e2e --logLevel warn && npx vite preview --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
