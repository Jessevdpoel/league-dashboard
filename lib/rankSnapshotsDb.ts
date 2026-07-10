import { prisma } from '@/lib/db';
import type { LeagueEntryDto } from '@/lib/riot/types';
import { dailyRankSeries, shouldRecordSnapshot } from '@/lib/rankHistory';

/*
 * Thin Prisma wrappers around lib/rankHistory.ts decisions (repo convention:
 * DB wrappers stay untested; logic lives in the pure module).
 */

const TRACKED_QUEUES = new Set(['RANKED_SOLO_5x5', 'RANKED_FLEX_SR']);

/** Fire-and-forget from the profile view's after() block: never throws. */
export async function recordRankSnapshots(puuid: string, entries: LeagueEntryDto[]): Promise<void> {
  try {
    const now = new Date();
    for (const entry of entries) {
      if (!TRACKED_QUEUES.has(entry.queueType)) continue;
      const latest = await prisma.rankSnapshot.findFirst({
        where: { puuid, queueType: entry.queueType },
        orderBy: { recordedAt: 'desc' },
      });
      const next = { tier: entry.tier, division: entry.rank, leaguePoints: entry.leaguePoints };
      const latestPoint = latest
        ? { tier: latest.tier, division: latest.division, leaguePoints: latest.leaguePoints, recordedAt: latest.recordedAt }
        : null;
      if (shouldRecordSnapshot(latestPoint, next, now)) {
        await prisma.rankSnapshot.create({
          data: { puuid, queueType: entry.queueType, ...next },
        });
      }
    }
  } catch (error) {
    console.error('rank snapshot recording failed (non-fatal) —', error);
  }
}

export async function getSoloRankSeries(puuid: string, days = 30): Promise<number[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.rankSnapshot.findMany({
    where: { puuid, queueType: 'RANKED_SOLO_5x5', recordedAt: { gte: cutoff } },
    orderBy: { recordedAt: 'asc' },
  });
  return dailyRankSeries(
    rows.map((r) => ({ tier: r.tier, division: r.division, leaguePoints: r.leaguePoints, recordedAt: r.recordedAt })),
    days,
    new Date()
  );
}
