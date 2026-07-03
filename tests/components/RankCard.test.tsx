import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankCard } from '../../components/RankCard';

describe('RankCard', () => {
  it('renders tier, rank, win rate, and a rank emblem when ranked', () => {
    render(
      <RankCard
        entry={{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 }}
      />
    );
    expect(screen.getByText('GOLD II')).toBeInTheDocument();
    expect(screen.getByText('6W 4L (60% win rate)')).toBeInTheDocument();
    expect(screen.getByAltText('GOLD emblem')).toHaveAttribute(
      'src',
      'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-gold.png'
    );
  });

  it('renders Unranked with no emblem image when no entry is provided', () => {
    render(<RankCard entry={null} />);
    expect(screen.getByText('Unranked')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
