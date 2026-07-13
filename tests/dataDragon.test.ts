import { describe, it, expect, vi } from 'vitest';
import {
  getLatestDDragonVersion,
  championIconUrl,
  itemIconUrl,
  summonerSpellIconUrl,
  rankEmblemUrl,
  profileIconUrl,
} from '../lib/dataDragon';

describe('getLatestDDragonVersion', () => {
  it('returns the first entry from the versions endpoint', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ['14.23.1', '14.22.1'],
    }) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });

  it('falls back to a known-good version when the fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });

  it('falls back to a known-good version when the response is not ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    const version = await getLatestDDragonVersion(fetchImpl);
    expect(version).toBe('14.23.1');
  });
});

describe('championIconUrl', () => {
  it('builds the champion square icon URL', () => {
    expect(championIconUrl('14.23.1', 'Ahri')).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/champion/Ahri.png'
    );
  });
});

describe('itemIconUrl', () => {
  it('builds the item icon URL', () => {
    expect(itemIconUrl('14.23.1', 3157)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/item/3157.png'
    );
  });

  it('returns null for an empty item slot', () => {
    expect(itemIconUrl('14.23.1', 0)).toBeNull();
  });
});

describe('summonerSpellIconUrl', () => {
  it('builds the summoner spell icon URL for a known spell', () => {
    expect(summonerSpellIconUrl('14.23.1', 4)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.23.1/img/spell/SummonerFlash.png'
    );
  });

  it('returns null for an unknown spell id', () => {
    expect(summonerSpellIconUrl('14.23.1', 9999)).toBeNull();
  });
});

describe('rankEmblemUrl', () => {
  it('builds a local vendored emblem path with a lowercased tier', () => {
    expect(rankEmblemUrl('CHALLENGER')).toBe('/ranked-emblems/challenger.png');
  });
});

describe('profileIconUrl', () => {
  it('builds the ddragon profile icon URL', () => {
    expect(profileIconUrl('14.13.1', 685)).toBe(
      'https://ddragon.leagueoflegends.com/cdn/14.13.1/img/profileicon/685.png'
    );
  });
});
