import { describe, expect, it } from 'vitest';
import { scoreRefusalCorrectness, summarizeRefusalCorrectness } from './refusal-correctness';

describe('scoreRefusalCorrectness', () => {
  it('marks an explicit English refusal as correct', () => {
    expect(scoreRefusalCorrectness("I couldn't find that in your documents.")).toBe(true);
  });

  it('marks an explicit Spanish refusal as correct', () => {
    expect(scoreRefusalCorrectness('No encontré esa información en los documentos.')).toBe(true);
  });

  it('marks an invented answer as incorrect', () => {
    expect(scoreRefusalCorrectness('Yes, the Helios H7 supports Apple HomeKit. [1]')).toBe(false);
  });
});

describe('summarizeRefusalCorrectness', () => {
  it('computes the correctness rate', () => {
    expect(summarizeRefusalCorrectness([true, true, false, true])).toBeCloseTo(0.75);
  });

  it('returns 0 for an empty list', () => {
    expect(summarizeRefusalCorrectness([])).toBe(0);
  });
});
