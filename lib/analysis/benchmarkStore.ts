import type { BenchmarkRow } from './benchmarkAggregate';
import { METRIC_META, type BenchmarkLookup, type MetricName } from './metrics';

export interface BenchmarkQuantiles {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface CohortKey {
  patch: string;
  rankTier: string;
  role: string;
}

/**
 * Read access to Benchmark rows. `previousPatchRows` returns the rows of the
 * NEWEST patch strictly older than `cohort.patch` for the same (rankTier, role);
 * empty array when no older patch has data. Prisma impl lives in benchmarkDb.ts;
 * tests inject fakes.
 */
export interface BenchmarkReader {
  exactRows(cohort: CohortKey): Promise<BenchmarkRow[]>;
  previousPatchRows(cohort: CohortKey): Promise<BenchmarkRow[]>;
}

const ANCHORS: { key: keyof BenchmarkQuantiles; pct: number }[] = [
  { key: 'p25', pct: 25 },
  { key: 'p50', pct: 50 },
  { key: 'p75', pct: 75 },
  { key: 'p90', pct: 90 },
];

function lerp(x: number, x0: number, y0: number, x1: number, y1: number): number {
  if (x1 === x0) {
    // Zero-width segment: average the endpoint percentiles (used for tied interior anchors).
    // Callers that need directional extrapolation (outside the anchor range) must not
    // reach here with a degenerate segment; they guard via the all-tied check below.
    return (y0 + y1) / 2;
  }
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
}

const clamp = (pct: number): number => Math.min(95, Math.max(5, pct));

/**
 * Raw percentile (0–100) of `value` inside a quantile summary, by piecewise-linear
 * interpolation across the p25/p50/p75/p90 anchors. Outside the anchors we
 * extrapolate on the nearest segment's slope and clamp to [5, 95] — with only
 * four quantiles stored, tail claims beyond that are not supportable.
 * Ties with anchor values average the tied anchors' percentiles so zero-variance
 * runs (count metrics that are mostly 0) land mid-run instead of at its edge.
 */
export function percentileFromQuantiles(value: number, q: BenchmarkQuantiles): number {
  const pts = ANCHORS.map(({ key, pct }) => ({ v: q[key], pct }));

  // Strict out-of-range checks come first so values outside the min/max anchor
  // extrapolate (and clamp) even when some anchors share the same value.
  if (value < pts[0].v) {
    // If the extrapolation segment is degenerate (p25 === p50), fall back to the
    // hard lower bound — anything below a fully-constant distribution is in the tail.
    if (pts[0].v === pts[1].v) return 5;
    return clamp(lerp(value, pts[0].v, pts[0].pct, pts[1].v, pts[1].pct));
  }
  if (value > pts[3].v) {
    // Symmetric upper case.
    if (pts[2].v === pts[3].v) return 95;
    return clamp(lerp(value, pts[2].v, pts[2].pct, pts[3].v, pts[3].pct));
  }

  // Value is within [p25, p90]. Average the percentiles of any tied anchors so
  // zero-variance runs (count metrics mostly 0) land mid-run instead of at an edge.
  const tied = pts.filter((p) => p.v === value);
  if (tied.length > 0) {
    return clamp(tied.reduce((sum, p) => sum + p.pct, 0) / tied.length);
  }

  for (let i = 0; i < pts.length - 1; i++) {
    if (value > pts[i].v && value < pts[i + 1].v) {
      return clamp(lerp(value, pts[i].v, pts[i].pct, pts[i + 1].v, pts[i + 1].pct));
    }
  }
  /* istanbul ignore next -- unreachable: the branches above are exhaustive */
  return 50;
}

const ALL_METRICS = Object.keys(METRIC_META) as MetricName[];

/**
 * Build a BenchmarkLookup for one cohort: exact patch first, previous patch
 * filling per-metric gaps, `null` on a true miss (caller enqueues a fill job).
 * One reader call per source — the page does one batched read, not 14.
 */
export async function loadBenchmarkLookup(
  cohort: CohortKey,
  reader: BenchmarkReader
): Promise<BenchmarkLookup | null> {
  const byMetric = new Map<string, BenchmarkRow>();
  for (const row of await reader.exactRows(cohort)) {
    byMetric.set(row.metricName, row);
  }
  if (byMetric.size < ALL_METRICS.length) {
    for (const row of await reader.previousPatchRows(cohort)) {
      if (!byMetric.has(row.metricName)) byMetric.set(row.metricName, row);
    }
  }
  if (byMetric.size === 0) return null;

  return (metric, value) => {
    const row = byMetric.get(metric);
    return row ? percentileFromQuantiles(value, row) : undefined;
  };
}
