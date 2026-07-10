import { describe, it, expect } from 'vitest';
import { performanceBadge } from '../lib/matchBadges';
import type { ParticipantDto } from '../lib/riot/types';

function p(over: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me', riotIdGameName: 'a', riotIdTagline: 'b',
    championName: 'Aatrox', championId: 266,
    kills: 5, deaths: 4, assists: 6, win: true, teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 14,
    totalDamageDealtToChampions: 20000, visionScore: 20,
    ...over,
  };
}

describe('performanceBadge', () => {
  it('ranks multikills above solo kills above first blood', () => {
    expect(performanceBadge(p({ largestMultiKill: 5 }))).toBe('PENTA KILL');
    expect(performanceBadge(p({ largestMultiKill: 3, challenges: { soloKills: 4 } }))).toBe('TRIPLE KILL');
    expect(performanceBadge(p({ challenges: { soloKills: 2 }, firstBloodKill: true }))).toBe('SOLO KILL ×2');
    expect(performanceBadge(p({ firstBloodKill: true }))).toBe('FIRST BLOOD');
    expect(performanceBadge(p({ largestMultiKill: 2 }))).toBe('DOUBLE KILL');
    expect(performanceBadge(p({}))).toBeNull();
  });
});
