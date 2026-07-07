import { describe, it, expect } from 'vitest';
import type {
  MatchDto,
  MatchTimelineDto,
  ParticipantDto,
  ParticipantFrameDto,
  TimelineEventDto,
  TimelineFrameDto,
} from '../../lib/riot/types';
import { extractTimelineFacts } from '../../lib/analysis/timelineFacts';
import { computeMetrics, type BenchmarkLookup } from '../../lib/analysis/metrics';
import { buildSingleMatchFactSheet } from '../../lib/analysis/factSheet';

// --- Synthetic fixture ----------------------------------------------------

function mkParticipant(over: Partial<ParticipantDto> & Pick<ParticipantDto, 'puuid'>): ParticipantDto {
  return {
    riotIdGameName: 'Player',
    riotIdTagline: 'EUW',
    championName: 'Champ',
    kills: 0,
    deaths: 0,
    assists: 0,
    win: false,
    teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4,
    summoner2Id: 14,
    totalDamageDealtToChampions: 20000,
    visionScore: 20,
    ...over,
  };
}

const PLAYER = 'P';
const OPP = 'O';
const ENEMY_JG = 'EJ';

function mkMatch(): MatchDto {
  return {
    metadata: { matchId: 'EUW1_TEST', participants: [PLAYER, OPP, ENEMY_JG] },
    info: {
      gameCreation: 0,
      gameDuration: 1920, // 32:00
      queueId: 420,
      participants: [
        mkParticipant({
          puuid: PLAYER,
          championName: 'Ahri',
          teamId: 100,
          teamPosition: 'MIDDLE',
          win: false,
          kills: 8,
          deaths: 5,
          assists: 4,
          challenges: {
            laneMinionsFirst10Minutes: 80,
            killParticipation: 0.65,
            teamDamagePercentage: 0.3,
            soloKills: 2,
            visionScorePerMinute: 1.6,
            damagePerMinute: 900,
            turretPlatesTaken: 2,
          },
        }),
        mkParticipant({ puuid: OPP, championName: 'Syndra', teamId: 200, teamPosition: 'MIDDLE', win: true }),
        mkParticipant({ puuid: ENEMY_JG, championName: 'LeeSin', teamId: 200, teamPosition: 'JUNGLE', win: true }),
      ],
    },
  };
}

function pf(participantId: number, totalGold: number, xp: number, cs: number): ParticipantFrameDto {
  return {
    participantId,
    currentGold: totalGold,
    totalGold,
    xp,
    level: 1,
    minionsKilled: cs,
    jungleMinionsKilled: 0,
    position: { x: 0, y: 0 },
  };
}

function frame(minute: number, gold: Record<number, number>, events: TimelineEventDto[] = []): TimelineFrameDto {
  return {
    timestamp: minute * 60_000,
    participantFrames: {
      '1': pf(1, gold[1] ?? 0, 0, 0),
      '6': pf(6, gold[6] ?? 0, 0, 0),
      '7': pf(7, gold[7] ?? 0, 0, 0),
    },
    events,
  };
}

function mkTimeline(): MatchTimelineDto {
  const events: TimelineEventDto[] = [
    { type: 'CHAMPION_KILL', timestamp: 6 * 60_000, victimId: 1, killerId: 7, assistingParticipantIds: [] },
    { type: 'CHAMPION_KILL', timestamp: 9 * 60_000, victimId: 1, killerId: 7, assistingParticipantIds: [] },
    { type: 'ITEM_PURCHASED', timestamp: 8 * 60_000, participantId: 1, itemId: 2055 },
    { type: 'WARD_PLACED', timestamp: 3 * 60_000, creatorId: 1, wardType: 'YELLOW_TRINKET' },
  ];
  return {
    metadata: { matchId: 'EUW1_TEST', participants: [PLAYER, OPP, ENEMY_JG] },
    info: {
      frameInterval: 60_000,
      participants: [
        { participantId: 1, puuid: PLAYER },
        { participantId: 6, puuid: OPP },
        { participantId: 7, puuid: ENEMY_JG },
      ],
      frames: [
        frame(0, {}),
        frame(5, { 1: 2600, 6: 2500 }),
        frame(10, { 1: 5400, 6: 5000 }),
        frame(14, { 1: 8000, 6: 7400 }),
        frame(20, { 1: 12000, 6: 11500 }, events),
      ],
    },
  };
}

