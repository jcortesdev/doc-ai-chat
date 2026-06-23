import { recordProjectSpend } from '@/lib/budget';
import { db } from '@doc-ai-chat/db/client';
import { usageEvents } from '@doc-ai-chat/db/schema';
import { computeRerankCostUsd } from '@doc-ai-chat/providers/price-table';

const COHERE_RERANK_URL = 'https://api.cohere.com/v2/rerank';

type RerankContext = {
  workspaceId?: string;
  documentId?: string;
  isPrivileged?: boolean;
};

// RERANK_MODEL is `provider:model_id` (e.g. `cohere:rerank-v3.5`, ADR-016).
function rerankModel(): string {
  const raw = process.env.RERANK_MODEL ?? 'cohere:rerank-v3.5';
  const parts = raw.split(':');
  return parts[1] ?? raw;
}

export type RerankHit = {
  // Index into the `documents` array passed in — the caller maps it back to its
  // own candidate chunk.
  index: number;
  relevanceScore: number;
};

export type RerankResult = {
  results: RerankHit[];
  searchUnits: number;
  costUsd: number;
};

type CohereRerankResponse = {
  results: Array<{ index: number; relevance_score: number }>;
  meta?: { billed_units?: { search_units?: number } };
};

// Reranks `documents` against `query` with Cohere's cross-encoder (rerank-v3.5),
// returning the top-n by relevance and logging one usage_events row with the
// per-search cost. A cross-encoder scores each (query, doc) pair jointly — far
// more accurate than the bi-encoder cosine/RRF stage, but too expensive to run
// over the whole corpus, so it only reranks the fused top candidates (ADR-002).
export async function rerank(
  query: string,
  documents: string[],
  topN: number,
  context: RerankContext = {},
): Promise<RerankResult> {
  if (documents.length === 0) {
    return { results: [], searchUnits: 0, costUsd: 0 };
  }

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    throw new Error('COHERE_API_KEY is not set');
  }

  const model = rerankModel();
  const response = await fetch(COHERE_RERANK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      query,
      documents,
      top_n: Math.min(topN, documents.length),
    }),
  });

  if (!response.ok) {
    throw new Error(`Cohere rerank failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as CohereRerankResponse;
  const results = json.results.map((item) => ({
    index: item.index,
    relevanceScore: item.relevance_score,
  }));
  // Cohere reports billed search_units; default to 1 (a single ≤100-doc query).
  const searchUnits = json.meta?.billed_units?.search_units ?? 1;
  const costUsd = computeRerankCostUsd(model, searchUnits);

  await db.insert(usageEvents).values({
    workspaceId: context.workspaceId ?? null,
    documentId: context.documentId ?? null,
    model,
    inputTokens: 0,
    outputTokens: 0,
    costUsd: costUsd.toFixed(6),
    isPrivileged: context.isPrivileged ?? false,
  });
  // Rerank always runs on the project's Cohere key (BYOK only covers chat).
  await recordProjectSpend(costUsd);

  return { results, searchUnits, costUsd };
}
