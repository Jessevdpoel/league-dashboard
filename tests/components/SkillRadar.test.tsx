import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillRadar } from '@/components/analysis/SkillRadar';
import { radarData } from '@/lib/analysis/radarData';

describe('radarData', () => {
  it('maps all four categories in fixed order with labels', () => {
    expect(
      radarData({ laning: 61, vision: 44, fighting: 80, survivability: 55 })
    ).toEqual([
      { skill: 'Laning', score: 61 },
      { skill: 'Vision', score: 44 },
      { skill: 'Fighting', score: 80 },
      { skill: 'Survivability', score: 55 },
    ]);
  });

  it('returns null when any category is null (partial radar misleads)', () => {
    expect(
      radarData({ laning: 61, vision: null, fighting: 80, survivability: 55 })
    ).toBeNull();
  });
});

describe('SkillRadar', () => {
  it('renders the needs-more-data note when scores are incomplete', () => {
    render(
      <SkillRadar scores={{ laning: null, vision: null, fighting: null, survivability: null }} />
    );
    expect(screen.getByText(/needs benchmark data/i)).toBeInTheDocument();
  });
});
