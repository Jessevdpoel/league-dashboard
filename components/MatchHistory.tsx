'use client';

import { useState } from 'react';
import { filterByQueue, type MatchSummary, type QueueFilter } from '@/lib/matchStats';
import { MatchSummaryRow } from './MatchSummaryRow';

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'solo', label: 'Solo/Duo' },
  { key: 'flex', label: 'Flex' },
  { key: 'aram', label: 'ARAM' },
];

export interface MatchHistoryProps {
  matches: MatchSummary[];
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build per-match analysis links. */
  basePath: string;
  /** Match ids that already have a stored AI analysis. */
  analyzedIds: string[];
  /** Profile owner's puuid — their rows get highlighted in the detail view. */
  viewerPuuid: string;
}

export function MatchHistory({ matches, version, basePath, analyzedIds, viewerPuuid }: MatchHistoryProps) {
  const [filter, setFilter] = useState<QueueFilter>('all');
  const analyzed = new Set(analyzedIds);
  const visible = filterByQueue(matches, filter);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.18em] text-foreground">Matches</h2>
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-gold to-transparent" />
        <div className="flex gap-1.5">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
                filter === key
                  ? 'border-gold bg-gold text-black'
                  : 'border-panel-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {matches.length === 0 && <p className="text-foreground/80">No recent matches found.</p>}
      {matches.length > 0 && visible.length === 0 && (
        <p className="text-sm text-muted-foreground">No matches in this queue among the last {matches.length}.</p>
      )}
      <ul className="flex flex-col gap-2.5">
        {visible.map((m) => (
          <MatchSummaryRow
            key={m.matchId}
            summary={m}
            version={version}
            basePath={basePath}
            analyzed={analyzed.has(m.matchId)}
            viewerPuuid={viewerPuuid}
          />
        ))}
      </ul>
    </section>
  );
}
