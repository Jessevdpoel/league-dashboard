import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { MatchDto } from './types';

export function getMatchIdsByPuuid(
  platform: PlatformRegion,
  puuid: string,
  count = 10
): Promise<string[]> {
  const path = `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}`;
  return riotClient.regionalFetch<string[]>(platform, path, { revalidateSeconds: 60 });
}

export function getMatchById(platform: PlatformRegion, matchId: string): Promise<MatchDto> {
  const path = `/lol/match/v5/matches/${matchId}`;
  return riotClient.regionalFetch<MatchDto>(platform, path, { revalidateSeconds: 86_400 });
}
