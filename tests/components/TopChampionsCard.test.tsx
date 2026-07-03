import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopChampionsCard } from '../../components/TopChampionsCard';

describe('TopChampionsCard', () => {
  it('lists each champion with an icon, games played, and win rate', () => {
    render(
      <TopChampionsCard
        version="14.23.1"
        champions={[
          { championName: 'Ahri', games: 4, wins: 3 },
          { championName: 'Lux', games: 2, wins: 0 },
        ]}
      />
    );
    expect(screen.getByText('4 games · 75%')).toBeInTheDocument();
    expect(screen.getByText('2 games · 0%')).toBeInTheDocument();
    expect(screen.getByAltText('Ahri')).toHaveAttribute(
      'src',
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
  });
});
