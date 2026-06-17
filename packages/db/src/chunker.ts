// Deterministic, markdown-aware recursive text splitter (ADR-004). No model.
//
// Strategy: keep markdown tables atomic (never split inside one), split the rest
// recursively on the largest semantic separator that fits, then pack the pieces
// into chunks near `chunkSize` with a trailing `chunkOverlap` carried between
// consecutive chunks for retrieval continuity.

export type ChunkOptions = {
  chunkSize?: number;
  chunkOverlap?: number;
};

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

// Largest semantic unit first; '' is the last-resort hard character split.
const SEPARATORS = ['\n\n', '\n', ' ', ''];

type Segment = { text: string; atomic: boolean };

// A markdown table row starts (after optional spaces) with a pipe.
function isTableLine(line: string): boolean {
  return /^\s*\|/.test(line);
}

// Split into atomic table segments and splittable prose segments, in order.
function segment(text: string): Segment[] {
  const segments: Segment[] = [];
  let prose: string[] = [];
  let table: string[] = [];

  const flushProse = () => {
    if (prose.length > 0) {
      segments.push({ text: prose.join('\n'), atomic: false });
      prose = [];
    }
  };
  const flushTable = () => {
    if (table.length > 0) {
      segments.push({ text: table.join('\n'), atomic: true });
      table = [];
    }
  };

  for (const line of text.split('\n')) {
    if (isTableLine(line)) {
      flushProse();
      table.push(line);
    } else {
      flushTable();
      prose.push(line);
    }
  }
  flushProse();
  flushTable();
  return segments;
}

// Recursively split prose into pieces no larger than chunkSize.
function recursiveSplit(text: string, separators: string[], chunkSize: number): string[] {
  if (text.length <= chunkSize) {
    return text.length > 0 ? [text] : [];
  }

  const [separator, ...rest] = separators;

  if (separator === undefined) {
    return [text];
  }

  if (separator === '') {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      pieces.push(text.slice(i, i + chunkSize));
    }
    return pieces;
  }

  const pieces: string[] = [];
  for (const part of text.split(separator)) {
    if (part.length === 0) {
      continue;
    }
    if (part.length <= chunkSize) {
      pieces.push(part);
    } else {
      pieces.push(...recursiveSplit(part, rest, chunkSize));
    }
  }
  return pieces;
}

// Greedily pack pieces into chunks near chunkSize, carrying a char overlap.
// Atomic (table) pieces always get their own chunk and are never split.
function packChunks(
  pieces: Array<{ text: string; atomic: boolean }>,
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    if (piece.atomic) {
      if (current.length > 0) {
        chunks.push(current);
        current = '';
      }
      chunks.push(piece.text);
      continue;
    }

    const candidate = current.length > 0 ? `${current}\n${piece.text}` : piece.text;
    if (candidate.length <= chunkSize) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
      const tail = chunkOverlap > 0 ? current.slice(-chunkOverlap) : '';
      current = tail.length > 0 ? `${tail}\n${piece.text}` : piece.text;
    } else {
      current = piece.text;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be smaller than chunkSize');
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const pieces: Array<{ text: string; atomic: boolean }> = [];
  for (const seg of segment(trimmed)) {
    if (seg.atomic) {
      pieces.push({ text: seg.text, atomic: true });
    } else {
      for (const piece of recursiveSplit(seg.text, SEPARATORS, chunkSize)) {
        pieces.push({ text: piece, atomic: false });
      }
    }
  }

  return packChunks(pieces, chunkSize, chunkOverlap);
}
