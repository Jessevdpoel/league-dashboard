import type { LeagueEntryDto } from '@/lib/riot/types';

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
        <p className="text-sm uppercase tracking-wide text-gold-400">Ranked Solo</p>
        <p className="text-xl font-display">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);

  return (
    <section aria-label="Ranked stats" className="rounded-lg bg-charcoal-800 p-5 text-gold-100">
      <p className="text-sm uppercase tracking-wide text-gold-400">Ranked Solo</p>
      <p className="text-xl font-display">
        {entry.tier} {entry.rank}
      </p>
      <p className="text-sm">{entry.leaguePoints} LP</p>
      <p className="text-sm">
        {entry.wins}W {entry.losses}L ({winRate}% win rate)
      </p>
    </section>
  );
}
