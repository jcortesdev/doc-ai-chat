import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright';
import { isRefusal } from '@doc-ai-chat/prompts/refusal-detector';
import { type Page, expect, test } from '@playwright/test';
import { TEST_EMAIL } from './test-user';

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/evals/fixtures/doc-spanish.pdf',
);

// Sends one chat message, guarding the race that made this spec flaky: the
// component's submit handler silently drops a submission while a previous
// answer is still streaming (`if (text.length === 0 || busy) return;` in
// chat-box.tsx). Asserting on answer *text* can resolve mid-stream, so typing
// the next question immediately after could hit that guard — the Enter was
// swallowed, the question just sat in the textbox, and the test then waited
// out its full timeout on a later assertion with no hint why (found live).
//
// The button's accessible name is the reliable idle signal: it reads
// "Thinking…" while busy and "Send" otherwise. Emptying of the textbox after
// Enter then proves the submit actually went through, so a future regression
// fails here immediately instead of much later somewhere unrelated.
async function sendChatMessage(page: Page, text: string) {
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible({ timeout: 90_000 });
  const textbox = page.getByRole('textbox');
  await textbox.fill(text);
  await textbox.press('Enter');
  await expect(textbox).toHaveValue('');
}

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
  //    the relevance bar, so the model refuses and renders no citation chip.
  //    Asked in Spanish — the model replies in kind, but its exact refusal
  //    phrasing varies run to run (found live: this test used to hand-roll its
  //    own regex, which drifted out of sync with the real guardrail — DeepSeek
  //    phrased a refusal as "no tengo información para responder", already
  //    recognized by isRefusal but missed by the old regex here). Reusing the
  //    same isRefusal the app ships as its production guardrail (SECURITY.md
  //    #10) means this test can't silently diverge from it again.
  await sendChatMessage(page, '¿Cuál es la capital de Francia?');
  const assistantBubbles = page.locator('div.flex.flex-col.gap-1', { hasText: 'DocAI' });
  await expect(async () => {
    const text = await assistantBubbles.last().innerText();
    expect(isRefusal(text)).toBe(true);
  }).toPass({ timeout: 90_000 });
  await expect(page.getByRole('button', { name: /^Source \d/ })).toHaveCount(0);

  // 2. Grounded answer: a question answered by the document streams a response
  //    with a citation chip (label -> source mapping resolved).
  await sendChatMessage(page, '¿Qué pasa el 1 de julio de 2026?');
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
