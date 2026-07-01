'use client';

import { useState } from 'react';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function MatchSummaryRow({ summary }: MatchSummaryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<MatchDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (detail) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/matches/${summary.matchId}`);
      if (!response.ok) throw new Error('Failed to load match detail');
      const data = (await response.json()) as MatchDto;
      setDetail(data);
    } catch {
      setError('Could not load full match detail. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="relative pl-6 border-l-2 border-gold-700">
      <button
        onClick={handleToggle}
        className={`w-full text-left rounded-md p-3 ${summary.win ? 'bg-emerald-950' : 'bg-red-950'}`}
      >
        <span className="font-semibold">{summary.championName}</span>{' '}
        <span>
          {summary.kills}/{summary.deaths}/{summary.assists}
        </span>{' '}
        <span>{formatDuration(summary.durationSeconds)}</span> <span>{summary.win ? 'Victory' : 'Defeat'}</span>
      </button>
      {expanded && (
        <div className="mt-2">
          {loading && <p>Loading full match...</p>}
          {error && <p role="alert">{error}</p>}
          {detail && <MatchScoreboard match={detail} />}
        </div>
      )}
    </li>
  );
}
