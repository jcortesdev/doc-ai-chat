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

  // M5 golden-set run (2026-07): both models produced genuine refusals that
  // the original pattern set missed, on NA3 (claude-sonnet) and NA4_ES
  // (both models) — see docs/DECISIONS.md ADR-018 follow-up.
  it('detects a "documents do not contain information" refusal (NA3, claude-sonnet)', () => {
    expect(
      isRefusal(
        'The retrieved documents do not contain any information about specific pricing for Lighthouse Analytics.',
      ),
    ).toBe(true);
  });

  it('detects the active-voice Spanish "no menciona" refusal (NA4_ES, both models)', () => {
    expect(isRefusal('El documento no menciona estaciones de carga en zonas residenciales.')).toBe(
      true,
    );
  });

  it('detects "no contiene información" as a Spanish refusal', () => {
    expect(isRefusal('El documento no contiene información sobre ese tema.')).toBe(true);
  });

  it('does not flag a grounded answer', () => {
    expect(isRefusal('The low-emission zones start on July 1, 2026 [1].')).toBe(false);
    expect(isRefusal('Las zonas de bajas emisiones empiezan el 1 de julio de 2026 [1].')).toBe(
      false,
    );
  });
});
