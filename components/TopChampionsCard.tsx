import type { ChampionStat } from '@/lib/matchStats';

export interface TopChampionsCardProps {
  champions: ChampionStat[];
}

export function TopChampionsCard({ champions }: TopChampionsCardProps) {
  return (
    <section aria-label="Top champions" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Top Champions</p>
      <ul className="mt-2 flex flex-col gap-2">
        {champions.map((champion) => {
          const winRate = champion.games === 0 ? 0 : Math.round((champion.wins / champion.games) * 100);
          return (
            <li key={champion.championName} className="flex justify-between text-sm">
              <span>{champion.championName}</span>
              <span>
                {champion.games} games · {winRate}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
