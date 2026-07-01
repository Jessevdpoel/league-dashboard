import { describe, it, expect } from 'vitest';
import { computeTopChampions, toMatchSummary } from '../lib/matchStats';
import type { MatchDto, ParticipantDto } from '../lib/riot/types';

function fakeParticipant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'me',
    riotIdGameName: 'Me',
    riotIdTagline: 'NA1',
    championName: 'Ahri',
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
      fakeParticipant({ puuid: 'me', championName: 'Ahri', kills: 5, deaths: 2, assists: 8, win: true })
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
      durationSeconds: 1500,
      queueId: 420,
      gameCreation: 1000,
    });
  });

  it('throws when the puuid is not a participant in the match', () => {
    const match = fakeMatch(fakeParticipant({ puuid: 'someone-else' }));
    expect(() => toMatchSummary(match, 'me')).toThrow();
  });
});
