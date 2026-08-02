import { describe, expect, it } from 'vitest';
import { parseJudgeModelRef } from './judge-model';

describe('parseJudgeModelRef', () => {
  it('parses openai (the eval judge default)', () => {
    expect(parseJudgeModelRef('openai:gpt-5-mini')).toEqual({
      provider: 'openai',
      modelId: 'gpt-5-mini',
    });
  });

  it('also accepts anthropic and deepseek for gate roles', () => {
    expect(parseJudgeModelRef('anthropic:claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });
    expect(parseJudgeModelRef('deepseek:deepseek-v4-flash')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash',
    });
  });

  it('throws when the ref has no provider separator', () => {
    expect(() => parseJudgeModelRef('gpt-5-mini')).toThrow(/provider:model_id/);
  });

  it('throws when the model id is missing', () => {
    expect(() => parseJudgeModelRef('openai:')).toThrow(/missing model id/);
  });

  it('throws on an unsupported provider', () => {
    expect(() => parseJudgeModelRef('voyage:voyage-3')).toThrow(/Unsupported judge provider/);
  });
});
