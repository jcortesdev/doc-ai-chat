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

// Self-contained end-to-end of the M3 RAG chat: ingest a PDF, then exercise the
// three behaviours that define the module — streamed grounded answer with a
// citation chip, the chip opening the source panel, and a correct refusal for an
// out-of-document question — plus an axe sweep. Needs the Inngest dev server so
// the upload reaches `ready`; the chat calls the configured model + Voyage/Cohere
// for real, so the timeout is generous.
test('signs in, chats over an ingested PDF (stream + citation + refusal), passes axe', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await setupClerkTestingToken({ page });

  await page.goto('/en');
  await clerk.signIn({
    page,
    signInParams: { strategy: 'email_code', identifier: TEST_EMAIL },
  });

  // Ensure the workspace has a ready document to chat over.
  await page.goto('/en');
  await page.locator('input[type="file"]').setInputFiles(fixturePath);
  await page.waitForURL(/\/en\/ingest\//, { timeout: 30_000 });
  await expect(page.getByText('Ready', { exact: true })).toBeVisible({ timeout: 60_000 });

  await page.goto('/en/chat');

  // 1. Refusal: a question whose answer isn't in the document. No passage clears
  //    the relevance bar, so the model refuses and renders no citation chip. Asked
  //    in Spanish — the model replies in kind, and its refusal phrasing there is
  //    stable ("No encuentro información en los documentos proporcionados…").
  await page.getByRole('textbox').fill('¿Cuál es la capital de Francia?');
  await page.getByRole('textbox').press('Enter');
  await expect(
    page.getByText(
      /no encuentro informaci[óo]n|no puedo responder|no (lo |la )?encontr[ée]|no figura|could ?n'?t find/i,
    ),
  ).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: /^Source \d/ })).toHaveCount(0);

  // 2. Grounded answer: a question answered by the document streams a response
  //    with a citation chip (label -> source mapping resolved).
  await page.getByRole('textbox').fill('¿Qué pasa el 1 de julio de 2026?');
  await page.getByRole('textbox').press('Enter');
  const chip = page.getByRole('button', { name: /^Source \d/ }).first();
  await expect(chip).toBeVisible({ timeout: 90_000 });

  // Accessibility: zero violations on the chat with messages rendered.
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);

  // 3. Clicking the chip opens the source panel with an "Open PDF" action.
  await chip.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Open PDF/ })).toBeVisible();
});
