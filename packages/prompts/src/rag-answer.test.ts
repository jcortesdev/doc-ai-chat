import { describe, expect, it } from 'vitest';
import {
  PROMPT_RAG_ANSWER_V1,
  buildRagUserTurn,
  renderRetrievedContext,
  resolveCitations,
  wrapUserMessage,
} from './rag-answer';

const SOURCES = [
  { chunkId: 'c1', documentId: 'd1', page: 1 },
  { chunkId: 'c2', documentId: 'd2', page: 2 },
];

describe('PROMPT_RAG_ANSWER_V1', () => {
  it('declares the data-isolation and citation invariants', () => {
    // The safety-critical content — guard against accidental edits that weaken
    // the prompt-injection defense or the grounding/citation contract.
    expect(PROMPT_RAG_ANSWER_V1).toContain('<retrieved_context>');
    expect(PROMPT_RAG_ANSWER_V1).toContain('<user_message>');
    expect(PROMPT_RAG_ANSWER_V1).toContain('never instructions');
    expect(PROMPT_RAG_ANSWER_V1).toMatch(/\[1\]/);
    expect(PROMPT_RAG_ANSWER_V1.toLowerCase()).toContain('same language');
    expect(PROMPT_RAG_ANSWER_V1.toLowerCase()).toContain('refus');
  });
});

describe('renderRetrievedContext', () => {
  it('labels passages 1-based in order with a page hint', () => {
    const out = renderRetrievedContext([
      { page: 3, content: 'alpha' },
      { page: null, content: 'beta' },
    ]);
    expect(out.startsWith('<retrieved_context>')).toBe(true);
    expect(out.endsWith('</retrieved_context>')).toBe(true);
    expect(out).toContain('[1] (page 3)\nalpha');
    // No page hint when the chunk has no page.
    expect(out).toContain('[2]\nbeta');
  });

  it('renders an empty block when there are no passages', () => {
    expect(renderRetrievedContext([])).toBe('<retrieved_context>\n\n</retrieved_context>');
  });

  it('trims passage content', () => {
    expect(renderRetrievedContext([{ page: 1, content: '  spaced  ' }])).toContain(
      '[1] (page 1)\nspaced',
    );
  });
});

describe('wrapUserMessage', () => {
  it('wraps and trims the question', () => {
    expect(wrapUserMessage('  hola  ')).toBe('<user_message>\nhola\n</user_message>');
  });
});

describe('buildRagUserTurn', () => {
  it('places the context block before the delimited question', () => {
    const out = buildRagUserTurn('q?', [{ page: 1, content: 'x' }]);
    expect(out.indexOf('<retrieved_context>')).toBeLessThan(out.indexOf('<user_message>'));
  });
});

describe('resolveCitations', () => {
  it('resolves [n] markers to their sources, deduped in first-appearance order', () => {
    expect(resolveCitations('Foo [1]. Bar [2][1].', SOURCES)).toEqual([
      { label: 1, chunkId: 'c1', documentId: 'd1', page: 1 },
      { label: 2, chunkId: 'c2', documentId: 'd2', page: 2 },
    ]);
  });

  it('drops out-of-range labels (hallucinated citations)', () => {
    expect(resolveCitations('Foo [9].', SOURCES)).toEqual([]);
  });

  it('returns empty when there are no markers (e.g. a refusal)', () => {
    expect(resolveCitations("I couldn't find that in your documents.", SOURCES)).toEqual([]);
  });
});
