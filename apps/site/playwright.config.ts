import { defineConfig, devices } from '@playwright/test'

// Browser checks on the built site (e2e/README.md). Local: dist/ (the fixture build `pnpm test` leaves, or E2E_DIST)
// served on PORT. E2E_BASE_URL instead points them at a live site (production checks).
// E2E_PORT: another port, when another checkout's server holds 4419 (a local run would test that build instead).
const PORT = Number(process.env.E2E_PORT ?? 4419)
const live = process.env.E2E_BASE_URL
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined, // GitHub's runners have 4 cores; Playwright's CI default is 1
  // E2E_JSON: results as JSON too, for scripts/site-watch.mjs (production checks).
  reporter: [...(process.env.CI ? [['github'], ['list'], ['html', { open: 'never', outputFolder: process.env.E2E_REPORT ?? 'e2e-report' }]] as const : [['list']] as const), ...(process.env.E2E_JSON ? [['json', { outputFile: process.env.E2E_JSON }]] as const : [])],
  use: { baseURL: live ?? `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: live ? undefined : { command: `node e2e/serve.mjs ${process.env.E2E_DIST ?? 'dist'} ${PORT}`, url: `http://127.0.0.1:${PORT}/vi/`, reuseExistingServer: !process.env.CI },
})
