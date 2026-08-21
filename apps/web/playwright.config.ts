import { defineConfig, devices } from '@playwright/test';

// Local e2e: assumes `pnpm dev` (auto-started below) AND the Inngest dev server
// (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`) are up, so
// the ingest pipeline can run the uploaded PDF to `ready`.
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global.setup.ts',
  timeout: 90_000,
  fullyParallel: false,
  // Every spec signs in as the SAME shared test identity (global.setup.ts
  // find-or-creates one Clerk user). Playwright's default worker count runs
  // different spec FILES in parallel even with fullyParallel:false (that flag
  // only serializes tests within one file) — found live: running the full
  // suite with 6 workers had chat/agent/etc. all hitting the shared user's
  // burst rate limiter and daily quotas at once, producing real 429s that
  // looked like flaky failures but were actually correct rate-limiting
  // behavior under real concurrent load. One worker avoids that contention;
  // slower, but deterministic — matches this app's own e2e philosophy
  // (rate-limit/quota paths are documented elsewhere as "not deterministic
  // enough for an automated run" for the same underlying reason).
  workers: 1,
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
