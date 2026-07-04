import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getLeagueEntriesByPuuid } from '../../lib/riot/league';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    platformFetch: vi.fn().mockResolvedValue([
      { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 },
    ]),
  },
}));

describe('getLeagueEntriesByPuuid', () => {
  it('requests the platform league-entries-by-puuid endpoint', async () => {
    const result = await getLeagueEntriesByPuuid('na1', 'abc-puuid');
    expect(riotClient.platformFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/league/v4/entries/by-puuid/abc-puuid',
      { revalidateSeconds: 60 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('GOLD');
  });
});
