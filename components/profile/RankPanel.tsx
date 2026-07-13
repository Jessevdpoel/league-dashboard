import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';
import { Panel } from './Panel';

const APEX = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

function titleCase(tier: string): string {
  return tier.charAt(0) + tier.slice(1).toLowerCase();
}

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) {
    return (
      <p className="mt-3 text-[10px] font-semibold text-muted-foreground">
        LP trend — collecting data, check back in a few days
      </p>
    );
  }
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = Math.max(max - min, 1);
  const barWidth = 100 / series.length;
  return (
    <svg viewBox="0 0 100 24" className="mt-3 h-8 w-full" aria-label="LP trend, last 30 days">
      {series.map((value, i) => {
        const height = 4 + ((value - min) / span) * 20;
        const isLast = i === series.length - 1;
        return (
          <rect
            key={i}
            x={i * barWidth + 0.5}
            y={24 - height}
            width={barWidth - 1}
            height={height}
            rx={0.8}
            className={isLast ? 'fill-gold' : 'fill-muted-foreground/40'}
          />
        );
      })}
    </svg>
  );
}

function entryLine(entry: LeagueEntryDto): string {
  const games = entry.wins + entry.losses;
  const winRate = games === 0 ? 0 : Math.round((entry.wins / games) * 100);
  return `${entry.wins}W ${entry.losses}L · ${winRate}%`;
}

export function RankPanel({
  solo,
  flex,
  sparkSeries,
}: {
  solo: LeagueEntryDto | null;
  flex: LeagueEntryDto | null;
  sparkSeries: number[];
}) {
  return (
    <Panel label="Ranked Solo">
      {solo ? (
        <>
          <div className="mt-3 flex items-center gap-4">
            <IconImg src={rankEmblemUrl(solo.tier)} alt={`${solo.tier} emblem`} className="h-14 w-14" />
            <div>
              <p className="text-xl font-extrabold text-foreground">
                {titleCase(solo.tier)} {APEX.has(solo.tier) ? '' : solo.rank}
              </p>
              <p className="text-xs font-bold text-muted-foreground">{solo.leaguePoints} LP</p>
            </div>
          </div>
          <p className="mt-3 flex justify-between text-xs font-bold text-muted-foreground">
            <span>{entryLine(solo)}</span>
          </p>
          <Sparkline series={sparkSeries} />
        </>
      ) : (
        <p className="mt-2 text-xl font-extrabold text-foreground">Unranked</p>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-dashed border-panel-border pt-3 text-xs font-bold">
        <span className="text-muted-foreground">Ranked Flex</span>
        {flex ? (
          <span className="flex items-center gap-1.5">
            <IconImg src={rankEmblemUrl(flex.tier)} alt={`${flex.tier} emblem`} className="h-5 w-5" />
            <span className="text-foreground">
              {titleCase(flex.tier)} {APEX.has(flex.tier) ? '' : flex.rank} · {flex.leaguePoints} LP
            </span>
            <span className="text-muted-foreground">· {entryLine(flex)}</span>
          </span>
        ) : (
          <span className="text-foreground">Unranked</span>
        )}
      </div>
    </Panel>
  );
}
