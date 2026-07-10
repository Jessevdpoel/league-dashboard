import { describe, it, expect } from 'vitest';
import { computeTopChampions, toMatchSummary, computeRecentPerformance, computeChampionPool, bestChampionIndex } from '../lib/matchStats';
import type { MatchDto, ParticipantDto } from '../lib/riot/types';

function fakeParticipant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me',
    riotIdGameName: 'Me',
    riotIdTagline: 'NA1',
    championName: 'Ahri',
    championId: 1,
    kills: 1,
    deaths: 1,
    assists: 1,
    win: true,
    teamId: 100,
    item0: 0,
    item1: 0,
    item2: 0,
    item3: 0,
    item4: 0,
    item5: 0,
    item6: 0,
    summoner1Id: 4,
    summoner2Id: 7,
    totalDamageDealtToChampions: 1000,
    visionScore: 10,
    ...overrides,
  };
}

describe('computeTopChampions', () => {
  it('aggregates games and wins per champion, sorted by games descending', () => {
    const participants = [
      fakeParticipant({ championName: 'Ahri', win: true }),
      fakeParticipant({ championName: 'Ahri', win: false }),
      fakeParticipant({ championName: 'Lux', win: true }),
    ];
    const result = computeTopChampions(participants, 5);
    expect(result[0]).toEqual({ championName: 'Ahri', games: 2, wins: 1 });
    expect(result[1]).toEqual({ championName: 'Lux', games: 1, wins: 1 });
  });

  it('respects the limit', () => {
    const participants = [
      fakeParticipant({ championName: 'Ahri' }),
      fakeParticipant({ championName: 'Lux' }),
      fakeParticipant({ championName: 'Zed' }),
    ];
    expect(computeTopChampions(participants, 2)).toHaveLength(2);
  });
});

describe('toMatchSummary', () => {
  function fakeMatch(participant: ParticipantDto): MatchDto {
    return {
      metadata: { matchId: 'NA1_1', participants: [participant.puuid] },
      info: { gameCreation: 1000, gameDuration: 1500, queueId: 420, participants: [participant] },
    };
  }

  it('extracts the searched player as a MatchSummary', () => {
    const match = fakeMatch(
      fakeParticipant({
        puuid: 'me',
        championName: 'Ahri',
        kills: 5,
        deaths: 2,
        assists: 8,
        win: true,
        summoner1Id: 4,
        summoner2Id: 7,
      })
    );
    const summary = toMatchSummary(match, 'me');
    expect(summary).toEqual({
      matchId: 'NA1_1',
      championName: 'Ahri',
      kills: 5,
      deaths: 2,
      assists: 8,
      win: true,
      items: [0, 0, 0, 0, 0, 0, 0],
      summoner1Id: 4,
      summoner2Id: 7,
      durationSeconds: 1500,
      queueId: 420,
      gameCreation: 1000,
      role: null,
      cs: null,
      badge: null,
    });
  });

  it('throws when the puuid is not a participant in the match', () => {
    const match = fakeMatch(fakeParticipant({ puuid: 'someone-else' }));
    expect(() => toMatchSummary(match, 'me')).toThrow();
  });
});

describe('computeRecentPerformance', () => {
  it('aggregates wins, KDA and averages', () => {
    const result = computeRecentPerformance([
      p({ kills: 10, deaths: 5, assists: 10, win: true, challenges: { killParticipation: 0.6 } }),
      p({ kills: 2, deaths: 5, assists: 2, win: false, challenges: { killParticipation: 0.4 } }),
    ]);
    expect(result.games).toBe(2);
    expect(result.wins).toBe(1);
    expect(result.winRatePct).toBe(50);
    expect(result.kdaRatio).toBe(2.4); // (12+12)/10
    expect(result.avgKills).toBe(6);
    expect(result.avgKillParticipationPct).toBe(50);
  });

  it('counts streak from the most recent game', () => {
    const result = computeRecentPerformance([
      p({ win: true }), p({ win: true }), p({ win: false }),
    ]);
    expect(result.streak).toEqual({ result: 'win', count: 2 });
  });

  it('handles zero deaths and empty input', () => {
    expect(computeRecentPerformance([p({ kills: 3, deaths: 0, assists: 3 })]).kdaRatio).toBe(6);
    const empty = computeRecentPerformance([]);
    expect(empty.games).toBe(0);
    expect(empty.kdaRatio).toBeNull();
    expect(empty.streak).toBeNull();
    expect(empty.avgKillParticipationPct).toBeNull();
  });
});

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

function match(id: string, participant: ParticipantDto, durationSeconds = 1800): MatchDto {
  return {
    metadata: { matchId: id, participants: [participant.puuid] },
    info: { gameCreation: 0, gameDuration: durationSeconds, queueId: 420, participants: [participant] },
  };
}

describe('computeChampionPool', () => {
  it('aggregates per champion with kda and cs/min', () => {
    const pool = computeChampionPool(
      [
        match('m1', p({ championName: 'Aatrox', kills: 8, deaths: 2, assists: 4, win: true, totalMinionsKilled: 180, neutralMinionsKilled: 0 })),
        match('m2', p({ championName: 'Aatrox', kills: 2, deaths: 6, assists: 4, win: false, totalMinionsKilled: 150, neutralMinionsKilled: 30 })),
        match('m3', p({ championName: 'Fiora', kills: 5, deaths: 5, assists: 5, win: true })),
      ],
      'me'
    );
    expect(pool[0]).toMatchObject({ championName: 'Aatrox', games: 2, wins: 1, winRatePct: 50 });
    expect(pool[0].kda).toBe(2.25); // (10+8)/8
    expect(pool[0].csPerMin).toBe(6); // 360 cs / 60 min
    expect(pool[1].csPerMin).toBeNull(); // fields absent
  });

  it('picks best champion by winrate with >=3 games', () => {
    const pool = [
      { championName: 'A', games: 5, wins: 2, winRatePct: 40, kda: 2, csPerMin: 6 },
      { championName: 'B', games: 3, wins: 3, winRatePct: 100, kda: 3, csPerMin: 7 },
      { championName: 'C', games: 1, wins: 1, winRatePct: 100, kda: 9, csPerMin: 8 },
    ];
    expect(bestChampionIndex(pool)).toBe(1); // C excluded: fewer than 3 games
    expect(bestChampionIndex([])).toBe(-1);
    expect(bestChampionIndex([pool[2]])).toBe(0); // nobody qualifies → first
  });
});

describe('toMatchSummary extensions', () => {
  it('carries role, cs and badge', () => {
    const summary = toMatchSummary(
      match('m9', p({ teamPosition: 'TOP', totalMinionsKilled: 100, neutralMinionsKilled: 20, largestMultiKill: 2 })),
      'me'
    );
    expect(summary.role).toBe('TOP');
    expect(summary.cs).toBe(120);
    expect(summary.badge).toBe('DOUBLE KILL');
  });

  it('nulls cs and role when source fields absent', () => {
    const summary = toMatchSummary(match('m10', p({})), 'me');
    expect(summary.role).toBeNull();
    expect(summary.cs).toBeNull();
    expect(summary.badge).toBeNull();
  });
});
