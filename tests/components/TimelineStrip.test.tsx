import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { TimelineStrip } from '@/components/analysis/TimelineStrip';

describe('TimelineStrip', () => {
  it('renders nothing without a usable series', () => {
    const { container } = render(<TimelineStrip series={[]} deaths={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the section heading when a series exists', () => {
    const series = [
      { minute: 0, gold: 0 },
      { minute: 1, gold: 150 },
      { minute: 2, gold: -80 },
    ];
    const { getByText } = render(<TimelineStrip series={series} deaths={[]} />);
    expect(getByText(/gold lead vs lane opponent/i)).toBeInTheDocument();
  });
});
