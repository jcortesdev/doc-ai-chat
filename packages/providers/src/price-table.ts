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
