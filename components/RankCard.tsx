import type { LeagueEntryDto } from '@/lib/riot/types';
import { rankEmblemUrl } from '@/lib/dataDragon';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { IconImg } from './IconImg';

/** Tier accent colors follow official rank palettes, not the theme. */
const TIER_CLASS: Record<string, string> = {
  IRON: 'border-zinc-500/50 text-zinc-400',
  BRONZE: 'border-orange-700/50 text-orange-400',
  SILVER: 'border-slate-400/50 text-slate-300',
  GOLD: 'border-yellow-500/50 text-yellow-400',
  PLATINUM: 'border-teal-400/50 text-teal-300',
  EMERALD: 'border-emerald-400/50 text-emerald-300',
  DIAMOND: 'border-sky-400/50 text-sky-300',
  MASTER: 'border-purple-400/50 text-purple-300',
  GRANDMASTER: 'border-red-400/50 text-red-300',
  CHALLENGER: 'border-amber-300/50 text-amber-200',
};

export interface RankCardProps {
  entry: LeagueEntryDto | null;
}

export function RankCard({ entry }: RankCardProps) {
  if (!entry) {
    return (
      <section aria-label="Ranked stats" className="rounded-lg border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Ranked Solo</p>
        <p className="mt-1 text-xl font-bold text-foreground">Unranked</p>
      </section>
    );
  }

  const totalGames = entry.wins + entry.losses;
  const winRate = totalGames === 0 ? 0 : Math.round((entry.wins / totalGames) * 100);
  const apexTier = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(entry.tier);
  // Below Master, promotion sits at 100 LP; apex tiers have no LP cap.
  const lpProgress = apexTier ? null : Math.min(entry.leaguePoints, 100);

  return (
    <section
      aria-label="Ranked stats"
      className="flex items-center gap-4 rounded-lg border border-border bg-card p-5"
    >
      <IconImg src={rankEmblemUrl(entry.tier)} alt={`${entry.tier} emblem`} className="h-14 w-14" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-foreground">Ranked Solo</p>
          <Badge variant="outline" className={TIER_CLASS[entry.tier] ?? 'text-foreground'}>
            {entry.tier} {apexTier ? '' : entry.rank}
          </Badge>
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-muted-foreground">{entry.leaguePoints} LP</p>
          <p className="text-sm font-semibold text-muted-foreground">
            {entry.wins}W {entry.losses}L · <span className={winRate >= 50 ? 'text-win' : 'text-loss'}>{winRate}%</span>
          </p>
        </div>
        {lpProgress !== null && (
          <Progress
            value={lpProgress}
            className="mt-2 h-1.5"
            aria-label={`${entry.leaguePoints} of 100 LP to promotion`}
          />
        )}
      </div>
    </section>
  );
}
