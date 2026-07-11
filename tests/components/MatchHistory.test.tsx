import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

describe('MatchHistory', () => {
  it('renders one row per match', () => {
    const matches: MatchSummary[] = [
      {
        matchId: 'NA1_1',
        championName: 'Ahri',
        kills: 5,
        deaths: 2,
        assists: 8,
        win: true,
        items: [],
        summoner1Id: 4,
        summoner2Id: 7,
        durationSeconds: 1500,
        queueId: 420,
        gameCreation: 0,
        role: null,
        cs: null,
        badge: null,
      },
      {
        matchId: 'NA1_2',
        championName: 'Lux',
        kills: 2,
        deaths: 4,
        assists: 3,
        win: false,
        items: [],
        summoner1Id: 4,
        summoner2Id: 11,
        durationSeconds: 1800,
        queueId: 420,
        gameCreation: 0,
        role: null,
        cs: null,
        badge: null,
      },
    ];
    render(
      <MatchHistory matches={matches} version="14.23.1" basePath="/euw1/Test-EUW" analyzedIds={[]} />
    );
    // 4 filter pills + one row button per match.
    expect(screen.getAllByRole('button')).toHaveLength(4 + matches.length);
  });

  it('shows an empty state with no matches', () => {
    render(<MatchHistory matches={[]} version="14.23.1" basePath="/euw1/Test-EUW" analyzedIds={[]} />);
    expect(screen.getByText('No recent matches found.')).toBeInTheDocument();
  });

  it('marks a match as analyzed when its id is in analyzedIds', () => {
    const analyzedMatch: MatchSummary = {
      matchId: 'NA1_1',
      championName: 'Ahri',
      kills: 5,
      deaths: 2,
      assists: 8,
      win: true,
      items: [],
      summoner1Id: 4,
      summoner2Id: 7,
      durationSeconds: 1500,
      queueId: 420,
      gameCreation: 0,
      role: null,
      cs: null,
      badge: null,
    };
    render(
      <MatchHistory
        matches={[analyzedMatch]}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzedIds={['NA1_1']}
      />
    );
    expect(screen.getByRole('link', { name: /Analyzed/ })).toBeInTheDocument();
  });
});
