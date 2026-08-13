import { describe, expect, it } from 'vitest';
import { getModelPrice } from './price-table';
import {
  CHAT_PROVIDERS_FOR_SELECTOR,
  PROVIDER_TIERS,
  allTierModelRefs,
  tierModelInfo,
  tierModelRef,
} from './tier-models';

describe('tierModelRef', () => {
  it('builds a provider:model_id ref per provider/tier combo', () => {
    expect(tierModelRef('anthropic', 'mid')).toBe('anthropic:claude-sonnet-4-6');
    expect(tierModelRef('anthropic', 'flagship')).toBe('anthropic:claude-opus-4-7');
    expect(tierModelRef('openai', 'mid')).toBe('openai:gpt-5');
    expect(tierModelRef('deepseek', 'flagship')).toBe('deepseek:deepseek-v4-pro');
  });
});

describe('tierModelInfo', () => {
  it('returns a model id and a display label', () => {
    expect(tierModelInfo('openai', 'flagship')).toEqual({
      modelId: 'gpt-5.5',
      label: 'GPT-5.5',
    });
  });
});

describe('allTierModelRefs', () => {
  it('returns exactly the 6 combos the M7 benchmark runs (3 providers x 2 tiers)', () => {
    const refs = allTierModelRefs();
    expect(refs).toHaveLength(CHAT_PROVIDERS_FOR_SELECTOR.length * PROVIDER_TIERS.length);
    expect(new Set(refs).size).toBe(refs.length); // no duplicates
    expect(refs).toContain('anthropic:claude-sonnet-4-6');
    expect(refs).toContain('deepseek:deepseek-v4-pro');
  });

  it('every ref it returns has a price-table entry (computeCostUsd would not throw)', () => {
    for (const ref of allTierModelRefs()) {
      const modelId = ref.split(':').slice(1).join(':');
      expect(() => getModelPrice(modelId)).not.toThrow();
    }
  });
});
