import { embedQuery } from '@/lib/embeddings';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test the query embedding helper (M2 task 1).
// Returns the vector dimension + token/cost metrics, not the raw vector. Removed
// later in M2 once /api/search exists.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q');
  if (!query) {
    return NextResponse.json(
      { ok: false, error: 'missing_query', hint: 'pass ?q=...' },
      { status: 400 },
    );
  }

  try {
    const { embedding, totalTokens, costUsd } = await embedQuery(query);
    return NextResponse.json({ ok: true, dim: embedding.length, totalTokens, costUsd });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
