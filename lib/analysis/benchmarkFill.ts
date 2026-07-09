import type { MatchDto, MatchTimelineDto } from '../riot/types';
import type { PlatformRegion } from '../riot/regions';
import { aggregateCohort, type BenchmarkRow, type CohortFactRow } from './benchmarkAggregate';
import { extractMatchFacts, type ParticipantFactsRow } from './participantFacts';

export const FILL_TARGET_MATCHES = 40;
export const DEFAULT_TICK_BUDGET = 50;
export const MAX_ATTEMPTS = 5;
export const SEED_PLAYERS = 10;

export interface FillJobRow {
  id: string;
  patch: string;
  rankTier: string;
  region: PlatformRegion;
  seedPuuids: string[];
  pendingMatchIds: string[];
  processedCount: number;
}

/** Riot reads the fill needs — one budget unit per call. Real impl: benchmarkDb.ts. */
export interface RiotFetcher {
  ladderPuuids(region: PlatformRegion, rankTier: string): Promise<string[]>;
  matchIds(region: PlatformRegion, puuid: string): Promise<string[]>;
  match(region: PlatformRegion, matchId: string): Promise<MatchDto>;
  timeline(region: PlatformRegion, matchId: string): Promise<MatchTimelineDto>;
}

export interface CohortStat {
  patch: string;
  rankTier: string;
  factCount: number;
  /**
   * Fact count at the last aggregation, measured as SUM(sampleN) over the
   * cohort's 'deaths' benchmark rows — deaths is defined for every participant,
   * so that sum equals the fact count the aggregate was built from. 0 = never.
   */
  benchmarkedCount: number;
}

/** Persistence the fill needs. Real impl: benchmarkDb.ts; tests inject fakes. */
export interface FillStore {
  claimNextJob(): Promise<FillJobRow | null>;
  saveCursor(
    id: string,
    cursor: { seedPuuids?: string[]; pendingMatchIds: string[]; processedCount: number }
  ): Promise<void>;
  finishJob(id: string): Promise<void>;
  recordAttemptFailure(id: string, maxAttempts: number): Promise<void>;
  hasFacts(matchId: string): Promise<boolean>;
  saveFacts(rows: ParticipantFactsRow[]): Promise<void>;
  factsForCohort(patch: string, rankTier: string): Promise<CohortFactRow[]>;
  saveBenchmarks(rows: BenchmarkRow[]): Promise<void>;
  cohortStats(): Promise<CohortStat[]>;
}

export interface FillTickResult {
  jobId: string;
  requestsUsed: number;
  matchesProcessed: number;
  finished: boolean;
}

/**
 * One resumable chunk of a cohort fill: claim the oldest job, spend up to
 * `budget` Riot requests, persist the cursor after every match, aggregate once
 * at the end, finish when the queue empties. Errors mark an attempt failure and
 * keep all cursor progress. Returns null when no job is waiting.
 */
export async function processFillTick(deps: {
  store: FillStore;
  riot: RiotFetcher;
  budget?: number;
}): Promise<FillTickResult | null> {
  const { store, riot, budget = DEFAULT_TICK_BUDGET } = deps;
  const job = await store.claimNextJob();
  if (!job) return null;

  let used = 0;
  let processed = 0;

  try {
    let pending = job.pendingMatchIds;

    if (job.seedPuuids.length === 0) {
      const seeds = (await riot.ladderPuuids(job.region, job.rankTier)).slice(0, SEED_PLAYERS);
      used += 1;
      const ids = new Set<string>();
      for (const puuid of seeds) {
        if (used >= budget) break;
        for (const id of await riot.matchIds(job.region, puuid)) ids.add(id);
        used += 1;
      }
      pending = [];
      for (const id of ids) {
        if (pending.length >= FILL_TARGET_MATCHES) break;
        if (!(await store.hasFacts(id))) pending.push(id);
      }
      await store.saveCursor(job.id, {
        seedPuuids: seeds,
        pendingMatchIds: pending,
        processedCount: 0,
      });
    }

    while (pending.length > 0 && used + 2 <= budget) {
      const matchId = pending[0];
      const match = await riot.match(job.region, matchId);
      used += 1;
      const timeline = await riot.timeline(job.region, matchId);
      used += 1;
      // Filtered-out matches (wrong queue, remake) yield [] but still leave the queue.
      const rows = extractMatchFacts(match, timeline, { patch: job.patch, rankTier: job.rankTier });
      if (rows.length > 0) await store.saveFacts(rows);
      pending = pending.slice(1);
      processed += 1;
      await store.saveCursor(job.id, {
        pendingMatchIds: pending,
        processedCount: job.processedCount + processed,
      });
    }

    if (processed > 0) {
      const facts = await store.factsForCohort(job.patch, job.rankTier);
      await store.saveBenchmarks(aggregateCohort(job.patch, job.rankTier, facts));
    }

    const finished = pending.length === 0;
    if (finished) await store.finishJob(job.id);
    return { jobId: job.id, requestsUsed: used, matchesProcessed: processed, finished };
  } catch (error) {
    console.error(`benchmark fill ${job.id} (${job.patch} ${job.rankTier}) failed mid-tick —`, error);
    await store.recordAttemptFailure(job.id, MAX_ATTEMPTS);
    return { jobId: job.id, requestsUsed: used, matchesProcessed: processed, finished: false };
  }
}

/**
 * Re-aggregate cohorts whose organic fact corpus outgrew the published
 * benchmarks: ≥30 facts and never aggregated, or grown ≥25% since the last
 * aggregation. Costs zero Riot requests. Returns the number swept.
 */
export async function sweepDirtyCohorts(store: FillStore): Promise<number> {
  let swept = 0;
  for (const stat of await store.cohortStats()) {
    if (stat.factCount < 30) continue;
    const grown =
      stat.benchmarkedCount === 0 || stat.factCount >= Math.ceil(stat.benchmarkedCount * 1.25);
    if (!grown) continue;
    const facts = await store.factsForCohort(stat.patch, stat.rankTier);
    await store.saveBenchmarks(aggregateCohort(stat.patch, stat.rankTier, facts));
    swept += 1;
  }
  return swept;
}
