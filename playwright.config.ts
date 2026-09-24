import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests against `next dev` + the local Supabase stack (`supabase start` first).
export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:3100', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } }, // Dad reviews on a phone
  ],
  webServer: { command: 'pnpm dev --port 3100', url: 'http://localhost:3100/login', reuseExistingServer: true, timeout: 120_000 },
});
