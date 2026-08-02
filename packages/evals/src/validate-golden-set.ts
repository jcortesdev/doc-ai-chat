import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoldenSet, itemDocIds } from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const EVALS_ROOT = path.resolve(__dirname, '..');
export const GOLDEN_SET_PATH = path.join(EVALS_ROOT, 'golden-set.json');
export const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');

export type ValidationIssue = { itemId: string | null; message: string };

// Validates golden-set.json beyond the zod schema: cross-field invariants a
// discriminated union can't express (schema.ts), referential integrity against
// `documents`, fixture files actually present on disk, and that `composition`
// matches the real item counts (the field most likely to drift as items are
// added). Pure given the parsed JSON, so it's unit-testable without touching
// the filesystem; `main()` below wires in the real file reads.
export function validateGoldenSet(raw: unknown, fixtureFiles: Set<string>): ValidationIssue[] {
  const parsed = GoldenSet.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      itemId: null,
      message: `${issue.path.join('.')}: ${issue.message}`,
    }));
  }

  const goldenSet = parsed.data;
  const issues: ValidationIssue[] = [];
  const docIds = new Set(goldenSet.documents.map((doc) => doc.id));
  const itemIds = new Set<string>();

  for (const doc of goldenSet.documents) {
    if (!fixtureFiles.has(doc.file)) {
      issues.push({
        itemId: null,
        message: `Document "${doc.id}" references missing fixture "${doc.file}".`,
      });
    }
  }

  for (const item of goldenSet.items) {
    if (itemIds.has(item.id)) {
      issues.push({ itemId: item.id, message: 'Duplicate item id.' });
    }
    itemIds.add(item.id);

    for (const docId of itemDocIds(item)) {
      if (!docIds.has(docId)) {
        issues.push({ itemId: item.id, message: `References unknown document "${docId}".` });
      }
    }

    const hasMatch = item.expected_chunk_match !== undefined;
    const hasRefusalPatterns = item.expected_refusal_patterns !== undefined;
    if (item.type === 'no_answer') {
      if (!hasRefusalPatterns) {
        issues.push({
          itemId: item.id,
          message: 'no_answer item is missing expected_refusal_patterns.',
        });
      }
      if (hasMatch) {
        issues.push({
          itemId: item.id,
          message: 'no_answer item should not carry expected_chunk_match.',
        });
      }
    } else {
      if (!hasMatch) {
        issues.push({
          itemId: item.id,
          message: `${item.type} item is missing expected_chunk_match.`,
        });
      }
      if (hasRefusalPatterns) {
        issues.push({
          itemId: item.id,
          message: `${item.type} item should not carry expected_refusal_patterns (only no_answer items refuse).`,
        });
      }
    }

    if (item.type === 'contradiction_or_cross_doc' && !item.doc_ids) {
      issues.push({
        itemId: item.id,
        message: 'contradiction_or_cross_doc item must use doc_ids, not doc_id.',
      });
    }
    if (item.type !== 'contradiction_or_cross_doc' && item.doc_ids) {
      issues.push({ itemId: item.id, message: `${item.type} item must use doc_id, not doc_ids.` });
    }
  }

  const actualCounts: Record<string, number> = { total: goldenSet.items.length };
  for (const item of goldenSet.items) {
    actualCounts[item.type] = (actualCounts[item.type] ?? 0) + 1;
  }
  const inSpanish = goldenSet.items.filter((item) => item.lang === 'es').length;
  actualCounts.in_spanish = inSpanish;

  for (const [key, expected] of Object.entries(goldenSet.composition)) {
    const actual = actualCounts[key] ?? 0;
    if (actual !== expected) {
      issues.push({
        itemId: null,
        message: `composition.${key} says ${expected} but golden set has ${actual}.`,
      });
    }
  }

  return issues;
}

async function main(): Promise<void> {
  const raw = JSON.parse(await readFile(GOLDEN_SET_PATH, 'utf-8'));
  const fixtureFiles = new Set(
    raw && typeof raw === 'object' && 'documents' in raw
      ? (raw as { documents: { file: string }[] }).documents
          .map((doc) => doc.file)
          .filter((file) => existsSync(path.join(FIXTURES_DIR, file)))
      : [],
  );

  const issues = validateGoldenSet(raw, fixtureFiles);
  if (issues.length === 0) {
    console.log('Golden set is valid.');
    return;
  }

  console.error(`Golden set has ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`  ${issue.itemId ? `[${issue.itemId}] ` : ''}${issue.message}`);
  }
  process.exitCode = 1;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
