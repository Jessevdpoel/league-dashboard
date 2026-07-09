import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { LeagueEntryDto, LeagueListDto } from './types';

export function getLeagueEntriesByPuuid(
  platform: PlatformRegion,
  puuid: string
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 60 });
}

export type LeagueDivision = 'I' | 'II' | 'III' | 'IV';

/**
 * One page of the ranked-solo ladder for a tier/division (IRON…DIAMOND).
 * Used to sample benchmark crawl seeds; cached an hour — seed freshness is
 * irrelevant, any current-tier players will do.
 */
export function getLeagueEntriesByTier(
  platform: PlatformRegion,
  tier: string,
  division: LeagueDivision = 'II',
  page = 1
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/RANKED_SOLO_5x5/${tier}/${division}?page=${page}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 3600 });
}

/** The master league — seed source for the merged MASTER_PLUS cohort. */
export function getMasterLeague(platform: PlatformRegion): Promise<LeagueListDto> {
  const path = `/lol/league/v4/masterleagues/by-queue/RANKED_SOLO_5x5`;
  return riotClient.platformFetch<LeagueListDto>(platform, path, { revalidateSeconds: 3600 });
}
