import { describe, it, expect } from 'vitest';
import {
  normalizeGameName,
  observationsFromMatch,
  mergeObservations,
} from '../lib/riotIdIndex';
import type { MatchDto, ParticipantDto } from '../lib/riot/types';

function participant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'p1',
    riotIdGameName: 'Faker',
    riotIdTagline: 'KR1',
    championName: 'Azir',
    kills: 0,
    deaths: 0,
    assists: 0,
    win: true,
    teamId: 100,
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4,
    summoner2Id: 12,
    totalDamageDealtToChampions: 0,
    visionScore: 0,
    ...overrides,
  };
}

function match(gameCreation: number, participants: ParticipantDto[]): MatchDto {
  return {
    metadata: { matchId: 'KR_1', participants: participants.map((p) => p.puuid) },
    info: { gameCreation, gameDuration: 1800, queueId: 420, participants },
  };
}

describe('normalizeGameName', () => {
  it('lowercases, trims, and applies NFKC so lookups are width/case-insensitive', () => {
    expect(normalizeGameName('  FaKer ')).toBe('faker');
    expect(normalizeGameName('Ｆａｋｅｒ')).toBe('faker'); // fullwidth → NFKC → ascii
  });
});

describe('observationsFromMatch', () => {
  it('extracts one observation per participant stamped with gameCreation', () => {
    const m = match(1_700_000_000_000, [
      participant({ puuid: 'p1', riotIdGameName: 'Faker', riotIdTagline: 'KR1' }),
      participant({ puuid: 'p2', riotIdGameName: 'Zeus', riotIdTagline: 'T1' }),
    ]);
    expect(observationsFromMatch(m)).toEqual([
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 1_700_000_000_000 },
      { puuid: 'p2', gameName: 'Zeus', tagLine: 'T1', observedAtMs: 1_700_000_000_000 },
    ]);
  });

  it('skips participants with a missing name or tag (old matches / bots)', () => {
    const m = match(1, [participant({ puuid: 'p1', riotIdGameName: '', riotIdTagline: 'KR1' })]);
    expect(observationsFromMatch(m)).toEqual([]);
  });
});

describe('mergeObservations', () => {
  it('dedupes by puuid, counts occurrences, and keeps the newest name', () => {
    const rows = mergeObservations('kr', [
      { puuid: 'p1', gameName: 'OldName', tagLine: 'OLD', observedAtMs: 100 },
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 200 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      puuid: 'p1',
      region: 'kr',
      gameName: 'Faker',
      gameNameNormalized: 'faker',
      tagLine: 'KR1',
      seenCount: 2,
      lastSeenAt: new Date(200),
    });
  });

  it('does not let an older observation overwrite a newer name', () => {
    const rows = mergeObservations('kr', [
      { puuid: 'p1', gameName: 'Faker', tagLine: 'KR1', observedAtMs: 200 },
      { puuid: 'p1', gameName: 'OldName', tagLine: 'OLD', observedAtMs: 100 },
    ]);
    expect(rows[0]).toMatchObject({ gameName: 'Faker', tagLine: 'KR1', seenCount: 2 });
  });
});
