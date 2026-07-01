import { riotClient } from './client';
import { toRegionalRoute, type PlatformRegion } from './regions';
import type { AccountDto } from './types';

export function getAccountByRiotId(
  platform: PlatformRegion,
  gameName: string,
  tagLine: string
): Promise<AccountDto> {
  const path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`;
  return riotClient.fetch<AccountDto>(toRegionalRoute(platform), path, { revalidateSeconds: 3600 });
}
