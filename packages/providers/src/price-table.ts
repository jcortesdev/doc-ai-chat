// USD per 1M tokens. Source of truth for cost_usd math (ADR-016: cost math is
// code, model choice is config). Add an entry when a new model ships; verify
// figures against each provider's pricing page.
export type ModelPrice = {
  inputPerMillion: number;
  outputPerMillion: number;
};

const PRICE_TABLE: Record<string, ModelPrice> = {
  // Voyage AI embeddings — output tokens are not billed.
  'voyage-3': { inputPerMillion: 0.06, outputPerMillion: 0 },
  // Chat models (M3). Verify against each provider's pricing page when adding.
  // Anthropic Sonnet 4.6 — prod demo default, and the "mid" tier in the M7 benchmark.
  'claude-sonnet-4-6': { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  // DeepSeek V4-Flash — dev iteration (and currently prod while benchmarking);
  // the "mid" tier in the M7 benchmark.
  // DeepSeek moved to peak/off-peak pricing on 2026-08-17 (off-peak = 50% of
  // peak; see api-docs.deepseek.com/quick_start/pricing). Found live 2026-08-24
  // while re-verifying prices for the flagship-tier benchmark expansion — this
  // flat table has no time-of-day axis, so we deliberately use the PEAK rate
  // (the conservative/worst-case number) rather than off-peak, matching the
  // project's cost-conscious default (ADR-006, ADR-015 budget caps). Verified
  // 2026-08-24 against DeepSeek's own pricing page.
  'deepseek-v4-flash': { inputPerMillion: 0.44, outputPerMillion: 1.32 },
  // OpenAI GPT-5-mini — eval judge (M5, ADR-016 EVAL_JUDGE_MODEL default).
  // Verified 2026-08-24 against OpenRouter's rate card.
  'gpt-5-mini': { inputPerMillion: 0.25, outputPerMillion: 2.0 },
  // --- M7: the "flagship" tier per provider (model selector + benchmark). ---
  // Verified 2026-08-24 against OpenRouter's rate card (Anthropic/OpenAI) and
  // DeepSeek's own pricing page (peak rate, see the v4-flash note above) ahead
  // of the 6-model benchmark run. `gpt-5` matched its M7-kickoff placeholder
  // exactly; `claude-opus-4-7`, `gpt-5.5`, and `deepseek-v4-pro` did not and are
  // corrected below.
  'claude-opus-4-7': { inputPerMillion: 5.0, outputPerMillion: 25.0 },
  'gpt-5': { inputPerMillion: 1.25, outputPerMillion: 10.0 },
  'gpt-5.5': { inputPerMillion: 5.0, outputPerMillion: 30.0 },
  'deepseek-v4-pro': { inputPerMillion: 1.32, outputPerMillion: 3.96 },
};

export function getModelPrice(model: string): ModelPrice {
  const price = PRICE_TABLE[model];
  if (!price) {
    throw new Error(
      `No price entry for model "${model}" — add it to packages/providers price-table.`,
    );
  }
  return price;
}

export function computeCostUsd(model: string, inputTokens: number, outputTokens = 0): number {
  const price = getModelPrice(model);
  return (
    (inputTokens / 1_000_000) * price.inputPerMillion +
    (outputTokens / 1_000_000) * price.outputPerMillion
  );
}

// Rerank models bill per "search unit" (one query + up to 100 docs), not per
// token. Cohere PAYG rate is $2.00 / 1K searches; the public pricing page now
// foregrounds Model Vault hourly tiers, so this is the standard usage-based rate
// (cohere.com/pricing). Verify if Cohere changes their pricing model.
const RERANK_PRICE_TABLE: Record<string, { perThousandSearches: number }> = {
  'rerank-v3.5': { perThousandSearches: 2.0 },
};

export function computeRerankCostUsd(model: string, searchUnits: number): number {
  const price = RERANK_PRICE_TABLE[model];
  if (!price) {
    throw new Error(
      `No rerank price entry for model "${model}" — add it to packages/providers price-table.`,
    );
  }
  return (searchUnits / 1000) * price.perThousandSearches;
}
