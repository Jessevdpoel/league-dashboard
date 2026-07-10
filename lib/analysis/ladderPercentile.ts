/*
 * Static approximation of the ranked-ladder distribution (share of players ABOVE
 * the bottom of each tier+division, %). Presentational only — the chip renders
 * with a "~" prefix. Refresh the numbers once per season from public
 * distribution stats; exactness is not a goal.
 */
const TOP_SHARE: Record<string, number> = {
  'CHALLENGER I': 0.02,
  'GRANDMASTER I': 0.06,
  'MASTER I': 0.5,
  'DIAMOND I': 1.0, 'DIAMOND II': 1.7, 'DIAMOND III': 2.8, 'DIAMOND IV': 4.5,
  'EMERALD I': 7, 'EMERALD II': 10, 'EMERALD III': 13, 'EMERALD IV': 18,
  'PLATINUM I': 22, 'PLATINUM II': 26, 'PLATINUM III': 31, 'PLATINUM IV': 37,
  'GOLD I': 43, 'GOLD II': 49, 'GOLD III': 55, 'GOLD IV': 62,
  'SILVER I': 68, 'SILVER II': 74, 'SILVER III': 79, 'SILVER IV': 84,
  'BRONZE I': 88, 'BRONZE II': 91, 'BRONZE III': 94, 'BRONZE IV': 96,
  'IRON I': 97.5, 'IRON II': 98.6, 'IRON III': 99.3, 'IRON IV': 99.9,
};

export function ladderPercentile(tier: string, division: string): number | null {
  return TOP_SHARE[`${tier.toUpperCase()} ${division.toUpperCase()}`] ?? null;
}

export function formatLadderChip(tier: string, division: string): string | null {
  const share = ladderPercentile(tier, division);
  return share === null ? null : `Top ~${share}%`;
}
