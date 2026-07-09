import { summonerSpellKey } from './riot/summonerSpells';

const FALLBACK_VERSION = '14.23.1';
const DDRAGON_BASE = 'https://ddragon.leagueoflegends.com';
const COMMUNITY_DRAGON_BASE = 'https://raw.communitydragon.org/latest';

export async function getLatestDDragonVersion(fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetchImpl(`${DDRAGON_BASE}/api/versions.json`, {
      next: { revalidate: 86_400 },
    } as RequestInit);
    if (!response.ok) return FALLBACK_VERSION;
    const versions = (await response.json()) as string[];
    return versions[0] ?? FALLBACK_VERSION;
  } catch {
    return FALLBACK_VERSION;
  }
}

export function championIconUrl(version: string, championName: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${championName}.png`;
}

export function itemIconUrl(version: string, itemId: number): string | null {
  if (itemId === 0) return null;
  return `${DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`;
}

export function summonerSpellIconUrl(version: string, spellId: number): string | null {
  const key = summonerSpellKey(spellId);
  if (!key) return null;
  return `${DDRAGON_BASE}/cdn/${version}/img/spell/${key}.png`;
}

export function rankEmblemUrl(tier: string): string {
  return `${COMMUNITY_DRAGON_BASE}/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblems/emblem-${tier.toLowerCase()}.png`;
}

/** DDragon version (e.g. 14.13.1) -> patch (14.13) used to key benchmarks. */
export function patchFromVersion(version: string): string {
  return version.split('.').slice(0, 2).join('.');
}
