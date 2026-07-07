import type { MetricCategory } from './metrics';

/**
 * Role-relative importance of each scoring category (Mobalytics-style): vision
 * matters most for support/jungle, laning/farming for mid/ADC, etc. Kept as data
 * (not code) so it can be tuned without a code change. Weights need not sum to 1;
 * they are relative and used to prioritise findings and pick the focus category.
 */
export type Role = 'TOP' | 'JUNGLE' | 'MIDDLE' | 'BOTTOM' | 'UTILITY';

export const ROLE_WEIGHTS: Record<Role, Record<MetricCategory, number>> = {
  TOP: { laning: 1.2, vision: 0.6, fighting: 1.0, survivability: 1.1 },
  JUNGLE: { laning: 0.7, vision: 1.2, fighting: 1.1, survivability: 1.0 },
  MIDDLE: { laning: 1.2, vision: 0.8, fighting: 1.1, survivability: 1.0 },
  BOTTOM: { laning: 1.2, vision: 0.7, fighting: 1.2, survivability: 1.0 },
  UTILITY: { laning: 0.6, vision: 1.4, fighting: 0.9, survivability: 1.0 },
};

const DEFAULT_WEIGHTS: Record<MetricCategory, number> = {
  laning: 1,
  vision: 1,
  fighting: 1,
  survivability: 1,
};

export function weightsForRole(role: string | undefined): Record<MetricCategory, number> {
  if (role && role in ROLE_WEIGHTS) {
    return ROLE_WEIGHTS[role as Role];
  }
  return DEFAULT_WEIGHTS;
}
