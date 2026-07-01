import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getMatchIdsByPuuid, getMatchById } from '../../lib/riot/match';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    regionalFetch: vi.fn().mockResolvedValue(['NA1_1', 'NA1_2']),
  },
}));

describe('getMatchIdsByPuuid', () => {
  it('requests the regional match-ids-by-puuid endpoint with count', async () => {
    const result = await getMatchIdsByPuuid('na1', 'abc', 10);
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
    expect(result).toEqual(['NA1_1', 'NA1_2']);
  });

  it('defaults count to 10 when not provided', async () => {
    await getMatchIdsByPuuid('na1', 'abc');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
  });
});

describe('getMatchById', () => {
  it('requests the regional match detail endpoint with a long cache TTL', async () => {
    (riotClient.regionalFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      metadata: { matchId: 'NA1_1', participants: [] },
      info: { gameCreation: 0, gameDuration: 0, queueId: 420, participants: [] },
    });
    const result = await getMatchById('na1', 'NA1_1');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/NA1_1',
      { revalidateSeconds: 86_400 }
    );
    expect(result.metadata.matchId).toBe('NA1_1');
  });
});
