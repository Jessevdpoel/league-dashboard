import { describe, it, expect } from 'vitest';
import {
  processFillTick,
  sweepDirtyCohorts,
  FILL_TARGET_MATCHES,
  type FillStore,
  type FillJobRow,
  type RiotFetcher,
  type CohortStat,
} from '../../lib/analysis/benchmarkFill';
import type { MatchDto, MatchTimelineDto, ParticipantDto } from '../../lib/riot/types';
import type { CohortFactRow } from '../../lib/analysis/benchmarkAggregate';

// --- Fixtures ---------------------------------------------------------------

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function mkParticipant(i: number, matchId: string): ParticipantDto {
  return {
    puuid: `${matchId}-p${i}`,
    riotIdGameName: `Player${i}`, riotIdTagline: 'EUW',
    championName: 'Ahri', championId: 103,
    kills: i, deaths: 2, assists: 3, win: i < 5, teamId: i < 5 ? 100 : 200,
    teamPosition: ROLES[i % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 12, totalDamageDealtToChampions: 10_000, visionScore: 20,
    champLevel: 15, goldEarned: 10_000, totalDamageTaken: 15_000,
    challenges: { laneMinionsFirst10Minutes: 60 },
  };
}

function mkMatch(matchId: string, queueId = 420): MatchDto {
  const participants = Array.from({ length: 10 }, (_, i) => mkParticipant(i, matchId));
  return {
    metadata: { matchId, participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId, participants },
  };
}

function mkTimeline(matchId: string): MatchTimelineDto {
  return {
    metadata: { matchId, participants: [] },
    info: {
      frameInterval: 60_000,
      frames: [{ timestamp: 0, participantFrames: {}, events: [] }],
      participants: Array.from({ length: 10 }, (_, i) => ({
        participantId: i + 1,
        puuid: `${matchId}-p${i}`,
      })),
    },
  };
}

function mkJob(over: Partial<FillJobRow> = {}): FillJobRow {
  return {
    id: 'job1', patch: '26.13', rankTier: 'GOLD', region: 'euw1',
    seedPuuids: [], pendingMatchIds: [], processedCount: 0,
    ...over,
  };
}

interface StoreState {
  cursors: { seedPuuids?: string[]; pendingMatchIds: string[]; processedCount: number }[];
  savedFacts: string[];
  benchmarkSaves: number;
  finished: boolean;
  failures: number;
}

/** In-memory FillStore capturing all writes. */
function mkStore(
  job: FillJobRow | null,
  knownMatches = new Set<string>()
): { store: FillStore; state: StoreState } {
  const state: StoreState = {
    cursors: [],
    savedFacts: [],
    benchmarkSaves: 0,
    finished: false,
    failures: 0,
  };
  const store: FillStore = {
    claimNextJob: async () => job,
    saveCursor: async (_id, cursor) => { state.cursors.push(cursor); },
    finishJob: async () => { state.finished = true; },
    recordAttemptFailure: async () => { state.failures++; },
    hasFacts: async (matchId) => knownMatches.has(matchId),
    saveFacts: async (rows) => { state.savedFacts.push(...rows.map((r) => r.matchId)); },
    factsForCohort: async (): Promise<CohortFactRow[]> =>
      Array.from({ length: 35 }, (_, i) => ({ role: 'MIDDLE', metrics: { csAt10: i } })),
    saveBenchmarks: async () => { state.benchmarkSaves++; },
    cohortStats: async () => [],
  };
  return { store, state };
}

function mkRiot(over: Partial<RiotFetcher> = {}): RiotFetcher {
  return {
    ladderPuuids: async () => Array.from({ length: 10 }, (_, i) => `seed${i}`),
    matchIds: async (_r, puuid) => [`M_${puuid}_1`, `M_${puuid}_2`],
    match: async (_r, id) => mkMatch(id),
    timeline: async (_r, id) => mkTimeline(id),
    ...over,
  };
}

// --- Tests -------------------------------------------------------------------

describe('processFillTick', () => {
  it('returns null when there is no job to claim', async () => {
    const { store } = mkStore(null);
    expect(await processFillTick({ store, riot: mkRiot() })).toBeNull();
  });

  it('seeds from the ladder: dedupes, drops known matches, caps the queue', async () => {
    const { store, state } = mkStore(mkJob(), new Set(['M_seed0_1']));
    const riot = mkRiot({
      // Every player returns the same 45 ids -> dedupe to 45, minus 1 known, cap 40.
      matchIds: async () => Array.from({ length: 45 }, (_, i) => `M_seed0_${i + 1}`),
    });
    await processFillTick({ store, riot, budget: 11 }); // 1 ladder + 10 id lists, nothing left for matches
    const seeded = state.cursors[0];
    expect(seeded.seedPuuids).toHaveLength(10);
    expect(seeded.pendingMatchIds).toHaveLength(FILL_TARGET_MATCHES);
    expect(seeded.pendingMatchIds).not.toContain('M_seed0_1');
  });

  it('spends the budget 2-per-match and persists the cursor after every match', async () => {
    const pending = Array.from({ length: 10 }, (_, i) => `M_${i}`);
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: pending }));
    const result = await processFillTick({ store, riot: mkRiot(), budget: 9 });
    // budget 9 -> 4 matches (8 requests); the 9th request cannot start a match.
    expect(result).toMatchObject({ requestsUsed: 8, matchesProcessed: 4, finished: false });
    expect(state.cursors).toHaveLength(4);
    expect(state.cursors.at(-1)).toMatchObject({ pendingMatchIds: pending.slice(4), processedCount: 4 });
    expect(state.savedFacts).toHaveLength(4 * 10);
  });

  it('publishes aggregated benchmarks once per tick that processed matches', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1', 'M_2'] }));
    await processFillTick({ store, riot: mkRiot(), budget: 50 });
    expect(state.benchmarkSaves).toBe(1);
  });

  it('finishes the job when the queue empties', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1'] }));
    const result = await processFillTick({ store, riot: mkRiot(), budget: 50 });
    expect(result?.finished).toBe(true);
    expect(state.finished).toBe(true);
  });

  it('counts filtered-out matches as processed so they leave the queue', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1'] }));
    const riot = mkRiot({ match: async (_r, id) => mkMatch(id, 440) }); // wrong queue
    const result = await processFillTick({ store, riot, budget: 50 });
    expect(result?.finished).toBe(true);
    expect(state.savedFacts).toHaveLength(0);
  });

  it('records an attempt failure and keeps prior cursor progress on mid-tick errors', async () => {
    const { store, state } = mkStore(mkJob({ seedPuuids: ['s'], pendingMatchIds: ['M_1', 'M_2'] }));
    let calls = 0;
    const riot = mkRiot({
      match: async (_r, id) => {
        if (++calls === 2) throw new Error('riot 500');
        return mkMatch(id);
      },
    });
    const result = await processFillTick({ store, riot, budget: 50 });
    expect(result?.finished).toBe(false);
    expect(state.failures).toBe(1);
    expect(state.cursors).toHaveLength(1); // first match's progress survived
  });
});

describe('sweepDirtyCohorts', () => {
  function statsStore(stats: CohortStat[]) {
    const { store, state } = mkStore(null);
    store.cohortStats = async () => stats;
    return { store, state };
  }

  it('re-aggregates never-benchmarked cohorts once they have 30+ facts', async () => {
    const { store, state } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 35, benchmarkedCount: 0 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(1);
    expect(state.benchmarkSaves).toBe(1);
  });

  it('skips cohorts that have not grown 25% since last aggregation', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 400, benchmarkedCount: 350 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(0);
  });

  it('re-aggregates cohorts that grew 25%+', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 500, benchmarkedCount: 350 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(1);
  });

  it('ignores cohorts under the 30-fact floor', async () => {
    const { store } = statsStore([
      { patch: '26.13', rankTier: 'GOLD', factCount: 20, benchmarkedCount: 0 },
    ]);
    expect(await sweepDirtyCohorts(store)).toBe(0);
  });
});
