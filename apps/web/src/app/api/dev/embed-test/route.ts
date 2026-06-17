import { embed } from '@/lib/embeddings';
import { NextResponse } from 'next/server';

// Temporary dev-only endpoint to smoke-test Voyage embeddings + cost logging.
// Removed after M1.
export async function GET() {
  try {
    const texts = [
      'The cat sat on the mat.',
      'RAG retrieves relevant chunks before answering.',
      'Voyage-3 turns text into 1024-dimension vectors.',
    ];
    const vectors = await embed(texts);
    const dimensions = vectors.map((vector) => vector.length);
    console.log('[embed-test] dimensions:', dimensions);
    console.log('[embed-test] first vector head:', vectors[0]?.slice(0, 5));

    return NextResponse.json({ ok: true, count: vectors.length, dimensions });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
