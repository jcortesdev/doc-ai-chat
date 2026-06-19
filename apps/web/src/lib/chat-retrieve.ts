import { selectRelevantHits } from '@doc-ai-chat/db/relevance';
import type { ContextChunk } from '@doc-ai-chat/prompts/rag-answer';
import { type HybridHit, hybridRetrieve } from './hybrid-retrieve';

// Relevance cutoff for the refusal decision. A vector ANN search always returns
// its k nearest neighbours however far, and Cohere rerank-v3.5 scores a no-match
// query's results near zero (~0.03 in M2). Passages below this bar are dropped so
// the model only ever sees grounded context. The value is provisional — M5's eval
// harness (refusal-correctness dimension) calibrates it; override at runtime with
// CHAT_RELEVANCE_THRESHOLD so tuning needs no redeploy (ADR-016 ethos).
const DEFAULT_RELEVANCE_THRESHOLD = 0.2;

function relevanceThreshold(): number {
  const raw = process.env.CHAT_RELEVANCE_THRESHOLD;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  return Number.isFinite(parsed) ? parsed : DEFAULT_RELEVANCE_THRESHOLD;
}

export type ChatRetrieval = {
  // Relevant hits only, in rerank order. Citation label N (M3 task 5) maps to
  // hits[N-1], aligned 1:1 with `contextChunks`.
  hits: HybridHit[];
  // The passages handed to the prompt's <retrieved_context> block.
  contextChunks: ContextChunk[];
  // No passage cleared the relevance bar — the model has nothing to ground on and
  // is expected to refuse. The route still calls the model; the system prompt
  // turns an empty context into an honest "I couldn't find that" in the user's
  // language (rather than hard-coding a canned message here).
  shouldRefuse: boolean;
  // Best reranker score seen, before filtering — useful for logging how close a
  // refused query was to the bar.
  topRelevance: number | null;
  // Embed + rerank cost from hybridRetrieve (already logged to usage_events).
  costUsd: number;
};

// Retrieves grounded context for one chat turn: reuses M2's hybridRetrieve, then
// keeps only the passages that clear the relevance threshold. Tenant isolation
// rides on hybridRetrieve — `workspaceId` is the caller's, from the JWT.
export async function retrieveChatContext(
  query: string,
  workspaceId: string,
  options: { topN?: number; isPrivileged?: boolean } = {},
): Promise<ChatRetrieval> {
  const { hits, costUsd } = await hybridRetrieve(query, workspaceId, {
    topN: options.topN,
    isPrivileged: options.isPrivileged,
  });

  const relevant = selectRelevantHits(hits, relevanceThreshold());
  const contextChunks: ContextChunk[] = relevant.map((hit) => ({
    page: hit.page,
    content: hit.content,
  }));

  return {
    hits: relevant,
    contextChunks,
    shouldRefuse: relevant.length === 0,
    topRelevance: hits[0]?.rerankRelevance ?? null,
    costUsd,
  };
}
