import { defineConfig, devices } from '@playwright/test';

// own port, so the e2e run never talks to a dev server of another checkout (5173 main, 5174+ worktrees)
const port = Number(process.env.E2E_PORT ?? 5199);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // CI: a failed test runs once more only to record its trace (recording every test costs a fifth of the run);
  // it still fails the run
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    // Christmas mode is on by default in December (snow, decorations): the tests start the same all year
    storageState: { cookies: [], origins: [{ origin: `http://localhost:${port}`, localStorage: [{ name: 'saftladen.settings', value: '{"xmas":false}' }] }] },
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