// --- Tests ----------------------------------------------------------------

describe('extractTimelineFacts', () => {
  it('derives lane diffs, death buckets, and wards', () => {
    const facts = extractTimelineFacts(mkTimeline(), PLAYER, {
      opponentPuuid: OPP,
      rolesByParticipantId: { 7: 'JUNGLE' },
    });
    expect(facts.participantId).toBe(1);
    expect(facts.laneDiffs[10]?.gold).toBe(400);
    expect(facts.laneDiffs[14]?.gold).toBe(600);
    expect(facts.deathBuckets).toEqual({ pre14: 2, mid: 0, late: 0 });
    expect(facts.soloDeaths).toBe(2);
    expect(facts.deaths[0].killerRole).toBe('JUNGLE');
    expect(facts.wards.controlWardsPurchased).toBe(1);
    expect(facts.wards.firstControlWardMinute).toBe(8);
    expect(facts.wards.placed).toBe(1);
  });

  it('omits lane diffs when no opponent is supplied', () => {
    const facts = extractTimelineFacts(mkTimeline(), PLAYER);
    expect(facts.laneDiffs[10]).toBeUndefined();
  });
});

describe('computeMetrics', () => {
  it('reports raw values with no band when no benchmark is provided', () => {
    const facts = extractTimelineFacts(mkTimeline(), PLAYER, { opponentPuuid: OPP });
    const { metrics, scores } = computeMetrics(mkMatch(), PLAYER, facts);
    expect(metrics.csAt10.value).toBe(80);
    expect(metrics.csAt10.band).toBeUndefined();
    expect(scores.laning).toBeNull();
  });

  it('direction-adjusts percentiles into bands (low deaths percentile = good)', () => {
    const facts = extractTimelineFacts(mkTimeline(), PLAYER, { opponentPuuid: OPP });
    // Player is at the 90th percentile for every raw value.
    const benchmark: BenchmarkLookup = () => 90;
    const { metrics } = computeMetrics(mkMatch(), PLAYER, facts, benchmark);
    // csAt10 is higher-is-better: 90th percentile -> excellent.
    expect(metrics.csAt10.band).toBe('excellent');
    // deaths is lower-is-better: 90th percentile of deaths -> goodness 10 -> weak.
    expect(metrics.deaths.percentile).toBe(10);
    expect(metrics.deaths.band).toBe('weak');
  });
});

describe('buildSingleMatchFactSheet', () => {
  it('assembles a grounded fact sheet with strengths, improvements, and a focus', () => {
    const sheet = buildSingleMatchFactSheet(mkMatch(), mkTimeline(), PLAYER, {
      rank: 'GOLD II',
      patch: '26.13',
    });
    expect(sheet.context).toMatchObject({
      champion: 'Ahri',
      role: 'MIDDLE',
      result: 'loss',
      opponent: 'Syndra',
      durationMinutes: 32,
    });
    const ids = sheet.findings.map((f) => f.id).sort();
    expect(ids).toEqual(
      [
        'carry_performance',
        'early_deaths_to_ganks',
        'lead_no_convert',
        'strong_laning',
        'strong_teamfighting',
        'vision_control',
      ].sort()
    );
    // No benchmarks -> focus falls to the highest-severity improvement category.
    expect(sheet.focusCategory).toBe('survivability');
    // Every finding carries the numbers it fired on (grounding guarantee).
    const gank = sheet.findings.find((f) => f.id === 'early_deaths_to_ganks');
    expect(gank?.data.deaths_pre14).toBe(2);
    expect(gank?.data.gank_death_minutes).toEqual([6, 9]);
  });
});
