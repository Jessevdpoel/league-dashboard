import { describe, it, expect, vi } from 'vitest';
import { riotClient } from '../../lib/riot/client';
import { getAccountByRiotId } from '../../lib/riot/account';

vi.mock('../../lib/riot/client', () => ({
  riotClient: { fetch: vi.fn().mockResolvedValue({ puuid: 'abc', gameName: 'Foo', tagLine: 'NA1' }) },
}));

describe('getAccountByRiotId', () => {
  it('requests the regional account endpoint with the encoded name and tag', async () => {
    const result = await getAccountByRiotId('na1', 'Foo Bar', 'NA1');
    expect(riotClient.fetch).toHaveBeenCalledWith(
      'americas',
      '/riot/account/v1/accounts/by-riot-id/Foo%20Bar/NA1',
      { revalidateSeconds: 3600 }
    );
    expect(result.puuid).toBe('abc');
  });
});
