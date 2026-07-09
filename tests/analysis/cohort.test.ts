import { describe, it, expect } from 'vitest';
import { cohortTier, isBenchmarkableTier, comparePatches, COHORT_TIERS } from '../../lib/analysis/cohort';

describe('cohortTier', () => {
  it('passes normal tiers through uppercased', () => {
    expect(cohortTier('GOLD')).toBe('GOLD');
    expect(cohortTier('emerald')).toBe('EMERALD');
  });
  it('merges apex tiers into MASTER_PLUS', () => {
    expect(cohortTier('MASTER')).toBe('MASTER_PLUS');
    expect(cohortTier('GRANDMASTER')).toBe('MASTER_PLUS');
    expect(cohortTier('CHALLENGER')).toBe('MASTER_PLUS');
  });
});

describe('isBenchmarkableTier', () => {
  it('accepts every cohort tier', () => {
    for (const tier of COHORT_TIERS) expect(isBenchmarkableTier(tier)).toBe(true);
  });
  it('accepts raw apex tiers (they normalize to MASTER_PLUS)', () => {
    expect(isBenchmarkableTier('CHALLENGER')).toBe(true);
  });
  it('rejects UNRANKED and garbage', () => {
    expect(isBenchmarkableTier('UNRANKED')).toBe(false);
    expect(isBenchmarkableTier('')).toBe(false);
  });
});

describe('comparePatches', () => {
  it('compares numerically per segment, not lexically', () => {
    expect(comparePatches('26.9', '26.13')).toBeLessThan(0);
    expect(comparePatches('26.13', '26.9')).toBeGreaterThan(0);
    expect(comparePatches('26.13', '26.13')).toBe(0);
    expect(comparePatches('25.24', '26.1')).toBeLessThan(0);
  });
});
