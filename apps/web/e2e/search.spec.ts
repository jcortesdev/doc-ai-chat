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

// Self-contained: ingests a PDF first so the workspace has something to search,
// then runs a hybrid search and asserts the result cards + per-method scores.
// Like the ingest spec, this needs the Inngest dev server running so the upload
// reaches `ready`. Voyage + Cohere are called for real at search time.
test('signs in, searches an ingested PDF, shows scored results, passes axe', async ({ page }) => {
  test.setTimeout(120_000);

  await setupClerkTestingToken({ page });

  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  // Ensure the workspace has at least one ready document to search over.
  await page.goto('/en');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForURL(/\/en\/ingest\//, { timeout: 30_000 });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 60_000 });

  // Run a hybrid search over the ingested content.
  await page.goto('/en/search');
  await page.getByRole('searchbox').fill('autonomía de la flota eléctrica');
  await page.getByRole('button', { name: 'Search' }).click();

  // At least one scored result card appears.
  await expect(page.getByRole('listitem').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Rerank').first()).toBeVisible();
  await expect(page.getByText('Cosine').first()).toBeVisible();
  await expect(page.getByText('BM25').first()).toBeVisible();

  // Accessibility: zero violations on the search page with results rendered.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});
