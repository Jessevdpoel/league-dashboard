'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { MatchSummary } from '@/lib/matchStats';
import type { MatchDto } from '@/lib/riot/types';
import { championIconUrl, itemIconUrl } from '@/lib/dataDragon';
import { MatchScoreboard } from './MatchScoreboard';

export interface MatchSummaryRowProps {
  summary: MatchSummary;
  version: string;
  /** Profile base path (e.g. `/euw1/Faker-KR1`) used to build the analysis link. */
  basePath: string;
  /** Whether a stored AI analysis already exists for this match. */
  analyzed: boolean;
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function relativeTime(epochMs: number): string {
  const hours = Math.floor((Date.now() - epochMs) / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ROLE_LABEL: Record<string, string> = {
  TOP: 'TOP', JUNGLE: 'JG', MIDDLE: 'MID', BOTTOM: 'BOT', UTILITY: 'SUP',
};

export function MatchSummaryRow({ summary, version, basePath, analyzed }: MatchSummaryRowProps) {
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
      setDetail((await response.json()) as MatchDto);
    } catch {
      setError('Could not load full match detail. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <li>
      <div className="flex items-stretch gap-2">
        <button
          onClick={handleToggle}
          className={`relative flex flex-1 items-center gap-3.5 overflow-hidden rounded-xl border bg-gradient-to-b from-panel to-panel-2 p-3 text-left before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${
            summary.win ? 'border-win/25 before:bg-win' : 'border-loss/25 before:bg-loss'
          }`}
        >
          <span className="relative flex-none">
            <img
              src={championIconUrl(version, summary.championName)}
              alt={summary.championName}
              className="h-11 w-11 rounded-lg border border-panel-border"
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
            {summary.role && (
              <span className="absolute -bottom-1.5 -right-1.5 rounded border border-panel-border bg-panel-2 px-1 text-[8px] font-extrabold text-muted-foreground">
                {ROLE_LABEL[summary.role] ?? summary.role}
              </span>
            )}
          </span>
          <span className="w-24 flex-none">
            <span className={`block text-[11px] font-extrabold uppercase tracking-widest ${summary.win ? 'text-win' : 'text-loss'}`}>
              {summary.win ? 'Victory' : 'Defeat'}
            </span>
            <span className="block text-[10px] font-bold text-muted-foreground" suppressHydrationWarning>
              {formatDuration(summary.durationSeconds)} · {relativeTime(summary.gameCreation)}
            </span>
          </span>
          <span className="w-24 flex-none">
            <span className="block text-sm font-extrabold text-foreground">
              {summary.kills} / <span className="text-loss">{summary.deaths}</span> / {summary.assists}
            </span>
            {summary.cs !== null && (
              <span className="block text-[10px] font-bold text-muted-foreground">
                {summary.cs} CS · {(summary.cs / (summary.durationSeconds / 60)).toFixed(1)}/m
              </span>
            )}
          </span>
          {summary.badge && (
            <span className="flex-none rounded bg-gradient-to-r from-gold-light to-gold px-2 py-0.5 text-[10px] font-extrabold text-black">
              {summary.badge}
            </span>
          )}
          <span className="ml-auto flex gap-1">
            {summary.items.map((itemId, index) => {
              const url = itemIconUrl(version, itemId);
              if (!url) return null;
              return (
                <img
                  key={index}
                  src={url}
                  alt=""
                  className="h-6 w-6 rounded border border-panel-border"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              );
            })}
          </span>
        </button>
        <Link
          href={`${basePath}/match/${summary.matchId}/analysis`}
          className={`flex items-center rounded-xl border px-3.5 text-xs font-extrabold ${
            analyzed
              ? 'border-panel-border bg-panel-2 text-muted-foreground'
              : 'border-gold/45 bg-gold/5 text-gold-light hover:border-gold/70'
          }`}
        >
          {analyzed ? '✓ Analyzed' : '✦ Analyze'}
        </Link>
      </div>
      {expanded && (
        <div className="mt-2">
          {loading && <p className="text-sm text-muted-foreground">Loading full match...</p>}
          {error && (
            <p role="alert" className="text-sm text-loss">
              {error}
            </p>
          )}
          {detail && <MatchScoreboard match={detail} version={version} />}
        </div>
      )}
    </li>
  );
}
