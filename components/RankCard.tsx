import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';
import { IconImg } from './IconImg';

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg bg-card border border-border p-5">
        <p className="text-xs uppercase tracking-wide text-accent-foreground font-semibold">Ranked Solo</p>
        <p className="text-xl font-bold text-foreground mt-1">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);

  return (
    <section
      aria-label="Ranked stats"
      className="rounded-lg bg-card border border-border p-5 flex items-center gap-4"
    >
      <IconImg
        src={rankEmblemUrl(entry.tier)}
        alt={`${entry.tier} emblem`}
        className="w-14 h-14"
      />
      <div>
        <p className="text-xs uppercase tracking-wide text-accent-foreground font-semibold">Ranked Solo</p>
        <p className="text-xl font-bold text-foreground mt-1">
          {entry.tier} {entry.rank}
        </p>
        <p className="text-sm text-muted-foreground font-semibold">{entry.leaguePoints} LP</p>
        <p className="text-sm text-muted-foreground font-semibold">
          {entry.wins}W {entry.losses}L ({winRate}% win rate)
        </p>
      </div>
    </section>
  );
}
