import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { type Page, expect, test } from '@playwright/test';
import { TEST_EMAIL } from './test-user';

// M7 e2e: the model selector (multi-provider BYOK + tier picker) and the
// public /benchmark report. No live model calls — a BYOK key here only needs
// to pass the client-side format check (isValidProviderKey), same posture as
// M4's own BYOK e2e (real provider acceptance/rejection isn't deterministic
// enough for an automated run).

async function signIn(page: Page) {
  await setupClerkTestingToken({ page });
  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });
}

test('model selector: saving a provider key unlocks its tiers, others stay locked', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/en/account');

  // The tier picker doesn't render at all until at least one key exists.
  await expect(page.getByRole('button', { name: 'GPT-5', exact: true })).toHaveCount(0);

  const openaiInput = page.getByLabel('OpenAI API key');
  await openaiInput.fill('sk-e2e-0123456789abcdefghij');
  await openaiInput.press('Enter'); // submits the provider's own <form>

  await expect(page.getByText(/Key active/)).toBeVisible();
  const stored = await page.evaluate(() => sessionStorage.getItem('docai-byok-openai'));
  expect(stored).toBe('sk-e2e-0123456789abcdefghij');

  // OpenAI's tiers are now selectable; Anthropic's stay disabled — no key for
  // that provider yet, so nothing backs a choice there (ADR-020).
  const gpt5 = page.getByRole('button', { name: 'GPT-5', exact: true });
  await expect(gpt5).toBeEnabled();
  const sonnet = page.getByRole('button', { name: 'Claude Sonnet 4.6' });
  await expect(sonnet).toBeDisabled();

  await gpt5.click();
  await expect(page.getByText(/Chat is currently using GPT-5\./)).toBeVisible();
  const preference = await page.evaluate(() => sessionStorage.getItem('docai-byok-preference'));
  expect(preference).toBe(JSON.stringify({ provider: 'openai', tier: 'mid' }));

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);

  // Clearing the active provider's key drops the stored preference with it —
  // otherwise a stale preference would point at a key that no longer exists.
  await page.getByRole('button', { name: 'Remove key' }).click();
  await expect(openaiInput).toBeVisible();
  const clearedKey = await page.evaluate(() => sessionStorage.getItem('docai-byok-openai'));
  const clearedPreference = await page.evaluate(() =>
    sessionStorage.getItem('docai-byok-preference'),
  );
  expect(clearedKey).toBeNull();
  expect(clearedPreference).toBeNull();
});

test('benchmark: renders the committed report with a scored comparison table', async ({ page }) => {
  // Public route — no sign-in required (middleware.ts).
  await page.goto('/en/benchmark');

  await expect(page.getByRole('heading', { name: 'Benchmark' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
  // At least one model row from the committed report.
  await expect(page.getByRole('cell', { name: /deepseek:deepseek-v4-flash/ })).toBeVisible();

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
});
