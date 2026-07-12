import type { CoachInsight } from '@/lib/analysis/coachInsights';

/** Indigo = AI-only accent (palette rule). Renders nothing without insights. */
export function CoachStrip({ insights }: { insights: CoachInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-coach/25 bg-gradient-to-r from-coach/10 to-transparent px-4 py-3">
      <span className="flex-none rounded-md bg-gradient-to-r from-coach-light to-coach px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-background">
        AI Coach
      </span>
      <ul className="flex min-w-0 gap-2 overflow-x-auto">
        {insights.map((insight) => (
          <li
            key={insight.message}
            className={`whitespace-nowrap rounded-full border border-panel-border bg-panel-2 px-3 py-1.5 text-xs font-semibold ${
              insight.good ? 'text-coach-light' : 'text-foreground/80'
            }`}
          >
            {insight.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
