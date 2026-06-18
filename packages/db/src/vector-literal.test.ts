import { describe, expect, it } from 'vitest';
import { toVectorLiteral } from './vector-literal';

describe('toVectorLiteral', () => {
  it('formats a vector as a bracketed comma-separated literal', () => {
    expect(toVectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });

  it('keeps floating-point values', () => {
    expect(toVectorLiteral([0.1, -0.2, 0.333])).toBe('[0.1,-0.2,0.333]');
  });

  it('handles a single-element vector', () => {
    expect(toVectorLiteral([0.5])).toBe('[0.5]');
  });

  it('throws on an empty vector', () => {
    expect(() => toVectorLiteral([])).toThrow(/must not be empty/);
  });

  it('throws on a non-finite value (NaN/Infinity)', () => {
    expect(() => toVectorLiteral([1, Number.NaN, 3])).toThrow(/non-finite/);
    expect(() => toVectorLiteral([1, Number.POSITIVE_INFINITY])).toThrow(/non-finite/);
  });
});
