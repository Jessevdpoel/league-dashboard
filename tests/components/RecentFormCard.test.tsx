import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RecentFormCard } from '../../components/RecentFormCard';

describe('RecentFormCard', () => {
  it('summarizes wins, losses, and win rate', () => {
    render(<RecentFormCard results={[true, true, false, true, false]} />);
    expect(screen.getByText('3W 2L')).toBeInTheDocument();
    expect(screen.getByText('60% over last 5 games')).toBeInTheDocument();
  });

  it('handles an empty result set without dividing by zero', () => {
    render(<RecentFormCard results={[]} />);
    expect(screen.getByText('0W 0L')).toBeInTheDocument();
    expect(screen.getByText('0% over last 0 games')).toBeInTheDocument();
  });
});
