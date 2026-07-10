import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachStrip } from '../../components/profile/CoachStrip';

describe('CoachStrip', () => {
  it('renders nothing when there are no insights', () => {
    const { container } = render(<CoachStrip insights={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders one chip per insight with the AI Coach badge', () => {
    render(
      <CoachStrip
        insights={[
          { kind: 'lever', message: 'CS at 10 sits at the ~20th percentile for DIAMOND — your biggest lever', good: false },
          { kind: 'strength', message: 'Damage/min sits at the ~90th percentile for DIAMOND', good: true },
        ]}
      />
    );
    expect(screen.getByText('AI Coach')).toBeInTheDocument();
    expect(screen.getByText(/biggest lever/)).toBeInTheDocument();
    expect(screen.getByText(/~90th percentile/)).toBeInTheDocument();
  });
});
