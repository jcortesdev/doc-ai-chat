import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { expect, test } from '@playwright/test';
import { TEST_EMAIL } from './test-user';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/evals/fixtures/doc-spanish.pdf',
);

test('uploads a PDF, reaches ready, and passes the axe sweep', async ({ page }) => {
  await setupClerkTestingToken({ page });

  // Sign in as the self-provisioned test user (created in global setup). The
  // `+clerk_test` email uses the mocked code 424242 on dev instances.
  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  // Upload a fixture PDF through the uploader's (hidden) file input.
  await page.goto('/en');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);

  // The uploader redirects to the status page once finalize succeeds.
  await page.waitForURL(/\/en\/ingest\//, { timeout: 30_000 });

  // The pipeline (Inngest dev server must be running) flips it to ready.
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Chunks')).toBeVisible();

  // Accessibility: zero violations on the ingest status page.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
