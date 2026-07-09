/** Apex tiers are merged: their populations are too small for separate cohorts. */
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER']);

export const MASTER_PLUS = 'MASTER_PLUS';

export const COHORT_TIERS = [
  'IRON',
  'BRONZE',
  'SILVER',
  'GOLD',
  'PLATINUM',
  'EMERALD',
  'DIAMOND',
  MASTER_PLUS,
];

/** Normalize a Riot tier (LEAGUE-V4 `tier`) to its benchmark cohort tier. */
export function cohortTier(tier: string): string {
  const upper = tier.toUpperCase();
  return APEX_TIERS.has(upper) ? MASTER_PLUS : upper;
}

export function isBenchmarkableTier(tier: string): boolean {
  return COHORT_TIERS.includes(cohortTier(tier));
}

/** Numeric segment comparator for patch strings like "26.13" ("26.9" < "26.13"). */
export function comparePatches(a: string, b: string): number {
  const as = a.split('.').map(Number);
  const bs = b.split('.').map(Number);
  for (let i = 0; i < Math.max(as.length, bs.length); i++) {
    const diff = (as[i] ?? 0) - (bs[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
