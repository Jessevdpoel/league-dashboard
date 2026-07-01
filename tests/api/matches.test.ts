import { describe, it, expect, vi } from 'vitest';
import { GET } from '../../app/api/matches/[matchId]/route';
import { getMatchById } from '../../lib/riot/match';
import { RiotApiError } from '../../lib/riot/client';

vi.mock('../../lib/riot/match', () => ({ getMatchById: vi.fn() }));

describe('GET /api/matches/[matchId]', () => {
  it('returns match JSON for a known match id', async () => {
    (getMatchById as ReturnType<typeof vi.fn>).mockResolvedValue({
      metadata: { matchId: 'NA1_1', participants: [] },
      info: { gameCreation: 0, gameDuration: 0, queueId: 420, participants: [] },
    });
    const response = await GET(new Request('http://localhost/api/matches/NA1_1'), {
      params: { matchId: 'NA1_1' },
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metadata.matchId).toBe('NA1_1');
    expect(getMatchById).toHaveBeenCalledWith('na1', 'NA1_1');
  });

  it('returns 404 when Riot reports the match was not found', async () => {
    (getMatchById as ReturnType<typeof vi.fn>).mockRejectedValue(new RiotApiError('Not found', 404));
    const response = await GET(new Request('http://localhost/api/matches/NA1_2'), {
      params: { matchId: 'NA1_2' },
    });
    expect(response.status).toBe(404);
  });

  it('returns 500 for an unrecognized match id prefix', async () => {
    const response = await GET(new Request('http://localhost/api/matches/ZZ9_1'), {
      params: { matchId: 'ZZ9_1' },
    });
    expect(response.status).toBe(500);
  });
});
