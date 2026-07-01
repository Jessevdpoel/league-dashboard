import { riotClient } from './client';
import type { PlatformRegion } from './regions';
import type { SummonerDto } from './types';

export function getSummonerByPuuid(platform: PlatformRegion, puuid: string): Promise<SummonerDto> {
  const path = `/lol/summoner/v4/summoners/by-puuid/${puuid}`;
  return riotClient.platformFetch<SummonerDto>(platform, path, { revalidateSeconds: 60 });
}
