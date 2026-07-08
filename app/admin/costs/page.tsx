import { prisma } from '@/lib/db';
import { summarizeAnalysisCost, type AnalysisCostRow } from '@/lib/analysis/costReport';

// Reads the DB at request time — never prerender.
export const dynamic = 'force-dynamic';

const usd = (n: number) => `$${n.toFixed(6)}`;

export default async function AdEconomicsPage() {
  if (!process.env.DATABASE_URL) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold text-foreground">LLM cost dashboard</h1>
        <p className="mt-3 text-muted-foreground">
          Set <code>DATABASE_URL</code> to view analysis spend.
        </p>
      </div>
    );
  }

  const rows = await prisma.analysis.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: { createdAt: true, costUsd: true, tokensIn: true, tokensOut: true, modelUsed: true },
  });

  const costRows: AnalysisCostRow[] = rows.map((r) => ({
    createdAt: r.createdAt,
    costUsd: Number(r.costUsd),
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    modelUsed: r.modelUsed,
  }));
  const summary = summarizeAnalysisCost(costRows);

  return (
    <div className="mx-auto max-w-3xl p-8 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">LLM cost dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cost side of the revenue-vs-spend guardrail (05). Ad-revenue figures require the AdSense
          reporting API — pending a publisher account.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ['Total spend', usd(summary.totalCostUsd)],
          ['Analyses', String(summary.totalAnalyses)],
          ['Avg / analysis', usd(summary.avgCostUsd)],
          ['Break-even impressions', `${summary.breakEvenImpressions} @ $1.50 RPM`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border bg-card p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="mt-1 font-bold text-foreground">{value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-bold text-foreground">By model</h2>
        <div className="flex flex-col gap-2">
          {Object.entries(summary.byModel).map(([model, m]) => (
            <div key={model} className="flex justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="text-foreground/80">{model}</span>
              <span className="text-muted-foreground">
                {m.count} · {usd(m.costUsd)}
              </span>
            </div>
          ))}
          {summary.totalAnalyses === 0 && <p className="text-muted-foreground text-sm">No analyses yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold text-foreground">Daily</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1">Date</th>
              <th>Count</th>
              <th>Cost</th>
              <th>Tokens in/out</th>
            </tr>
          </thead>
          <tbody>
            {summary.daily.map((d) => (
              <tr key={d.date} className="border-t border-border text-foreground/80">
                <td className="py-1">{d.date}</td>
                <td>{d.count}</td>
                <td>{usd(d.costUsd)}</td>
                <td>
                  {d.tokensIn} / {d.tokensOut}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
