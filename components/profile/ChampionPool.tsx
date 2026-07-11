import { bestChampionIndex, type ChampionPoolEntry } from '@/lib/matchStats';
import { championIconUrl } from '@/lib/dataDragon';
import { IconImg } from '@/components/IconImg';

export function ChampionPool({ pool, version }: { pool: ChampionPoolEntry[]; version: string }) {
  if (pool.length === 0) return null;
  const bestIdx = bestChampionIndex(pool);
  return (
    <section aria-label="Champion pool">
      <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-muted-foreground">
        Champion Pool · Recent
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {pool.map((champ, i) => {
          const isBest = i === bestIdx && champ.games >= 3;
          return (
            <li
              key={champ.championName}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                isBest
                  ? 'border-gold/50 bg-gradient-to-b from-gold/10 to-panel-2'
                  : 'border-panel-border bg-gradient-to-b from-panel to-panel-2'
              }`}
            >
              <IconImg
                src={championIconUrl(version, champ.championName)}
                alt={champ.championName}
                className={`h-9 w-9 flex-none rounded-lg border ${isBest ? 'border-gold/60' : 'border-panel-border'}`}
              />
              <div className="min-w-0">
                <p className="truncate text-xs font-extrabold text-foreground">
                  {champ.championName}
                  {isBest && <span className="ml-1.5 text-[9px] font-extrabold tracking-widest text-gold-light">★ BEST</span>}
                </p>
                <p className="text-[10px] font-bold text-muted-foreground">
                  {champ.games}g{champ.kda !== null && ` · ${champ.kda} KDA`}
                  {champ.csPerMin !== null && ` · ${champ.csPerMin} CS/m`}
                </p>
              </div>
              <span
                className={`ml-auto text-sm font-extrabold ${
                  champ.winRatePct >= 60 ? 'text-win' : champ.winRatePct < 45 ? 'text-loss' : 'text-muted-foreground'
                }`}
              >
                {champ.winRatePct}%
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
