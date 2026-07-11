import type { RecentPerformance } from '@/lib/matchStats';
import { Panel } from './Panel';

export function PerformancePanel({ perf }: { perf: RecentPerformance }) {
  const donutStyle = {
    background: `conic-gradient(var(--color-win) 0 ${perf.winRatePct}%, var(--color-panel-border) ${perf.winRatePct}% 100%)`,
  };
  return (
    <Panel label={`Last ${perf.games} Games`}>
      <div className="mt-3 flex items-center gap-5">
        <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full" style={donutStyle}>
          <div className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-panel-2">
            <span className="text-base font-extrabold text-win">{perf.winRatePct}%</span>
            <span className="text-[9px] font-bold text-muted-foreground">
              {perf.wins}W {perf.losses}L
            </span>
          </div>
        </div>
        <div>
          <p className="text-lg font-extrabold text-foreground">
            {perf.kdaRatio === null ? '—' : `${perf.kdaRatio} KDA`}
          </p>
          <p className="text-xs font-bold text-muted-foreground">
            {perf.avgKills} / {perf.avgDeaths} / {perf.avgAssists}
            {perf.avgKillParticipationPct !== null && ` · P/Kill ${perf.avgKillParticipationPct}%`}
          </p>
          {perf.streak && perf.streak.count >= 2 && (
            <p className={`mt-1.5 text-xs font-extrabold ${perf.streak.result === 'win' ? 'text-win' : 'text-loss'}`}>
              {perf.streak.result === 'win' ? '▲' : '▼'} {perf.streak.count} {perf.streak.result} streak
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}
