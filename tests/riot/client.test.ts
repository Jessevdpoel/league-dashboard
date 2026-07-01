import { describe, it, expect, vi } from 'vitest';
import { RiotClient, RiotApiError, RiotRateLimitedError } from '../../lib/riot/client';
import { CompositeRateLimiter, TokenBucket } from '../../lib/riot/rateLimiter';

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

describe('RiotClient', () => {
  it('returns parsed JSON on success', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(200, { hello: 'world' }),
      () => 'fake-key'
    );
    const result = await client.platformFetch('na1', '/some/path', { revalidateSeconds: 60 });
    expect(result).toEqual({ hello: 'world' });
  });

  it('throws RiotApiError with status 404 when not found', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(404, {}),
      () => 'fake-key'
    );
    await expect(
      client.platformFetch('na1', '/missing', { revalidateSeconds: 60 })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('throws RiotRateLimitedError when the local bucket is exhausted', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(1, 1000, 0)]),
      fakeFetch(200, {}),
      () => 'fake-key'
    );
    await client.platformFetch('na1', '/a', { revalidateSeconds: 60 });
    await expect(
      client.platformFetch('na1', '/b', { revalidateSeconds: 60 })
    ).rejects.toBeInstanceOf(RiotRateLimitedError);
  });

  it('throws RiotRateLimitedError when Riot responds 429', async () => {
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fakeFetch(429, {}),
      () => 'fake-key'
    );
    await expect(
      client.platformFetch('na1', '/a', { revalidateSeconds: 60 })
    ).rejects.toBeInstanceOf(RiotRateLimitedError);
  });

  it('regionalFetch resolves the platform to its regional route', async () => {
    const fetchImpl = fakeFetch(200, {});
    const client = new RiotClient(
      new CompositeRateLimiter([new TokenBucket(10, 1000, 0)]),
      fetchImpl,
      () => 'fake-key'
    );
    await client.regionalFetch('na1', '/lol/match/v5/matches/NA1_1', { revalidateSeconds: 60 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://americas.api.riotgames.com/lol/match/v5/matches/NA1_1',
      expect.any(Object)
    );
  });
});
