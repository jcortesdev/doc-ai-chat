import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker';

const prose = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

const tableDoc = `# Title

Intro paragraph before the table.

| Name | Role |
| --- | --- |
| Ada | Engineer |
| Bob | Manager |

Closing paragraph after the table.`;

describe('chunkText', () => {
  it('returns no chunks for empty input', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('returns no chunks for whitespace-only input', () => {
    expect(chunkText('   \n\n  \t')).toEqual([]);
  });

  it('returns a single chunk for short text', () => {
    const text = 'A short paragraph that fits comfortably in one chunk.';
    expect(chunkText(text)).toEqual([text]);
  });

  it('splits long text into multiple chunks, each within chunkSize', () => {
    const chunks = chunkText(prose, { chunkSize: 80, chunkOverlap: 0 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(80);
    }
  });

  it('carries overlap between consecutive chunks', () => {
    const overlap = 20;
    const chunks = chunkText(prose, { chunkSize: 100, chunkOverlap: overlap });
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const curr = chunks[i];
      expect(prev).toBeDefined();
      expect(curr).toBeDefined();
      if (prev !== undefined && curr !== undefined) {
        expect(curr.startsWith(prev.slice(-overlap))).toBe(true);
      }
    }
  });

  it('preserves a markdown header intact', () => {
    const md = '## Section Title\n\nBody text under the section.';
    const chunks = chunkText(md);
    expect(chunks.some((c) => c.includes('## Section Title'))).toBe(true);
  });

  it('keeps a markdown table within a single chunk', () => {
    const chunks = chunkText(tableDoc);
    const tableChunk = chunks.find((c) => c.includes('| Name | Role |'));
    expect(tableChunk).toBeDefined();
    expect(tableChunk).toContain('| Ada | Engineer |');
    expect(tableChunk).toContain('| Bob | Manager |');
  });

  it('never splits a table even when it exceeds chunkSize', () => {
    const chunks = chunkText(tableDoc, { chunkSize: 10, chunkOverlap: 0 });
    const tableChunk = chunks.find((c) => c.includes('| Name | Role |'));
    expect(tableChunk).toBeDefined();
    expect(tableChunk).toContain('| Ada | Engineer |');
    expect(tableChunk).toContain('| Bob | Manager |');
  });

  it('respects a custom chunkSize', () => {
    const chunks = chunkText(prose, { chunkSize: 120, chunkOverlap: 0 });
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
    }
  });

  it('throws when overlap is not smaller than chunkSize', () => {
    expect(() => chunkText('anything', { chunkSize: 100, chunkOverlap: 100 })).toThrow();
  });
});
