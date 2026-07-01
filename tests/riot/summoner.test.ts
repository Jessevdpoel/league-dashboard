import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getSummonerByPuuid } from '../../lib/riot/summoner';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    platformFetch: vi.fn().mockResolvedValue({ id: 'sid', accountId: 'aid', puuid: 'abc', profileIconId: 1, summonerLevel: 200 }),
  },
}));

describe('getSummonerByPuuid', () => {
  it('requests the platform summoner-by-puuid endpoint', async () => {
    const result = await getSummonerByPuuid('na1', 'abc');
    expect(riotClient.platformFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/summoner/v4/summoners/by-puuid/abc',
      { revalidateSeconds: 60 }
    );
    expect(result.summonerLevel).toBe(200);
  });
});
