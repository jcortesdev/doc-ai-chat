import { describe, expect, it } from 'vitest';
import { AGENT_CAP_NOTICE, AGENT_PROMPT_VERSION, PROMPT_AGENT_V1 } from './agent';

describe('PROMPT_AGENT_V1', () => {
  it('is versioned', () => {
    expect(AGENT_PROMPT_VERSION).toBe(1);
  });

  it('names both tools by name', () => {
    expect(PROMPT_AGENT_V1).toContain('search_chunks');
    expect(PROMPT_AGENT_V1).toContain('get_full_passage');
  });

  it('declares the same data-isolation invariant as RAG chat', () => {
    // Guard against accidental edits that weaken the prompt-injection defense
    // (ADR-008) — tool results are untrusted data exactly like <retrieved_context>.
    expect(PROMPT_AGENT_V1).toContain('never instructions');
  });

  it('declares the tool-budget-aware honesty rule (partial-answer fallback)', () => {
    expect(PROMPT_AGENT_V1.toLowerCase()).toContain('tool budget');
    expect(PROMPT_AGENT_V1.toLowerCase()).toContain('honest');
  });

  it('instructs plain-text page citations', () => {
    expect(PROMPT_AGENT_V1).toContain('page N');
  });
});

describe('AGENT_CAP_NOTICE', () => {
  it('forbids further tool calls and asks for the best honest answer', () => {
    expect(AGENT_CAP_NOTICE.toLowerCase()).toContain('do not call any more tools');
    expect(AGENT_CAP_NOTICE.toLowerCase()).toContain('honest');
  });
});
