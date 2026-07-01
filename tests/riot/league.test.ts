import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getLeagueEntriesBySummonerId } from '../../lib/riot/league';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    platformFetch: vi.fn().mockResolvedValue([
      { queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 42, wins: 6, losses: 4 },
    ]),
  },
}));

describe('getLeagueEntriesBySummonerId', () => {
  it('requests the platform league-entries-by-summoner endpoint', async () => {
    const result = await getLeagueEntriesBySummonerId('na1', 'sid');
    expect(riotClient.platformFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/league/v4/entries/by-summoner/sid',
      { revalidateSeconds: 60 }
    );
    expect(result).toHaveLength(1);
    expect(result[0].tier).toBe('GOLD');
  });
});
