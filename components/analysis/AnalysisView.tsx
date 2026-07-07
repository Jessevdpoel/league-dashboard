import Link from 'next/link';
import type { FactSheet } from '@/lib/analysis/factSheet';
import type { MetricCategory } from '@/lib/analysis/metrics';
import type { Finding } from '@/lib/analysis/rules';
import type {
  AnalysisImprovement,
  AnalysisOutput,
  AnalysisStrength,
} from '@/lib/analysis/analysisOutput';
import { championIconUrl } from '@/lib/dataDragon';
import { AdSlot } from './AdSlot';

export interface AnalysisViewProps {
  output: AnalysisOutput;
  factSheet: FactSheet;
  /** True when no LLM prose was generated — we render the deterministic scorecard. */
  degraded: boolean;
  kda: { kills: number; deaths: number; assists: number };
  version: string;
  /** e.g. `/euw1/Faker-KR1` — for the "See your trends" cross-link. */
  basePath: string;
}

const CATEGORY_LABELS: Record<MetricCategory, string> = {
  laning: 'Laning',
  vision: 'Vision',
  fighting: 'Fighting',
  survivability: 'Survivability',
};

const CATEGORY_ORDER: MetricCategory[] = ['laning', 'vision', 'fighting', 'survivability'];

function scoreColor(score: number): string {
  if (score >= 65) return 'bg-win';
  if (score >= 40) return 'bg-amber';
  return 'bg-loss';
}

/** Category scores — render instantly from the stats engine, no LLM. */
function ScoreBars({ scores }: { scores: FactSheet['scores'] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {CATEGORY_ORDER.map((cat) => {
        const score = scores[cat];
        return (
          <div key={cat} className="rounded-lg border border-line-strong bg-ink-900 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-frost-500">
                {CATEGORY_LABELS[cat]}
              </span>
              <span className="text-sm font-bold text-frost-100">
                {score === null ? '—' : score}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-ink-950 overflow-hidden">
              {score === null ? (
                <div className="h-full w-full bg-line-subtle" title="Needs benchmark data" />
              ) : (
                <div className={`h-full rounded-full ${scoreColor(score)}`} style={{ width: `${score}%` }} />
              )}
            </div>
            {score === null && <p className="mt-1 text-[11px] text-frost-500">Needs more data</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Turn a finding's numeric `data` into small chips the coaching text can point to. */
function NumberChips({ finding }: { finding: Finding }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Object.entries(finding.data).map(([key, value]) => (
        <span
          key={key}
          className="rounded bg-ink-950 border border-line-subtle px-1.5 py-0.5 text-[11px] text-frost-300"
        >
          <span className="text-frost-500">{key.replace(/_/g, ' ')}:</span>{' '}
          {Array.isArray(value) ? value.join(', ') : String(value)}
        </span>
      ))}
    </div>
  );
}

function Card({
  item,
  findingsById,
  accent,
}: {
  item: AnalysisStrength | AnalysisImprovement;
  findingsById: Map<string, Finding>;
  accent: 'win' | 'amber';
}) {
  const border = accent === 'win' ? 'border-win/30' : 'border-amber/30';
  const bg = accent === 'win' ? 'bg-win/5' : 'bg-amber/5';
  const dot = accent === 'win' ? 'text-win' : 'text-amber';
  return (
    <div className={`rounded-lg border ${border} ${bg} p-4`}>
      <h4 className="flex items-center gap-2 font-bold text-frost-100">
        <span className={dot}>●</span>
        {item.title}
      </h4>
      <p className="mt-1 text-sm text-frost-300 leading-relaxed">{item.body}</p>
      {item.metric_refs.map((ref) => {
        const f = findingsById.get(ref);
        return f ? <NumberChips key={ref} finding={f} /> : null;
      })}
    </div>
  );
}

export function AnalysisView({ output, factSheet, degraded, kda, version, basePath }: AnalysisViewProps) {
  const { context } = factSheet;
  const findingsById = new Map(factSheet.findings.map((f) => [f.id, f]));
  const improvements = [...output.improvements].sort((a, b) => a.priority - b.priority);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header */}
      <header className="flex items-center gap-4">
        <img
          src={championIconUrl(version, context.champion)}
          alt={context.champion}
          className="h-16 w-16 rounded-lg border border-line-strong"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
        <div>
          <div className="flex items-center gap-3">
            <span className={`text-lg font-bold ${context.result === 'win' ? 'text-win' : 'text-loss'}`}>
              {context.result === 'win' ? 'Victory' : 'Defeat'}
            </span>
            <span className="text-frost-300 font-semibold">
              {kda.kills}/{kda.deaths}/{kda.assists}
            </span>
            <span className="text-frost-500 text-sm">
              {context.champion} · {context.role} · {context.durationMinutes} min
            </span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-frost-100">{output.headline}</h1>
        </div>
      </header>

      {/* 2. Score bars — render instantly from the stats engine */}
      <ScoreBars scores={factSheet.scores} />

      {degraded && (
        <p className="rounded-lg border border-line-subtle bg-ink-900 px-3 py-2 text-xs text-frost-500">
          Showing the deterministic scorecard. Detailed AI coaching is unavailable right now — the
          numbers below are exact.
        </p>
      )}

      {/* Ad slot below the scores block */}
      <AdSlot label="Advertisement" />

      {/* 3. What went well */}
      {output.strengths.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-frost-100">What went well</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {output.strengths.map((s, i) => (
              <Card key={i} item={s} findingsById={findingsById} accent="win" />
            ))}
          </div>
        </section>
      )}

      {/* In-content ad between strengths and improvements */}
      <AdSlot label="Advertisement" />

      {/* 4. What to improve — sorted by priority, with the numbers */}
      {improvements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-frost-100">What to improve</h2>
          <div className="flex flex-col gap-3">
            {improvements.map((s, i) => (
              <Card key={i} item={s} findingsById={findingsById} accent="amber" />
            ))}
          </div>
        </section>
      )}

      {/* 6. Focus for next game */}
      <section className="rounded-lg border border-cyan-400/40 bg-cyan-400/5 p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
          Focus for your next game
        </h2>
        <p className="mt-1 text-frost-100 font-semibold">{output.focus_next_game}</p>
      </section>

      {/* 7. Tips */}
      {output.tips.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-frost-100">Tips</h2>
          <ul className="flex flex-col gap-2">
            {output.tips.map((t, i) => (
              <li key={i} className="rounded-lg border border-line-subtle bg-ink-900 p-3 text-sm text-frost-300">
                <span className="mr-2 rounded bg-ink-950 px-1.5 py-0.5 text-[11px] uppercase text-frost-500">
                  {t.tag}
                </span>
                {t.body}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Back to profile (20-game trend/insights page is a later phase — 04) */}
      <Link
        href={basePath}
        className="self-start rounded-lg border border-line-strong bg-ink-900 px-4 py-2 text-sm font-semibold text-cyan-400 hover:border-cyan-400/60"
      >
        ← Back to profile
      </Link>
    </div>
  );
}
