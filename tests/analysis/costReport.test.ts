import { describe, it, expect } from 'vitest';
import { summarizeAnalysisCost, type AnalysisCostRow } from '../../lib/analysis/costReport';

const rows: AnalysisCostRow[] = [
  { createdAt: new Date('2026-07-06T10:00:00Z'), costUsd: 0.0045, tokensIn: 1500, tokensOut: 600, modelUsed: 'claude-haiku-4-5' },
  { createdAt: new Date('2026-07-06T22:00:00Z'), costUsd: 0.0045, tokensIn: 1500, tokensOut: 600, modelUsed: 'claude-haiku-4-5' },
  { createdAt: new Date('2026-07-07T09:00:00Z'), costUsd: 0.0135, tokensIn: 1500, tokensOut: 600, modelUsed: 'claude-sonnet-5' },
];

describe('summarizeAnalysisCost', () => {
  it('totals cost, count, and average across all rows', () => {
    const s = summarizeAnalysisCost(rows);
    expect(s.totalAnalyses).toBe(3);
    expect(s.totalCostUsd).toBeCloseTo(0.0225, 6);
    expect(s.avgCostUsd).toBeCloseTo(0.0075, 6);
  });

  it('breaks spend down per model', () => {
    const s = summarizeAnalysisCost(rows);
    expect(s.byModel['claude-haiku-4-5']).toEqual({ count: 2, costUsd: 0.009 });
    expect(s.byModel['claude-sonnet-5']).toEqual({ count: 1, costUsd: 0.0135 });
  });

  it('groups by UTC day, most recent first', () => {
    const s = summarizeAnalysisCost(rows);
    expect(s.daily.map((d) => d.date)).toEqual(['2026-07-07', '2026-07-06']);
    expect(s.daily[1]).toMatchObject({ count: 2, costUsd: 0.009, tokensIn: 3000, tokensOut: 1200 });
  });

  it('estimates break-even ad impressions from RPM', () => {
    // total 0.0225 / 1.50 * 1000 = 15 impressions
    expect(summarizeAnalysisCost(rows, 1.5).breakEvenImpressions).toBe(15);
  });

  it('handles an empty dataset without dividing by zero', () => {
    const s = summarizeAnalysisCost([]);
    expect(s).toMatchObject({ totalCostUsd: 0, totalAnalyses: 0, avgCostUsd: 0, breakEvenImpressions: 0 });
    expect(s.daily).toEqual([]);
  });
});
