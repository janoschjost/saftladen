import { defineConfig, devices } from '@playwright/test';

// own port, so the e2e run never talks to a dev server of another checkout (5173 main, 5174+ worktrees)
const port = Number(process.env.E2E_PORT ?? 5199);

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
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
  webServer: {
    command: `npx vite --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
