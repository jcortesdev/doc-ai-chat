import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { type Page, expect, test } from '@playwright/test';
import { TEST_EMAIL } from './test-user';

// M6 e2e: a self-contained multi-document agent run with a visible tool-call
// transcript, plus an axe sweep. Two fixtures are ingested (not one, like
// chat.spec) so the question is a genuine cross-document one — the actual
// recruiter signal for this module. Needs the Inngest dev server for ingest and
// calls the real configured model + tools, so the timeout is generous.
//
// The partial-answer/capped-badge path (ADR-014) is NOT covered here, on
// purpose: triggering it deterministically needs an artificially low
// AGENT_MAX_ITERATIONS/TOKENS env value for just this run, which would either
// require a second dev server process with different env or make every other
// assertion in this file flaky under the same tiny caps. Same call M4 made for
// its rate-limit e2e coverage (see m4.spec.ts) — verified live instead
// (2026-08-06 session, both the real cap trigger and the fix for a
// Number.parseInt("50_000") truncation bug that had made it fire too early).

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/evals/fixtures',
);
const spanishFixture = join(fixturesDir, 'doc-spanish.pdf');
const legalFixture = join(fixturesDir, 'doc-legal-tos.pdf');

async function ingestFixture(page: Page, fixturePath: string) {
  await page.goto('/en');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForURL(/\/en\/ingest\//, { timeout: 30_000 });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 60_000 });
}

test('signs in, runs a cross-document agent query with a visible tool-call transcript, passes axe', async ({
  page,
}) => {
  test.setTimeout(240_000);

  await setupClerkTestingToken({ page });
  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  // Two documents, so the agent has a real reason to search more than once.
  await ingestFixture(page, spanishFixture);
  await ingestFixture(page, legalFixture);

  await page.goto('/en/agent');
  await page
    .getByRole('textbox')
    .fill('Are the Spanish document and the English document about the same topic?');
  await page.getByRole('textbox').press('Enter');

  // 1. A tool-call step becomes visible while the run is in progress...
  await expect(page.getByText('Searching documents').first()).toBeVisible({ timeout: 60_000 });
  // ...and resolves.
  await expect(page.getByText('Done').first()).toBeVisible({ timeout: 90_000 });

  // 2. The run finishes: a final answer rendered plus its cost/latency line
  //    (only present once the `finish` message metadata has arrived).
  await expect(page.getByText(/Cost \$/)).toBeVisible({ timeout: 120_000 });

  // Accessibility: zero violations with a full transcript rendered.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
