/*
 * Pure rank-snapshot logic. DB wrappers live in lib/rankSnapshotsDb.ts; tests
 * exercise this module only (repo convention: decision logic is injected-pure).
 */

export interface RankPoint {
  tier: string;
  division: string;
  leaguePoints: number;
  recordedAt: Date;
}

const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'EMERALD', 'DIAMOND',
  'MASTER', 'GRANDMASTER', 'CHALLENGER',
];
const DIVISION_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 };

export function rankValue(point: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>): number {
  const tierIndex = Math.max(0, TIER_ORDER.indexOf(point.tier.toUpperCase()));
  const division = DIVISION_OFFSET[point.division.toUpperCase()] ?? 300;
  return tierIndex * 400 + division + point.leaguePoints;
}

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

export function shouldRecordSnapshot(
  latest: RankPoint | null,
  next: Pick<RankPoint, 'tier' | 'division' | 'leaguePoints'>,
  now: Date
): boolean {
  if (!latest) return true;
  if (utcDay(latest.recordedAt) !== utcDay(now)) return true;
  return (
    latest.tier !== next.tier ||
    latest.division !== next.division ||
    latest.leaguePoints !== next.leaguePoints
  );
}

export function dailyRankSeries(points: RankPoint[], days: number, now: Date): number[] {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const lastPerDay = new Map<string, RankPoint>();
  for (const point of [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) {
    if (point.recordedAt.getTime() < cutoff) continue;
    lastPerDay.set(utcDay(point.recordedAt), point);
  }
  return [...lastPerDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, point]) => rankValue(point));
}
