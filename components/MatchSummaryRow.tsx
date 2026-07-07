'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { championIconUrl, itemIconUrl, summonerSpellIconUrl } from '@/lib/dataDragon';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build the analysis link. */
  basePath: string;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function MatchSummaryRow({ summary, version, basePath }: MatchSummaryRowProps) {
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
    <li className="relative pl-6 border-l-2 border-line-strong">
      <div className="flex items-stretch gap-2">
      <button
        onClick={handleToggle}
        className={`flex-1 text-left rounded-lg p-3 flex items-center gap-3 border ${
          summary.win ? 'bg-win/10 border-win/30' : 'bg-loss/10 border-loss/25'
        }`}
      >
        <img
          src={championIconUrl(version, summary.championName)}
          alt={summary.championName}
          className="w-11 h-11 rounded-md border border-line-strong"
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
        <div className="flex flex-col gap-0.5">
          {[summary.summoner1Id, summary.summoner2Id].map((spellId, index) => {
            const url = summonerSpellIconUrl(version, spellId);
            if (!url) return null;
            return <img key={index} src={url} alt="" className="w-[18px] h-[18px] rounded" onError={(event) => {
              event.currentTarget.style.display = 'none';
            }} />;
          })}
        </div>
        <span className="text-sm text-frost-300 font-semibold">
          {summary.kills}/{summary.deaths}/{summary.assists}
        </span>
        <span className="text-sm text-frost-500">{formatDuration(summary.durationSeconds)}</span>
        <span className={`text-sm font-bold ${summary.win ? 'text-win' : 'text-loss'}`}>
          {summary.win ? 'Victory' : 'Defeat'}
        </span>
        <span className="flex-1" />
        <div className="flex gap-1">
          {summary.items.map((itemId, index) => {
            const url = itemIconUrl(version, itemId);
            if (!url) return null;
            return (
              <img
                key={index}
                src={url}
                alt=""
                className="w-[26px] h-[26px] rounded border border-line-strong"
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            );
          })}
        </div>
      </button>
        <Link
          href={`${basePath}/match/${summary.matchId}/analysis`}
          className="flex items-center rounded-lg border border-cyan-400/40 bg-cyan-400/5 px-3 text-sm font-bold text-cyan-400 hover:border-cyan-400/70"
        >
          Analyze
        </Link>
      </div>
      {expanded && (
        <div className="mt-2">
          {loading && <p className="text-frost-500 text-sm">Loading full match...</p>}
          {error && (
            <p role="alert" className="text-loss text-sm">
              {error}
            </p>
          )}
          {detail && <MatchScoreboard match={detail} version={version} />}
        </div>
      )}
    </li>
  );
}
