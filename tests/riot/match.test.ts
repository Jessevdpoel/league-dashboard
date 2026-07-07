import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getMatchIdsByPuuid, getMatchById, getMatchTimeline } from '../../lib/riot/match';

vi.mock('../../lib/riot/client', () => ({
  riotClient: {
    regionalFetch: vi.fn().mockResolvedValue(['NA1_1', 'NA1_2']),
  },
}));

describe('getMatchIdsByPuuid', () => {
  it('requests the regional match-ids-by-puuid endpoint with count', async () => {
    const result = await getMatchIdsByPuuid('na1', 'abc', { count: 10 });
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
    expect(result).toEqual(['NA1_1', 'NA1_2']);
  });

  it('defaults start=0 and count=10 when no query is provided', async () => {
    await getMatchIdsByPuuid('na1', 'abc');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/by-puuid/abc/ids?start=0&count=10',
      { revalidateSeconds: 60 }
    );
  });

  it('adds a queue filter and honours count when analysing ranked games', async () => {
    await getMatchIdsByPuuid('euw1', 'xyz', { count: 20, queue: 420 });
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'euw1',
      '/lol/match/v5/matches/by-puuid/xyz/ids?start=0&count=20&queue=420',
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

describe('getMatchTimeline', () => {
  it('requests the timeline endpoint with background-job retry/backoff', async () => {
    (riotClient.regionalFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      metadata: { matchId: 'NA1_1', participants: [] },
      info: { frameInterval: 60_000, frames: [], participants: [] },
    });
    const result = await getMatchTimeline('na1', 'NA1_1');
    expect(riotClient.regionalFetch).toHaveBeenCalledWith(
      'na1',
      '/lol/match/v5/matches/NA1_1/timeline',
      { revalidateSeconds: 86_400, retry: { maxRetries: 3 } }
    );
    expect(result.info.frameInterval).toBe(60_000);
  });
});
