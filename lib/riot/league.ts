import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { LeagueEntryDto } from './types';

export function getLeagueEntriesByPuuid(
  platform: PlatformRegion,
  puuid: string
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/by-puuid/${puuid}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 60 });
}
