import type { MetricName } from './metrics';

/** Mirrors the Prisma `Benchmark` row (`prisma/schema.prisma`). */
export interface BenchmarkRow {
  patch: string;
  rankTier: string;
  role: string;
  metricName: string;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  sampleN: number;
}

/** The slice of a ParticipantFacts row aggregation needs. */
export interface CohortFactRow {
  role: string;
  metrics: Partial<Record<MetricName, number>>;
}

/** Below this many samples a (role, metric) cell stays unpublished. */
export const MIN_SAMPLE_N = 30;

/** Type-7 (linear interpolation) quantile of a pre-sorted array. */
function quantile(sorted: number[], p: number): number {
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Aggregate a cohort's facts into Benchmark rows: p25/p50/p75/p90 + sampleN per
 * (role, metric). Pure. Cells with fewer than `minSampleN` samples are omitted
 * so the lookup treats them as missing (graceful pre-benchmark mode).
 */
export function aggregateCohort(
  patch: string,
  rankTier: string,
  facts: CohortFactRow[],
  minSampleN: number = MIN_SAMPLE_N
): BenchmarkRow[] {
  // (role, metric) -> values
  const cells = new Map<string, { role: string; metricName: string; values: number[] }>();
  for (const fact of facts) {
    for (const [metricName, value] of Object.entries(fact.metrics)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      const key = `${fact.role} ${metricName}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { role: fact.role, metricName, values: [] };
        cells.set(key, cell);
      }
      cell.values.push(value);
    }
  }

  const rows: BenchmarkRow[] = [];
  for (const { role, metricName, values } of cells.values()) {
    if (values.length < minSampleN) continue;
    const sorted = [...values].sort((a, b) => a - b);
    rows.push({
      patch,
      rankTier,
      role,
      metricName,
      p25: quantile(sorted, 0.25),
      p50: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      p90: quantile(sorted, 0.9),
      sampleN: sorted.length,
    });
  }
  return rows;
}
