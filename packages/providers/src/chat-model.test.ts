import { describe, expect, it } from 'vitest';
import { parseModelRef, resolveChatModel } from './chat-model';

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

  it('parses openai refs — joined the chat-provider union in M7 (ADR-020)', () => {
    // Through M3-M6 this threw "Unsupported chat provider": OpenAI was the
    // eval judge only (judge-model.ts). M7's model selector gives users a
    // product reason to chat via OpenAI (BYOK, tier-per-provider), so
    // chat-model.ts's ChatProviderId grew to match judge-model.ts's
    // JudgeProviderId. See ADR-020 for why this is the planned extension,
    // not a reversal.
    expect(parseModelRef('openai:gpt-5')).toEqual({
      provider: 'openai',
      modelId: 'gpt-5',
    });
  });

  it('throws when the ref has no provider separator', () => {
    expect(() => parseModelRef('deepseek-v4-flash')).toThrow(/provider:model_id/);
  });

  it('throws when the model id is missing', () => {
    expect(() => parseModelRef('anthropic:')).toThrow(/missing model id/);
  });

  it('throws on a genuinely unsupported chat provider', () => {
    expect(() => parseModelRef('mistral:large')).toThrow(/Unsupported chat provider/);
  });
});

describe('resolveChatModel BYOK passthrough', () => {
  // M4 only ever honored userApiKey for the anthropic branch; M7 generalizes it
  // to all three providers so the model selector can use any provider's own
  // key. These assert the call doesn't throw and returns a LanguageModel — the
  // AI SDK provider factories are exercised without a network call.
  it('resolves anthropic with a BYOK key', () => {
    expect(() => resolveChatModel('anthropic:claude-sonnet-4-6', 'sk-ant-test-key')).not.toThrow();
  });

  it('resolves openai with a BYOK key', () => {
    expect(() => resolveChatModel('openai:gpt-5', 'sk-test-key')).not.toThrow();
  });

  it('resolves deepseek with a BYOK key', () => {
    expect(() => resolveChatModel('deepseek:deepseek-v4-flash', 'sk-test-key')).not.toThrow();
  });

  it('resolves each provider without a BYOK key (project key from env)', () => {
    expect(() => resolveChatModel('anthropic:claude-sonnet-4-6')).not.toThrow();
    expect(() => resolveChatModel('openai:gpt-5')).not.toThrow();
    expect(() => resolveChatModel('deepseek:deepseek-v4-flash')).not.toThrow();
  });
});
