import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MatchSummaryRow } from '../../components/MatchSummaryRow';
import type { MatchSummary } from '../../lib/matchStats';
import type { MatchDetailPayload } from '../../lib/matchDetail';

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
  role: 'MIDDLE',
  cs: 180,
  badge: 'PENTA KILL',
};

const detailPayload: MatchDetailPayload = {
  match: {
    metadata: { matchId: 'NA1_1', participants: [] },
    info: { gameCreation: 0, gameDuration: 1530, queueId: 420, participants: [] },
  },
  grades: { byPuuid: {} },
  ranks: {},
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => detailPayload,
    })
  );
});

describe('MatchSummaryRow', () => {
  it('shows the champion icon, KDA, and formatted duration', () => {
    render(
      <MatchSummaryRow
        summary={summary}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={false}
        viewerPuuid="viewer-puuid"
      />
    );
    expect(screen.getByAltText('Ahri')).toHaveAttribute(
      'src',
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
    expect(screen.getByText(/5 \/.*8/)).toBeInTheDocument();
    expect(screen.getByText(/25:30/)).toBeInTheDocument();
    expect(screen.getByText(/Victory/)).toBeInTheDocument();
  });

  it('shows the role badge abbreviation, CS, and performance badge', () => {
    render(
      <MatchSummaryRow
        summary={summary}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={false}
        viewerPuuid="viewer-puuid"
      />
    );
    expect(screen.getByText('MID')).toBeInTheDocument();
    expect(screen.getByText(/180 CS/)).toBeInTheDocument();
    expect(screen.getByText('PENTA KILL')).toBeInTheDocument();
  });

  it('falls back to the raw role string for an unrecognized role', () => {
    const oddRole: MatchSummary = { ...summary, role: 'WEIRD' };
    render(
      <MatchSummaryRow
        summary={oddRole}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={false}
        viewerPuuid="viewer-puuid"
      />
    );
    expect(screen.getByText('WEIRD')).toBeInTheDocument();
  });

  it('shows an Analyze CTA when unanalyzed and an Analyzed CTA when analyzed', () => {
    const { rerender } = render(
      <MatchSummaryRow
        summary={summary}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={false}
        viewerPuuid="viewer-puuid"
      />
    );
    expect(screen.getByRole('link', { name: /Analyze/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Analyzed/ })).not.toBeInTheDocument();

    rerender(
      <MatchSummaryRow
        summary={summary}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={true}
        viewerPuuid="viewer-puuid"
      />
    );
    expect(screen.getByRole('link', { name: /Analyzed/ })).toBeInTheDocument();
  });

  it('fetches and shows the full face-off detail when expanded', async () => {
    render(
      <MatchSummaryRow
        summary={summary}
        version="14.23.1"
        basePath="/euw1/Test-EUW"
        analyzed={false}
        viewerPuuid="viewer-puuid"
      />
    );
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/matches/NA1_1?ranks=1'));
    await waitFor(() => expect(screen.getByText(/Blue side/)).toBeInTheDocument());
  });
});
