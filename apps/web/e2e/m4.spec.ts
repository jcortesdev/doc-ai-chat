import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { type Page, expect, test } from '@playwright/test';
import { TEST_EMAIL } from './test-user';

// M4 e2e: the surfaces that don't need the Inngest dev server or a live model
// call, so they stay fast and deterministic — BYOK settings, the /usage
// dashboard, and a client-side ErrorState — each with an axe sweep. Rate-limit /
// quota enforcement is verified via the env knobs in RUNTIME_CONFIG (it depends on
// shared Redis counter state, which is not deterministic in an automated run).

async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });
}

test('BYOK: saving a key stores it in sessionStorage and shows the active state', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/en/settings');

  const key = 'sk-ant-e2e-0123456789abcdefghij';
  await page.locator('input[type="password"]').fill(key);
  await page.getByRole('button', { name: 'Save key' }).click();

  // Active state: masked key + a Remove button, and the raw key in sessionStorage.
  await expect(page.getByText(/Key active/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove key' })).toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem('docai-byok-anthropic'));
  expect(stored).toBe(key);

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // Removing it clears storage and returns the form.
  await page.getByRole('button', { name: 'Remove key' }).click();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  const cleared = await page.evaluate(() => sessionStorage.getItem('docai-byok-anthropic'));
  expect(cleared).toBeNull();
});

test('usage dashboard renders the summary and passes axe', async ({ page }) => {
  await signIn(page);
  await page.goto('/en/usage');

  await expect(page.getByRole('heading', { name: 'Usage' })).toBeVisible();
  // The total-cost metric label is always present, even with zero usage.
  await expect(page.getByText('Total cost')).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});

test('ErrorState: an oversized upload shows the file_too_large variant', async ({ page }) => {
  await signIn(page);
  await page.goto('/en');

  // 11 MB > the 10 MB client cap → file_too_large is decided client-side, with no
  // server round-trip, so this is deterministic.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'too-big.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.alloc(11 * 1024 * 1024),
  });

  // Scope to our ErrorState — Next's route announcer also has role="alert".
  const alert = page.getByRole('alert').filter({ hasText: 'File too large' });
  await expect(alert).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
