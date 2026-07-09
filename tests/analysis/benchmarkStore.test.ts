import { describe, it, expect } from 'vitest';
import {
  percentileFromQuantiles,
  loadBenchmarkLookup,
  type BenchmarkReader,
  type CohortKey,
} from '../../lib/analysis/benchmarkStore';
import type { BenchmarkRow } from '../../lib/analysis/benchmarkAggregate';

const Q = { p25: 20, p50: 40, p75: 60, p90: 80 };

describe('percentileFromQuantiles', () => {
  it('returns anchor percentiles at the quantile values', () => {
    expect(percentileFromQuantiles(20, Q)).toBe(25);
    expect(percentileFromQuantiles(40, Q)).toBe(50);
    expect(percentileFromQuantiles(60, Q)).toBe(75);
    expect(percentileFromQuantiles(80, Q)).toBe(90);
  });

  it('interpolates linearly between anchors', () => {
    expect(percentileFromQuantiles(30, Q)).toBeCloseTo(37.5, 5); // midway p25→p50
    expect(percentileFromQuantiles(70, Q)).toBeCloseTo(82.5, 5); // midway p75→p90
  });

  it('extrapolates below p25 and clamps at 5', () => {
    expect(percentileFromQuantiles(16, Q)).toBeCloseTo(20, 5); // first-segment slope
    expect(percentileFromQuantiles(-1000, Q)).toBe(5);
  });

  it('extrapolates above p90 and clamps at 95', () => {
    expect(percentileFromQuantiles(84, Q)).toBeCloseTo(93, 5);
    expect(percentileFromQuantiles(1000, Q)).toBe(95);
  });

  it('averages tied anchors for zero-variance runs (e.g. soloDeathsLate mostly 0)', () => {
    const flat = { p25: 0, p50: 0, p75: 0, p90: 1 };
    expect(percentileFromQuantiles(0, flat)).toBe(50); // mean of 25, 50, 75
    const constant = { p25: 0, p50: 0, p75: 0, p90: 0 };
    expect(percentileFromQuantiles(0, constant)).toBeCloseTo(60, 5); // mean of all four
    expect(percentileFromQuantiles(-1, constant)).toBe(5);
    expect(percentileFromQuantiles(1, constant)).toBe(95);
  });
});

// --- loadBenchmarkLookup ----------------------------------------------------

const COHORT: CohortKey = { patch: '26.13', rankTier: 'GOLD', role: 'MIDDLE' };

function row(metricName: string, patch = '26.13'): BenchmarkRow {
  return { patch, rankTier: 'GOLD', role: 'MIDDLE', metricName, ...Q, sampleN: 40 };
}

function readerWith(exact: BenchmarkRow[], previous: BenchmarkRow[] = []): BenchmarkReader {
  return {
    exactRows: async () => exact,
    previousPatchRows: async () => previous,
  };
}

describe('loadBenchmarkLookup', () => {
  it('resolves metrics from the exact cohort', async () => {
    const lookup = await loadBenchmarkLookup(COHORT, readerWith([row('csAt10')]));
    expect(lookup).not.toBeNull();
    expect(lookup!('csAt10', 40)).toBe(50);
    expect(lookup!('deaths', 3)).toBeUndefined(); // metric not benchmarked
  });

  it('falls back to the previous patch per metric, exact rows winning', async () => {
    const exact = [{ ...row('csAt10'), p50: 40 }];
    const previous = [
      { ...row('csAt10', '26.12'), p50: 999 }, // must NOT override exact
      row('deaths', '26.12'),
    ];
    const lookup = await loadBenchmarkLookup(COHORT, readerWith(exact, previous));
    expect(lookup!('csAt10', 40)).toBe(50); // from exact, not 26.12
    expect(lookup!('deaths', 40)).toBe(50); // from fallback
  });

  it('returns null on a true miss (no rows on any patch)', async () => {
    expect(await loadBenchmarkLookup(COHORT, readerWith([], []))).toBeNull();
  });

  it('skips the fallback query when the exact patch covers all metrics', async () => {
    let fallbackCalls = 0;
    const allMetrics = [
      'csAt10', 'goldDiffAt10', 'xpDiffAt14', 'platesTaken', 'deathsPre14',
      'visionScorePerMin', 'controlWardsPurchased', 'wardsKilled', 'killParticipation',
      'soloKills', 'damagePerMin', 'damageShare', 'deaths', 'soloDeathsLate',
    ].map((m) => row(m));
    const reader: BenchmarkReader = {
      exactRows: async () => allMetrics,
      previousPatchRows: async () => { fallbackCalls++; return []; },
    };
    const lookup = await loadBenchmarkLookup(COHORT, reader);
    expect(lookup).not.toBeNull();
    expect(fallbackCalls).toBe(0);
  });
});
