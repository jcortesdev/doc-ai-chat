import { defineConfig, devices } from '@playwright/test';

// Local e2e: assumes `pnpm dev` (auto-started below) AND the Inngest dev server
// (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`) are up, so
// the ingest pipeline can run the uploaded PDF to `ready`.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  timeout: 90_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
