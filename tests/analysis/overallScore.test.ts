import { describe, expect, it } from 'vitest';
import { computeOverallScore } from '@/lib/analysis/overallScore';

describe('computeOverallScore', () => {
  it('returns null when all category scores are null', () => {
    expect(
      computeOverallScore(
        { laning: null, vision: null, fighting: null, survivability: null },
        'MIDDLE'
      )
    ).toBeNull();
  });

  it('returns the score itself when all categories are equal', () => {
    expect(
      computeOverallScore(
        { laning: 70, vision: 70, fighting: 70, survivability: 70 },
        'BOTTOM'
      )
    ).toBe(70);
  });

  it('weights categories by role (vision dominates for UTILITY)', () => {
    // UTILITY weights: laning 0.6, vision 1.4, fighting 0.9, survivability 1.0
    const utility = computeOverallScore(
      { laning: 100, vision: 0, fighting: 50, survivability: 50 },
      'UTILITY'
    );
    const mid = computeOverallScore(
      { laning: 100, vision: 0, fighting: 50, survivability: 50 },
      'MIDDLE'
    );
    // Vision is weighted heavier for UTILITY, so its 0 drags the score lower.
    expect(utility).toBeLessThan(mid!);
  });

  it('skips null categories and averages the rest', () => {
    expect(
      computeOverallScore(
        { laning: 80, vision: null, fighting: null, survivability: null },
        undefined
      )
    ).toBe(80);
  });

  it('rounds to an integer', () => {
    const result = computeOverallScore(
      { laning: 33, vision: 34, fighting: 33, survivability: null },
      undefined
    );
    expect(Number.isInteger(result)).toBe(true);
  });

  it('falls back to equal weights for unknown roles', () => {
    expect(
      computeOverallScore(
        { laning: 40, vision: 60, fighting: 40, survivability: 60 },
        'UNKNOWN'
      )
    ).toBe(50);
  });
});
