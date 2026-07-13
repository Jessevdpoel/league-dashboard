import { describe, expect, it } from 'vitest';
import { buildMatchDetailPayload } from '@/lib/matchDetail';
import type { LeagueEntryDto, MatchDto, ParticipantDto } from '@/lib/riot/types';

function participant(puuid: string, teamId: number): ParticipantDto {
  return {
    puuid,
    riotIdGameName: puuid,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: 1, deaths: 1, assists: 1,
    win: teamId === 100,
    teamId,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 1000,
    visionScore: 10,
    champLevel: 10,
    goldEarned: 5000,
    totalDamageTaken: 5000,
  };
}

const match: MatchDto = {
  metadata: { matchId: 'EUW1_1', participants: ['a', 'b'] },
  info: {
    gameCreation: 0,
    gameDuration: 1800,
    queueId: 420,
    participants: [participant('a', 100), participant('b', 200)],
  },
};

const soloEntry = (tier: string, rank: string): LeagueEntryDto =>
  ({ queueType: 'RANKED_SOLO_5x5', tier, rank, leaguePoints: 10, wins: 1, losses: 1 }) as LeagueEntryDto;

describe('buildMatchDetailPayload', () => {
  it('summarizes solo-queue entries into tier/division', async () => {
    const payload = await buildMatchDetailPayload(match, async () => [soloEntry('DIAMOND', 'III')]);
    expect(payload.ranks['a']).toEqual({ tier: 'DIAMOND', division: 'III' });
  });

  it('yields null for players without a solo entry', async () => {
    const flexOnly = { ...soloEntry('GOLD', 'I'), queueType: 'RANKED_FLEX_SR' } as LeagueEntryDto;
    const payload = await buildMatchDetailPayload(match, async () => [flexOnly]);
    expect(payload.ranks['a']).toBeNull();
  });

  it('yields null (not a rejection) when a lookup fails', async () => {
    const payload = await buildMatchDetailPayload(match, async (puuid) => {
      if (puuid === 'a') throw new Error('429');
      return [soloEntry('SILVER', 'II')];
    });
    expect(payload.ranks['a']).toBeNull();
    expect(payload.ranks['b']).toEqual({ tier: 'SILVER', division: 'II' });
  });

  it('yields all-null ranks with a null fetcher and still grades', async () => {
    const payload = await buildMatchDetailPayload(match, null);
    expect(payload.ranks).toEqual({ a: null, b: null });
    expect(payload.grades.byPuuid['a']).toBeDefined();
    expect(payload.grades.byPuuid['b']).toBeDefined();
  });
});
