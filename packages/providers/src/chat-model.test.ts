import { describe, expect, it } from 'vitest';
import { parseModelRef } from './chat-model';

describe('parseModelRef', () => {
  it('parses a valid provider:model_id ref', () => {
    expect(parseModelRef('deepseek:deepseek-v4-flash')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash',
    });
    expect(parseModelRef('anthropic:claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    });
  });

  it('throws when the ref has no provider separator', () => {
    expect(() => parseModelRef('deepseek-v4-flash')).toThrow(/provider:model_id/);
  });

  it('throws when the model id is missing', () => {
    expect(() => parseModelRef('anthropic:')).toThrow(/missing model id/);
  });

  it('throws on an unsupported chat provider', () => {
    // openai is the eval judge (M5) via its own path — not a chat provider here.
    expect(() => parseModelRef('openai:gpt-5-mini')).toThrow(/Unsupported chat provider/);
  });
});
