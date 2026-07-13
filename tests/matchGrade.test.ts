import { describe, expect, it } from 'vitest';
import { gradeMatch } from '@/lib/matchGrade';
import type { MatchDto, ParticipantDto } from '@/lib/riot/types';

let counter = 0;
function participant(overrides: Partial<ParticipantDto>): ParticipantDto {
  counter += 1;
  return {
    puuid: `p${counter}`,
    riotIdGameName: `Player${counter}`,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: 2,
    deaths: 4,
    assists: 6,
    win: counter <= 5,
    teamId: counter <= 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][(counter - 1) % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    totalMinionsKilled: 150,
    neutralMinionsKilled: 0,
    champLevel: 15,
    goldEarned: 10_000,
    totalDamageTaken: 15_000,
    damageDealtToObjectives: 2_000,
    ...overrides,
  };
}

function matchWith(participants: ParticipantDto[], gameDuration = 1800): MatchDto {
  return {
    metadata: { matchId: 'EUW1_TEST', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration, queueId: 420, participants },
  };
}

/** 10 identical players except overrides for the first (winning) and sixth (losing). */
function tenPlayers(first: Partial<ParticipantDto> = {}, sixth: Partial<ParticipantDto> = {}): ParticipantDto[] {
  counter = 0;
  return Array.from({ length: 10 }, (_, i) =>
    participant(i === 0 ? first : i === 5 ? sixth : {})
  );
}

describe('gradeMatch', () => {
  it('gives a clean sweep 10.0 and dead-last 0.0', () => {
    const players = tenPlayers(
      { totalDamageDealtToChampions: 99_999, kills: 20, assists: 20, deaths: 0, visionScore: 99, totalMinionsKilled: 400, goldEarned: 25_000, totalDamageTaken: 60_000, damageDealtToObjectives: 30_000 },
      { totalDamageDealtToChampions: 1, kills: 0, assists: 0, deaths: 20, visionScore: 1, totalMinionsKilled: 1, goldEarned: 1_000, totalDamageTaken: 1_000, damageDealtToObjectives: 0 }
    );
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(grades['p1'].score).toBe(10);
    expect(grades['p6'].score).toBe(0);
    expect(grades['p1'].ordinal).toBe(1);
    expect(grades['p6'].ordinal).toBe(10);
  });

  it('awards MVP to the best winner and ACE to the best loser', () => {
    const players = tenPlayers(
      { totalDamageDealtToChampions: 99_999, kills: 20, deaths: 0 },
      { totalDamageDealtToChampions: 50_000, kills: 15, deaths: 1 }
    );
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(grades['p1'].badge).toBe('MVP');
    expect(grades['p6'].badge).toBe('ACE');
    expect(grades['p2'].badge).toBeNull();
  });

  it('omits badges for remakes (gameDuration < 300)', () => {
    const grades = gradeMatch(matchWith(tenPlayers(), 250)).byPuuid;
    for (const grade of Object.values(grades)) expect(grade.badge).toBeNull();
  });

  it('omits badges when everyone has the same win value', () => {
    counter = 0;
    const players = Array.from({ length: 10 }, () => participant({ win: false }));
    const grades = gradeMatch(matchWith(players)).byPuuid;
    for (const grade of Object.values(grades)) expect(grade.badge).toBeNull();
  });

  it('shares the better ordinal between tied players', () => {
    const grades = gradeMatch(matchWith(tenPlayers())).byPuuid;
    // All 10 identical -> everyone ties at ordinal 1 with the same score.
    const all = Object.values(grades);
    expect(new Set(all.map((g) => g.ordinal))).toEqual(new Set([1]));
    expect(new Set(all.map((g) => g.score)).size).toBe(1);
  });

  it('handles zero team kills without NaN', () => {
    counter = 0;
    const players = Array.from({ length: 10 }, () => participant({ kills: 0, assists: 0 }));
    const grades = gradeMatch(matchWith(players)).byPuuid;
    for (const grade of Object.values(grades)) expect(Number.isFinite(grade.score)).toBe(true);
  });

  it('treats missing optional fields as 0', () => {
    const players = tenPlayers({ totalMinionsKilled: undefined, neutralMinionsKilled: undefined, damageDealtToObjectives: undefined });
    const grades = gradeMatch(matchWith(players)).byPuuid;
    expect(Number.isFinite(grades['p1'].score)).toBe(true);
  });
});
