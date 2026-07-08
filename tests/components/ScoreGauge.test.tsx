import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreGauge } from '@/components/analysis/ScoreGauge';

describe('ScoreGauge', () => {
  it('renders the score value and label', () => {
    render(<ScoreGauge score={72} label="Match score" />);
    expect(screen.getByText('72')).toBeInTheDocument();
    expect(screen.getByText('Match score')).toBeInTheDocument();
  });

  it('is announced as a meter with the score value', () => {
    render(<ScoreGauge score={72} />);
    const meter = screen.getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '72');
    expect(meter).toHaveAttribute('aria-valuemin', '0');
    expect(meter).toHaveAttribute('aria-valuemax', '100');
  });

  it('renders an em dash and no meter when score is null', () => {
    render(<ScoreGauge score={null} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByRole('meter')).toBeNull();
  });
});
