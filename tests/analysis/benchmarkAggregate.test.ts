import { describe, it, expect } from 'vitest';
import { aggregateCohort, type CohortFactRow } from '../../lib/analysis/benchmarkAggregate';

/** n facts for one role where csAt10 runs 1..n (uniform). */
function uniformFacts(role: string, n: number): CohortFactRow[] {
  return Array.from({ length: n }, (_, i) => ({
    role,
    metrics: { csAt10: i + 1 },
  }));
}

describe('aggregateCohort', () => {
  it('computes linear-interpolation quantiles over a known distribution', () => {
    // csAt10 = 1..101 → p25 = 26, p50 = 51, p75 = 76, p90 = 91
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 101));
    const cs = rows.find((r) => r.metricName === 'csAt10');
    expect(cs).toMatchObject({
      patch: '26.13',
      rankTier: 'GOLD',
      role: 'MIDDLE',
      p25: 26,
      p50: 51,
      p75: 76,
      p90: 91,
      sampleN: 101,
    });
  });

  it('interpolates between ranks for non-aligned quantiles', () => {
    // values 1..31: p25 index = 30 * 0.25 = 7.5 → 8.5
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('TOP', 31));
    expect(rows.find((r) => r.metricName === 'csAt10')?.p25).toBeCloseTo(8.5, 5);
  });

  it('omits cells below the minimum sample threshold', () => {
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 29));
    expect(rows).toHaveLength(0);
  });

  it('honors a custom threshold', () => {
    const rows = aggregateCohort('26.13', 'GOLD', uniformFacts('MIDDLE', 29), 10);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('groups by role — roles do not contaminate each other', () => {
    const facts = [...uniformFacts('MIDDLE', 30), ...uniformFacts('UTILITY', 30)];
    const rows = aggregateCohort('26.13', 'GOLD', facts);
    const roles = new Set(rows.map((r) => r.role));
    expect(roles).toEqual(new Set(['MIDDLE', 'UTILITY']));
    for (const r of rows) expect(r.sampleN).toBe(30);
  });

  it('skips metrics missing from a fact row without failing the others', () => {
    const facts: CohortFactRow[] = Array.from({ length: 30 }, (_, i) => ({
      role: 'MIDDLE',
      metrics: i < 10 ? { csAt10: i } : { csAt10: i, deaths: i },
    }));
    const rows = aggregateCohort('26.13', 'GOLD', facts, 30);
    // csAt10 has 30 samples → present; deaths has 20 → below threshold, absent.
    expect(rows.some((r) => r.metricName === 'csAt10')).toBe(true);
    expect(rows.some((r) => r.metricName === 'deaths')).toBe(false);
  });
});
