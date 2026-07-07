import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { MatchDto, MatchTimelineDto } from './types';

/** Common ranked queue IDs. */
export const QUEUE_RANKED_SOLO = 420;
export const QUEUE_RANKED_FLEX = 440;

export interface MatchIdsQuery {
  start?: number;
  count?: number;
  /** Riot queue id, e.g. 420 (ranked solo). Omit to include all queues. */
  queue?: number;
}

/**
 * Recent match IDs for a PUUID. The profile page omits `queue` (all queues);
 * the analysis pipeline passes `queue: 420` and `count: 20` to get ranked solo.
 */
export function getMatchIdsByPuuid(
  platform: PlatformRegion,
  puuid: string,
  query: MatchIdsQuery = {}
): Promise<string[]> {
  const { start = 0, count = 10, queue } = query;
  const params = new URLSearchParams({ start: String(start), count: String(count) });
  if (queue !== undefined) {
    params.set('queue', String(queue));
  }
  const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?${params.toString()}`;
  return riotClient.regionalFetch<string[]>(platform, path, { revalidateSeconds: 60 });
}

export function getMatchById(platform: PlatformRegion, matchId: string): Promise<MatchDto> {
  const path = `/lol/match/v5/matches/${matchId}`;
  return riotClient.regionalFetch<MatchDto>(platform, path, { revalidateSeconds: 86_400 });
}

/**
 * Full minute-by-minute timeline for a match. Largest Match-V5 payload, so only
 * fetch it for matches the user requests deep analysis on. Run as a background
 * job: full exponential backoff on 429 (up to 3 retries).
 */
export function getMatchTimeline(
  platform: PlatformRegion,
  matchId: string
): Promise<MatchTimelineDto> {
  const path = `/lol/match/v5/matches/${matchId}/timeline`;
  return riotClient.regionalFetch<MatchTimelineDto>(platform, path, {
    revalidateSeconds: 86_400,
    retry: { maxRetries: 3 },
  });
}
