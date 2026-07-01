import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { LeagueEntryDto } from './types';

export function getLeagueEntriesBySummonerId(
  platform: PlatformRegion,
  summonerId: string
): Promise<LeagueEntryDto[]> {
  const path = `/lol/league/v4/entries/by-summoner/${summonerId}`;
  return riotClient.platformFetch<LeagueEntryDto[]>(platform, path, { revalidateSeconds: 60 });
}
