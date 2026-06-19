// Formats a JS number[] as a pgvector text literal: `[v1,v2,...]`. The query
// layer casts it with `::vector`. Pure (no db import) so it's unit-testable in
// isolation — lives here next to the `vector('embedding')` column it serializes.
export function toVectorLiteral(embedding: number[]): string {
  if (embedding.length === 0) {
    throw new Error('toVectorLiteral: embedding must not be empty');
  }
  for (const value of embedding) {
    if (!Number.isFinite(value)) {
      throw new Error(`toVectorLiteral: embedding has a non-finite value (${value})`);
    }
  }
  return `[${embedding.join(',')}]`;
}
