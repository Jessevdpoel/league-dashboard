import { describe, it, expect } from 'vitest';
import {
  PROFILE_METRICS,
  profileMetricMeans,
  profileSkillScores,
} from '../../lib/analysis/coachInsights';
import type { BenchmarkLookup } from '../../lib/analysis/metrics';
import type { ParticipantDto } from '../../lib/riot/types';

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

describe('profileMetricMeans', () => {
  it('averages available challenge values and skips missing ones', () => {
    const means = profileMetricMeans([
      p({ deaths: 4, challenges: { laneMinionsFirst10Minutes: 60 } }),
      p({ deaths: 6, challenges: {} }),
    ]);
    expect(means.deaths).toBe(5);
    expect(means.csAt10).toBe(60); // only one sample
    expect(means.damagePerMin).toBeUndefined(); // zero samples
  });
});

describe('profileSkillScores', () => {
  it('direction-adjusts and buckets per category', () => {
    // Lookup: everything sits at raw percentile 80.
    const lookup: BenchmarkLookup = () => 80;
    const scores = profileSkillScores(
      [p({ deaths: 3, challenges: { laneMinionsFirst10Minutes: 70, damagePerMinute: 600 } })],
      lookup
    );
    expect(scores.laning).toBe(80);
    expect(scores.fighting).toBe(80);
    expect(scores.survivability).toBe(20); // deaths: higher is worse → 100-80
    expect(scores.vision).toBeNull(); // no vision samples
  });

  it('returns all-null when the lookup has no rows', () => {
    const lookup: BenchmarkLookup = () => undefined;
    const scores = profileSkillScores([p({})], lookup);
    for (const key of ['laning', 'vision', 'fighting', 'survivability'] as const) {
      expect(scores[key]).toBeNull();
    }
  });
});

it('PROFILE_METRICS contains only timeline-free metrics', () => {
  expect(PROFILE_METRICS).not.toContain('goldDiffAt10');
  expect(PROFILE_METRICS).toContain('deaths');
});
