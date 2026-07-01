import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

describe('MatchHistory', () => {
  it('renders one row per match', () => {
    const matches: MatchSummary[] = [
      { matchId: 'NA1_1', championName: 'Ahri', kills: 5, deaths: 2, assists: 8, win: true, items: [], durationSeconds: 1500, queueId: 420, gameCreation: 0 },
      { matchId: 'NA1_2', championName: 'Lux', kills: 2, deaths: 4, assists: 3, win: false, items: [], durationSeconds: 1800, queueId: 420, gameCreation: 0 },
    ];
    render(<MatchHistory matches={matches} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('shows an empty state with no matches', () => {
    render(<MatchHistory matches={[]} />);
    expect(screen.getByText('No recent matches found.')).toBeInTheDocument();
  });
});
