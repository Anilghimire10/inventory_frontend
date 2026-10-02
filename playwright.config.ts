import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the money paths (till, returns, shift close,
 * subscription), against a running shop app and API:
 *
 *   npm run dev            # this app, on SHOP_URL (default :5173)
 *   (API on API_URL, default http://localhost:3000/api, with a platform admin
 *    ADMIN_EMAIL / ADMIN_PASSWORD -- the seed's admin@platform.com by default)
 *   npm run test:e2e
 *
 * Each file makes its own throwaway business through the admin API and
 * deletes it afterwards, so they can run against a dev database without
 * touching the shops in it. One worker: the tests share that database, and
 * sign-in is rate limited per IP.
 *
 * First run on a new machine: `npx playwright install chromium`.
 */
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: process.env.SHOP_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
