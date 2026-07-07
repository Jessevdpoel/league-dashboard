import type { MatchSummary } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

export interface MatchHistoryProps {
  matches: MatchSummary[];
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build per-match analysis links. */
  basePath: string;
}

export function MatchHistory({ matches, version, basePath }: MatchHistoryProps) {
  if (matches.length === 0) {
    return <p className="text-frost-300">No recent matches found.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {matches.map((match) => (
        <MatchSummaryRow key={match.matchId} summary={match} version={version} basePath={basePath} />
      ))}
    </ul>
  );
}
