import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TopChampionsCard } from '../../components/TopChampionsCard';

describe('TopChampionsCard', () => {
  it('lists each champion with games played and win rate', () => {
    render(
      <TopChampionsCard
        champions={[
          { championName: 'Ahri', games: 4, wins: 3 },
          { championName: 'Lux', games: 2, wins: 0 },
        ]}
      />
    );
    expect(screen.getByText('4 games · 75%')).toBeInTheDocument();
    expect(screen.getByText('2 games · 0%')).toBeInTheDocument();
  });
});
