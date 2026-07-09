import { Prisma, type BenchmarkJob } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getLeagueEntriesByTier, getMasterLeague, type LeagueDivision } from '@/lib/riot/league';
import { getMatchById, getMatchIdsByPuuid, getMatchTimeline, QUEUE_RANKED_SOLO } from '@/lib/riot/match';
import { isPlatformRegion, type PlatformRegion } from '@/lib/riot/regions';
import type { BenchmarkRow, CohortFactRow } from './benchmarkAggregate';
import type { BenchmarkReader, CohortKey } from './benchmarkStore';
import type { CohortStat, FillJobRow, FillStore, RiotFetcher } from './benchmarkFill';
import type { ParticipantFactsRow } from './participantFacts';
import { comparePatches, MASTER_PLUS } from './cohort';

/*
 * Prisma + Riot implementations of the interfaces the pure benchmark modules
 * define. Repo convention (see analysisStore.ts): DB wrappers stay thin and
 * untested — all decision logic lives in the injected-dependency modules.
 */

// --- RiotFetcher -------------------------------------------------------------

const DIVISIONS: LeagueDivision[] = ['I', 'II', 'III', 'IV'];
const MATCHES_PER_SEED = 5;

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const riotFetcher: RiotFetcher = {
  async ladderPuuids(region, rankTier) {
    if (rankTier === MASTER_PLUS) {
      const league = await getMasterLeague(region);
      return shuffled(league.entries).map((e) => e.puuid);
    }
    const division = DIVISIONS[Math.floor(Math.random() * DIVISIONS.length)];
    const entries = await getLeagueEntriesByTier(region, rankTier, division);
    return shuffled(entries)
      .map((e) => e.puuid)
      .filter((p): p is string => Boolean(p));
  },
  matchIds: (region, puuid) =>
    getMatchIdsByPuuid(region, puuid, { queue: QUEUE_RANKED_SOLO, count: MATCHES_PER_SEED }),
  match: (region, matchId) => getMatchById(region, matchId),
  timeline: (region, matchId) => getMatchTimeline(region, matchId),
};

// --- FillStore ---------------------------------------------------------------

function toFillJobRow(job: BenchmarkJob): FillJobRow {
  const region: PlatformRegion = isPlatformRegion(job.region) ? job.region : 'euw1';
  return {
    id: job.id,
    patch: job.patch,
    rankTier: job.rankTier,
    region,
    seedPuuids: (job.seedPuuids as string[]) ?? [],
    pendingMatchIds: (job.pendingMatchIds as string[]) ?? [],
    processedCount: job.processedCount,
  };
}

