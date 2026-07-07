import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../app/api/riot-ids/suggest/route';
import { suggestRiotIds } from '../../lib/riotIdIndexStore';

vi.mock('../../lib/riotIdIndexStore', () => ({ suggestRiotIds: vi.fn() }));
const suggestMock = suggestRiotIds as ReturnType<typeof vi.fn>;

describe('GET /api/riot-ids/suggest', () => {
  beforeEach(() => {
    suggestMock.mockReset();
  });

  it('returns suggestions for a valid region and query', async () => {
    suggestMock.mockResolvedValue([{ gameName: 'Faker', tagLine: 'KR1' }]);
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=kr'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [{ gameName: 'Faker', tagLine: 'KR1' }] });
    expect(suggestMock).toHaveBeenCalledWith('kr', 'Fak');
  });

  it('returns an empty list without querying for an unknown region', async () => {
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=mars'));
    expect(await response.json()).toEqual({ suggestions: [] });
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it('returns an empty list without querying when q is shorter than 2 chars', async () => {
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=F&region=kr'));
    expect(await response.json()).toEqual({ suggestions: [] });
    expect(suggestMock).not.toHaveBeenCalled();
  });

  it('degrades to an empty list when the store throws', async () => {
    suggestMock.mockRejectedValue(new Error('db down'));
    const response = await GET(new Request('http://localhost/api/riot-ids/suggest?q=Fak&region=kr'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ suggestions: [] });
  });
});
