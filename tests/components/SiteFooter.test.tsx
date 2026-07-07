import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SiteFooter } from '../../components/SiteFooter';

describe('SiteFooter', () => {
  it('renders the required Riot Games not-endorsed disclaimer', () => {
    render(<SiteFooter />);
    expect(screen.getByText(/isn't endorsed by Riot Games/i)).toBeInTheDocument();
    expect(
      screen.getByText(/trademarks or registered trademarks of Riot Games/i)
    ).toBeInTheDocument();
  });

  it('is a contentinfo landmark', () => {
    render(<SiteFooter />);
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});
