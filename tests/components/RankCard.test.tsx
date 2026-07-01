import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankCard } from '../../components/RankCard';

describe('RankCard', () => {
  it('renders tier, rank, and win rate when ranked', () => {
    render(
      <RankCard
        entry={{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 }}
      />
    );
    expect(screen.getByText('GOLD II')).toBeInTheDocument();
    expect(screen.getByText('6W 4L (60% win rate)')).toBeInTheDocument();
  });

  it('renders Unranked when no entry is provided', () => {
    render(<RankCard entry={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
  });
});
