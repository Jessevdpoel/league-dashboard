import type { ChampionStat } from '@/lib/matchStats';
import { championIconUrl } from '@/lib/dataDragon';
import { IconImg } from './IconImg';

export interface TopChampionsCardProps {
  champions: ChampionStat[];
  version: string;
}

export function TopChampionsCard({ champions, version }: TopChampionsCardProps) {
  return (
    <section aria-label="Top champions" className="rounded-lg bg-card border border-border p-5">
      <p className="text-xs uppercase tracking-wide text-accent-foreground font-semibold">Top Champions</p>
      <ul className="mt-2 flex flex-col gap-2">
        {champions.map((champion) => {
          const winRate = champion.games === 0 ? 0 : Math.round((champion.wins / champion.games) * 100);
          return (
            <li key={champion.championName} className="flex items-center gap-2 text-sm">
              <IconImg
                src={championIconUrl(version, champion.championName)}
                alt={champion.championName}
                className="w-8 h-8 rounded-md border border-border"
              />
              <span className="text-foreground/80 font-semibold flex-1">{champion.championName}</span>
              <span className="text-muted-foreground">
                {champion.games} games · {winRate}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
