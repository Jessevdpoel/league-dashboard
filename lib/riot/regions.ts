export type PlatformRegion = 'na1' | 'euw1' | 'eun1' | 'kr' | 'jp1' | 'br1';
export type RegionalRoute = 'americas' | 'europe' | 'asia';

export const PLATFORM_REGIONS: PlatformRegion[] = ['na1', 'euw1', 'eun1', 'kr', 'jp1', 'br1'];

const PLATFORM_TO_REGIONAL: Record<PlatformRegion, RegionalRoute> = {
  na1: 'americas',
  br1: 'americas',
  euw1: 'europe',
  eun1: 'europe',
  kr: 'asia',
  jp1: 'asia',
};

export function isPlatformRegion(value: string): value is PlatformRegion {
  return (PLATFORM_REGIONS as string[]).includes(value);
}

export function toRegionalRoute(platform: PlatformRegion): RegionalRoute {
  return PLATFORM_TO_REGIONAL[platform];
}

export function platformFromMatchId(matchId: string): PlatformRegion {
  const prefix = matchId.split('_')[0]?.toLowerCase();
  if (!prefix || !isPlatformRegion(prefix)) {
    throw new Error(`Cannot determine platform region from match id: ${matchId}`);
  }
  return prefix;
}
