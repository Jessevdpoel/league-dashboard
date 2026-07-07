import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MatchSummaryRow } from '../../components/MatchSummaryRow';
import type { MatchSummary } from '../../lib/matchStats';

const summary: MatchSummary = {
  matchId: 'NA1_1',
  championName: 'Ahri',
  kills: 5,
  deaths: 2,
  assists: 8,
  win: true,
  items: [1, 2, 3, 4, 5, 6, 7],
  summoner1Id: 4,
  summoner2Id: 7,
  durationSeconds: 1530,
  queueId: 420,
  gameCreation: 0,
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        metadata: { matchId: 'NA1_1', participants: [] },
        info: { gameCreation: 0, gameDuration: 1530, queueId: 420, participants: [] },
      }),
    })
  );
});

describe('MatchSummaryRow', () => {
  it('shows the champion icon, KDA, and formatted duration', () => {
    render(<MatchSummaryRow summary={summary} version="14.23.1" basePath="/euw1/Test-EUW" />);
    expect(screen.getByAltText('Ahri')).toHaveAttribute(
      'src',
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
    expect(screen.getByText(/5\/2\/8/)).toBeInTheDocument();
    expect(screen.getByText(/25:30/)).toBeInTheDocument();
    expect(screen.getByText(/Victory/)).toBeInTheDocument();
  });

  it('fetches and shows the full scoreboard when expanded', async () => {
    render(<MatchSummaryRow summary={summary} version="14.23.1" basePath="/euw1/Test-EUW" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/matches/NA1_1'));
    await waitFor(() => expect(screen.getByText('Blue Team')).toBeInTheDocument());
  });
});
