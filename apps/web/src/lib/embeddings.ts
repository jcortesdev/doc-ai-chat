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
export async function embed(texts: string[], context: EmbedContext = {}): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
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

  return embeddings;
}
