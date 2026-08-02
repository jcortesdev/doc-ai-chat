import { describe, expect, it } from 'vitest';
import { validateGoldenSet } from './validate-golden-set';

function baseSet(overrides: Record<string, unknown> = {}) {
  return {
    version: '1.0.0',
    created_at: '2026-06-11',
    description: 'test set',
    documents: [
      {
        id: 'doc-a',
        file: 'doc-a.pdf',
        source_md: 'sources/doc-a.md',
        lang: 'en',
        type: 'manual',
        title: 'Doc A',
      },
    ],
    composition: { factual_single_hop: 1, total: 1, in_spanish: 0 },
    items: [
      {
        id: 'F1',
        type: 'factual_single_hop',
        lang: 'en',
        doc_id: 'doc-a',
        question: 'What is X?',
        expected_chunk_label: 'Section 1',
        expected_chunk_match: 'X is a thing',
        expected_answer_summary: 'X is a thing.',
      },
    ],
    ...overrides,
  };
}

describe('validateGoldenSet', () => {
  it('accepts a well-formed golden set', () => {
    expect(validateGoldenSet(baseSet(), new Set(['doc-a.pdf']))).toEqual([]);
  });

  it('flags a missing fixture file', () => {
    const issues = validateGoldenSet(baseSet(), new Set());
    expect(issues).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('missing fixture') }),
    );
  });

  it('flags an item referencing an unknown document', () => {
    const set = baseSet();
    (set.items[0] as { doc_id: string }).doc_id = 'doc-ghost';
    const issues = validateGoldenSet(set, new Set(['doc-a.pdf']));
    expect(issues).toContainEqual(
      expect.objectContaining({
        itemId: 'F1',
        message: expect.stringContaining('unknown document'),
      }),
    );
  });

  it('requires expected_refusal_patterns on no_answer items, not expected_chunk_match', () => {
    const set = baseSet({
      composition: { no_answer: 1, total: 1, in_spanish: 0 },
      items: [
        {
          id: 'NA1',
          type: 'no_answer',
          lang: 'en',
          doc_id: 'doc-a',
          question: 'Does it support Y?',
          expected_chunk_label: '(none — refusal expected)',
          expected_chunk_match: 'should not be here',
          expected_answer_summary: 'Refusal expected.',
        },
      ],
    });
    const issues = validateGoldenSet(set, new Set(['doc-a.pdf']));
    expect(issues).toContainEqual(
      expect.objectContaining({
        itemId: 'NA1',
        message: expect.stringContaining('expected_refusal_patterns'),
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        itemId: 'NA1',
        message: expect.stringContaining('should not carry expected_chunk_match'),
      }),
    );
  });

  it('requires doc_ids (not doc_id) on contradiction_or_cross_doc items', () => {
    const set = baseSet({
      composition: { contradiction_or_cross_doc: 1, total: 1, in_spanish: 0 },
      items: [
        {
          id: 'C1',
          type: 'contradiction_or_cross_doc',
          lang: 'en',
          doc_id: 'doc-a',
          question: 'Compare the docs.',
          expected_chunk_label: 'both',
          expected_chunk_match: 'x vs y',
          expected_answer_summary: 'They differ.',
        },
      ],
    });
    const issues = validateGoldenSet(set, new Set(['doc-a.pdf']));
    expect(issues).toContainEqual(
      expect.objectContaining({
        itemId: 'C1',
        message: expect.stringContaining('must use doc_ids'),
      }),
    );
  });

  it('flags a composition count that drifted from the real items', () => {
    const set = baseSet({ composition: { factual_single_hop: 2, total: 1, in_spanish: 0 } });
    const issues = validateGoldenSet(set, new Set(['doc-a.pdf']));
    expect(issues).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining(
          'composition.factual_single_hop says 2 but golden set has 1',
        ),
      }),
    );
  });

  it('surfaces zod schema errors for malformed input', () => {
    const issues = validateGoldenSet({ nonsense: true }, new Set());
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.itemId).toBeNull();
  });
});
