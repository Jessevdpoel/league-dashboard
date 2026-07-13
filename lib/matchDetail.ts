import type { LeagueEntryDto, MatchDto } from '@/lib/riot/types';
import { gradeMatch, type MatchGrades } from '@/lib/matchGrade';

export interface RankSummary {
  tier: string;
  division: string;
}

export interface MatchDetailPayload {
  match: MatchDto;
  grades: MatchGrades;
  /** puuid → solo-queue rank; null when unranked or the lookup failed. */
  ranks: Record<string, RankSummary | null>;
}

export type LeagueFetcher = (puuid: string) => Promise<LeagueEntryDto[]>;

/**
 * Assembles the scoreboard payload. Rank lookups are best-effort: any
 * rejection becomes null for that player — the scoreboard must render
 * without ranks rather than fail because of them.
 */
export async function buildMatchDetailPayload(
  match: MatchDto,
  fetchLeague: LeagueFetcher | null
): Promise<MatchDetailPayload> {
  const grades = gradeMatch(match);
  const puuids = match.info.participants.map((p) => p.puuid);
  const ranks: Record<string, RankSummary | null> = Object.fromEntries(
    puuids.map((puuid) => [puuid, null])
  );

  if (fetchLeague) {
    const settled = await Promise.allSettled(puuids.map((puuid) => fetchLeague(puuid)));
    settled.forEach((result, i) => {
      if (result.status !== 'fulfilled') return;
      const solo = result.value.find((entry) => entry.queueType === 'RANKED_SOLO_5x5');
      if (solo) ranks[puuids[i]] = { tier: solo.tier, division: solo.rank };
    });
  }

  return { match, grades, ranks };
}
