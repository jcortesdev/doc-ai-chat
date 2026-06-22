import { describe, expect, it } from 'vitest';
import { isRefusal } from './refusal-detector';

describe('isRefusal', () => {
  it('detects English refusals', () => {
    expect(isRefusal("I couldn't find that in your documents.")).toBe(true);
    expect(isRefusal("I don't have enough information to answer that.")).toBe(true);
    expect(isRefusal('That is not mentioned in the provided documents.')).toBe(true);
  });

  it('detects Spanish refusals', () => {
    expect(isRefusal('No encontré eso en tus documentos.')).toBe(true);
    expect(isRefusal('Eso no figura en los documentos.')).toBe(true);
    expect(isRefusal('No tengo esa información en el contexto.')).toBe(true);
  });

  it('does not flag a grounded answer', () => {
    expect(isRefusal('The low-emission zones start on July 1, 2026 [1].')).toBe(false);
    expect(isRefusal('Las zonas de bajas emisiones empiezan el 1 de julio de 2026 [1].')).toBe(
      false,
    );
  });
});