export const prismaFillStore: FillStore = {
  async claimNextJob() {
    const job = await prisma.benchmarkJob.findFirst({
      where: { status: { in: ['pending', 'running'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (!job) return null;
    await prisma.benchmarkJob.update({ where: { id: job.id }, data: { status: 'running' } });
    return toFillJobRow(job);
  },

  async saveCursor(id, cursor) {
    await prisma.benchmarkJob.update({
      where: { id },
      data: {
        ...(cursor.seedPuuids !== undefined && {
          seedPuuids: cursor.seedPuuids as Prisma.InputJsonValue,
        }),
        pendingMatchIds: cursor.pendingMatchIds as Prisma.InputJsonValue,
        processedCount: cursor.processedCount,
      },
    });
  },

  async finishJob(id) {
    await prisma.benchmarkJob.update({ where: { id }, data: { status: 'done' } });
  },

  async recordAttemptFailure(id, maxAttempts) {
    const job = await prisma.benchmarkJob.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
    await prisma.benchmarkJob.update({
      where: { id },
      data: { status: job.attempts >= maxAttempts ? 'failed' : 'pending' },
    });
  },

  async hasFacts(matchId) {
    const row = await prisma.participantFacts.findFirst({
      where: { matchId },
      select: { matchId: true },
    });
    return row !== null;
  },

  async saveFacts(rows) {
    await prisma.participantFacts.createMany({
      data: rows.map((r) => ({ ...r, metrics: r.metrics as Prisma.InputJsonValue })),
      skipDuplicates: true,
    });
  },

  async factsForCohort(patch, rankTier) {
    const rows = await prisma.participantFacts.findMany({
      where: { patch, rankTier },
      select: { role: true, metrics: true },
    });
    return rows as unknown as CohortFactRow[];
  },

  async saveBenchmarks(rows) {
    await prisma.$transaction(
      rows.map((r) =>
        prisma.benchmark.upsert({
          where: {
            patch_rankTier_role_metricName: {
              patch: r.patch,
              rankTier: r.rankTier,
              role: r.role,
              metricName: r.metricName,
            },
          },
          create: r,
          update: { p25: r.p25, p50: r.p50, p75: r.p75, p90: r.p90, sampleN: r.sampleN },
        })
      )
    );
  },

  async cohortStats(): Promise<CohortStat[]> {
    const facts = await prisma.participantFacts.groupBy({
      by: ['patch', 'rankTier'],
      _count: { _all: true },
    });
    const benches = await prisma.benchmark.groupBy({
      by: ['patch', 'rankTier'],
      where: { metricName: 'deaths' },
      _sum: { sampleN: true },
    });
    const benchedByCohort = new Map(
      benches.map((b) => [`${b.patch} ${b.rankTier}`, b._sum.sampleN ?? 0])
    );
    return facts.map((f) => ({
      patch: f.patch,
      rankTier: f.rankTier,
      factCount: f._count._all,
      benchmarkedCount: benchedByCohort.get(`${f.patch} ${f.rankTier}`) ?? 0,
    }));
  },
};

// --- BenchmarkReader ----------------------------------------------------------

export const prismaBenchmarkReader: BenchmarkReader = {
  async exactRows(cohort: CohortKey) {
    return prisma.benchmark.findMany({
      where: { patch: cohort.patch, rankTier: cohort.rankTier, role: cohort.role },
    });
  },

  async previousPatchRows(cohort: CohortKey) {
    // Small table (≤ tiers × roles × metrics × patches); filter/sort in memory.
    const rows = await prisma.benchmark.findMany({
      where: { rankTier: cohort.rankTier, role: cohort.role, patch: { not: cohort.patch } },
    });
    const older = rows.filter((r) => comparePatches(r.patch, cohort.patch) < 0);
    if (older.length === 0) return [];
    const newest = older.reduce((a, b) => (comparePatches(a.patch, b.patch) >= 0 ? a : b)).patch;
    return older.filter((r) => r.patch === newest);
  },
};

// --- Enqueue / job status / organic persistence --------------------------------

const FAILED_RETRY_MS = 24 * 60 * 60 * 1000;

/**
 * Create-if-not-exists enqueue for a cohort fill. Fire-and-forget from the page
 * render path: every failure (including unique-key races) is logged and
 * swallowed — a missed enqueue self-heals on the next page view.
 */
export async function enqueueBenchmarkJob(input: {
  patch: string;
  rankTier: string;
  region: string;
}): Promise<void> {
  try {
    const existing = await prisma.benchmarkJob.findUnique({
      where: { job_cohort_key: { patch: input.patch, rankTier: input.rankTier } },
    });
    if (!existing) {
      await prisma.benchmarkJob.create({ data: input });
      return;
    }
    const staleFailed =
      existing.status === 'failed' &&
      Date.now() - existing.updatedAt.getTime() > FAILED_RETRY_MS;
    if (staleFailed) {
      await prisma.benchmarkJob.update({
        where: { id: existing.id },
        data: {
          status: 'pending',
          attempts: 0,
          seedPuuids: [],
          pendingMatchIds: [],
          processedCount: 0,
        },
      });
    }
  } catch (error) {
    console.error('enqueueBenchmarkJob failed (non-fatal) —', error);
  }
}

export async function hasActiveBenchmarkJob(patch: string, rankTier: string): Promise<boolean> {
  const job = await prisma.benchmarkJob.findUnique({
    where: { job_cohort_key: { patch, rankTier } },
    select: { status: true },
  });
  return job !== null && (job.status === 'pending' || job.status === 'running');
}

/** Organic corpus write from the analysis page. Idempotent; caller catches errors. */
export async function saveParticipantFacts(rows: ParticipantFactsRow[]): Promise<void> {
  if (rows.length === 0) return;
  await prisma.participantFacts.createMany({
    data: rows.map((r) => ({ ...r, metrics: r.metrics as Prisma.InputJsonValue })),
    skipDuplicates: true,
  });
}
