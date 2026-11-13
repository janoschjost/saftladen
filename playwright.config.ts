import { defineConfig, devices } from '@playwright/test';

// own port, so the e2e run never talks to a dev server of another checkout (5173 main, 5174+ worktrees)
const port = Number(process.env.E2E_PORT ?? 5199);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // CI: stop and report before the job's own limit (ci.yml) cancels it and with it the upload of the traces
  globalTimeout: process.env.CI ? 8 * 60_000 : undefined,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
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
