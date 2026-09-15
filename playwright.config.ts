import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  failOnFlakyTests: true,
  timeout: 90_000,
  globalTimeout: 12 * 60_000,
  expect: { timeout: 10_000 },
  outputDir: 'test-results/e2e/browser',
  reporter: [['list'], ['./e2e/support/reporter.ts']],
  use: {
    browserName: 'chromium',
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    // Even a test-provider trace contains session cookies. Keep only sanitized evidence.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
