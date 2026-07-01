import type { MatchSummary } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

export interface MatchHistoryProps {
  matches: MatchSummary[];
}

export function MatchHistory({ matches }: MatchHistoryProps) {
  if (matches.length === 0) {
    return <p className="text-gold-300">No recent matches found.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {matches.map((match) => (
        <MatchSummaryRow key={match.matchId} summary={match} />
      ))}
    </ul>
  );
}
