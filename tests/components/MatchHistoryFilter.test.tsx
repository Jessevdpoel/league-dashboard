import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MatchHistory } from '../../components/MatchHistory';
import type { MatchSummary } from '../../lib/matchStats';

function summary(matchId: string, queueId: number): MatchSummary {
  return {
    matchId, championName: 'Aatrox', kills: 1, deaths: 1, assists: 1, win: true,
    items: [], summoner1Id: 4, summoner2Id: 14, durationSeconds: 1800,
    queueId, gameCreation: Date.now(), role: null, cs: null, badge: null,
  };
}

describe('MatchHistory queue filters', () => {
  it('shows the empty-state line when a filter matches nothing', () => {
    render(
      <MatchHistory
        matches={[summary('a', 420)]}
        version="14.13.1"
        basePath="/euw1/x-y"
        analyzedIds={[]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'ARAM' }));
    expect(screen.getByText(/No matches in this queue/)).toBeInTheDocument();
  });
});
