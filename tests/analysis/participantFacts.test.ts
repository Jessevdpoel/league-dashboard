import { describe, it, expect } from 'vitest';
import { extractMatchFacts } from '../../lib/analysis/participantFacts';
import type { MatchDto, MatchTimelineDto, ParticipantDto } from '../../lib/riot/types';

const ROLES = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'] as const;

function mkParticipant(i: number): ParticipantDto {
  return {
    puuid: `p${i}`,
    riotIdGameName: `Player${i}`,
    riotIdTagline: 'EUW',
    championName: 'Ahri',
    championId: 103,
    kills: i,
    deaths: 2,
    assists: 3,
    win: i < 5,
    teamId: i < 5 ? 100 : 200,
    teamPosition: ROLES[i % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4,
    summoner2Id: 12,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    challenges: { laneMinionsFirst10Minutes: 60 + i, killParticipation: 0.5 },
  };
}

function mkMatch(over: Partial<MatchDto['info']> = {}): MatchDto {
  const participants = Array.from({ length: 10 }, (_, i) => mkParticipant(i));
  return {
    metadata: { matchId: 'EUW1_1', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId: 420, participants, ...over },
  };
}

function mkTimeline(): MatchTimelineDto {
  return {
    metadata: { matchId: 'EUW1_1', participants: [] },
    info: {
      frameInterval: 60_000,
      frames: [{ timestamp: 0, participantFrames: {}, events: [] }],
      participants: Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, puuid: `p${i}` })),
    },
  };
}

const OPTS = { patch: '26.13', rankTier: 'GOLD' };

describe('extractMatchFacts', () => {
  it('produces one row per participant with cohort tags and metrics', () => {
    const rows = extractMatchFacts(mkMatch(), mkTimeline(), OPTS);
    expect(rows).toHaveLength(10);
    expect(rows[0]).toMatchObject({
      matchId: 'EUW1_1',
      puuid: 'p0',
      role: 'TOP',
      championId: 103,
      patch: '26.13',
      rankTier: 'GOLD',
    });
    // Raw challenge metric flows through per participant.
    expect(rows[3].metrics.csAt10).toBe(63);
    expect(rows[0].metrics.deaths).toBe(2);
  });

  it('returns [] for non ranked-solo queues', () => {
    expect(extractMatchFacts(mkMatch({ queueId: 440 }), mkTimeline(), OPTS)).toEqual([]);
  });

  it('returns [] for remakes / games under 14 minutes', () => {
    expect(extractMatchFacts(mkMatch({ gameDuration: 700 }), mkTimeline(), OPTS)).toEqual([]);
  });

  it('skips participants with no teamPosition', () => {
    const match = mkMatch();
    match.info.participants[9] = { ...match.info.participants[9], teamPosition: '' };
    expect(extractMatchFacts(match, mkTimeline(), OPTS)).toHaveLength(9);
  });
});
