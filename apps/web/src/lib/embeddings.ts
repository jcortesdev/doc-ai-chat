import { recordProjectSpend } from '@/lib/budget';
import { db } from '@doc-ai-chat/db/client';
import { usageEvents } from '@doc-ai-chat/db/schema';
import { computeCostUsd } from '@doc-ai-chat/providers/price-table';

const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
// Voyage accepts up to 128 inputs per request.
const MAX_BATCH = 128;

type EmbedContext = {
  workspaceId?: string;
  documentId?: string;
  isPrivileged?: boolean;
};

type VoyageResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage: { total_tokens: number };
};

// EMBEDDINGS_MODEL is `provider:model_id` (e.g. `voyage:voyage-3`, ADR-016).
function embeddingsModel(): string {
  const raw = process.env.EMBEDDINGS_MODEL ?? 'voyage:voyage-3';
  const parts = raw.split(':');
  return parts[1] ?? raw;
}

// Embeds `texts` with Voyage, batching at 128, and logs one usage_events row
// per call (aggregating token usage across batches).
export type EmbedResult = {
  embeddings: number[][];
  totalTokens: number;
  costUsd: number;
};

export async function embed(texts: string[], context: EmbedContext = {}): Promise<EmbedResult> {
  if (texts.length === 0) {
    return { embeddings: [], totalTokens: 0, costUsd: 0 };
  }

  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error('VOYAGE_API_KEY is not set');
  }

  const model = embeddingsModel();
  const embeddings: number[][] = [];
  let totalTokens = 0;

  for (let i = 0; i < texts.length; i += MAX_BATCH) {
    const batch = texts.slice(i, i + MAX_BATCH);
    const response = await fetch(VOYAGE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: batch, model }),
    });

    if (!response.ok) {
      throw new Error(`Voyage embeddings failed (${response.status}): ${await response.text()}`);
    }

    const json = (await response.json()) as VoyageResponse;
    for (const item of [...json.data].sort((a, b) => a.index - b.index)) {
      embeddings.push(item.embedding);
    }
    totalTokens += json.usage.total_tokens;
  }

  const costUsd = computeCostUsd(model, totalTokens, 0);
  await db.insert(usageEvents).values({
    workspaceId: context.workspaceId ?? null,
    documentId: context.documentId ?? null,
    model,
    inputTokens: totalTokens,
    outputTokens: 0,
    costUsd: costUsd.toFixed(6),
    isPrivileged: context.isPrivileged ?? false,
  });
  // Embeddings always run on the project's Voyage key (BYOK only covers chat).
  await recordProjectSpend(costUsd);

  return { embeddings, totalTokens, costUsd };
}

// Single-query embedding for retrieval (M2). Reuses `embed` so batching, model
// resolution, and usage_events logging stay in one place — only difference is
// it returns the lone vector instead of an array.
export type EmbedQueryResult = {
  embedding: number[];
  totalTokens: number;
  costUsd: number;
};

export async function embedQuery(
  query: string,
  context: EmbedContext = {},
): Promise<EmbedQueryResult> {
  const { embeddings, totalTokens, costUsd } = await embed([query], context);
  const embedding = embeddings[0];
  if (!embedding) {
    throw new Error('embedQuery: Voyage returned no embedding for the query');
  }
  return { embedding, totalTokens, costUsd };
}
