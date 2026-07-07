/**
 * LLM spend reporting from the permanent `analyses` cache. This is the cost half of
 * the "revenue vs LLM cost" guardrail (05-monetization-ads.md). Ad-revenue figures
 * require the AdSense reporting API and are added once a publisher account exists.
 */

export interface AnalysisCostRow {
  createdAt: Date;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  modelUsed: string;
}

export interface DailyCost {
  date: string; // UTC YYYY-MM-DD
  count: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

export interface CostSummary {
  totalCostUsd: number;
  totalAnalyses: number;
  avgCostUsd: number;
  byModel: Record<string, { count: number; costUsd: number }>;
  daily: DailyCost[]; // most recent first
  /** Ad impressions needed to break even at the given RPM (revenue = views/1000 * RPM). */
  breakEvenImpressions: number;
}

const round6 = (n: number): number => Math.round(n * 1_000_000) / 1_000_000;
const utcDate = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Aggregate raw analysis rows into totals, per-model spend, and a per-day series.
 * Pure and deterministic. `rpm` (revenue per 1,000 impressions) drives the
 * break-even impression estimate; default is the conservative $1.50 from the plan.
 */
export function summarizeAnalysisCost(rows: AnalysisCostRow[], rpm = 1.5): CostSummary {
  const byModel: Record<string, { count: number; costUsd: number }> = {};
  const byDay = new Map<string, DailyCost>();
  let totalCostUsd = 0;

  for (const row of rows) {
    totalCostUsd += row.costUsd;

    const m = (byModel[row.modelUsed] ??= { count: 0, costUsd: 0 });
    m.count += 1;
    m.costUsd = round6(m.costUsd + row.costUsd);

    const key = utcDate(row.createdAt);
    const day = byDay.get(key) ?? { date: key, count: 0, costUsd: 0, tokensIn: 0, tokensOut: 0 };
    day.count += 1;
    day.costUsd = round6(day.costUsd + row.costUsd);
    day.tokensIn += row.tokensIn;
    day.tokensOut += row.tokensOut;
    byDay.set(key, day);
  }

  totalCostUsd = round6(totalCostUsd);
  const totalAnalyses = rows.length;
  const daily = [...byDay.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  return {
    totalCostUsd,
    totalAnalyses,
    avgCostUsd: totalAnalyses ? round6(totalCostUsd / totalAnalyses) : 0,
    byModel,
    daily,
    breakEvenImpressions: rpm > 0 ? Math.ceil((totalCostUsd / rpm) * 1000) : 0,
  };
}
