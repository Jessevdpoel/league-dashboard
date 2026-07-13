import { describe, it, expect } from 'vitest';
import {
  PROFILE_METRICS,
  profileMetricMeans,
  profileSkillScores,
  deriveCoachInsights,
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
    champLevel: 15, goldEarned: 10_000, totalDamageTaken: 15_000,
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

describe('deriveCoachInsights', () => {
  const tenGames = (deaths: number[]) =>
    deaths.map((d) =>
      p({ deaths: d, challenges: { laneMinionsFirst10Minutes: 50, damagePerMinute: 700 } })
    );

  it('returns empty below 5 games', () => {
    const lookup: BenchmarkLookup = () => 50;
    expect(deriveCoachInsights(tenGames([1, 2, 3, 4]), lookup, 'DIAMOND')).toEqual([]);
  });

  it('emits lever for the worst metric and strength for the best', () => {
    // csAt10 raw pct 20 (goodness 20 → lever), damagePerMin raw 90 (goodness 90 → strength)
    const lookup: BenchmarkLookup = (metric) =>
      metric === 'csAt10' ? 20 : metric === 'damagePerMin' ? 90 : 50;
    const insights = deriveCoachInsights(tenGames([4, 4, 4, 4, 4]), lookup, 'DIAMOND');
    expect(insights[0]).toEqual({
      kind: 'lever',
      message: 'CS at 10 sits at the ~20th percentile for DIAMOND — your biggest lever',
      good: false,
    });
    expect(insights[1]).toEqual({
      kind: 'strength',
      message: 'Damage/min sits at the ~90th percentile for DIAMOND',
      good: true,
    });
  });

  it('emits a deaths trend across halves of a 10-game window', () => {
    const lookup: BenchmarkLookup = () => 50; // no lever/strength triggers
    // newest-first: recent 5 avg 2 deaths, older 5 avg 4 deaths → down 50%
    const insights = deriveCoachInsights(
      tenGames([2, 2, 2, 2, 2, 4, 4, 4, 4, 4]),
      lookup,
      'DIAMOND'
    );
    expect(insights).toEqual([
      { kind: 'trend', message: 'Deaths per game down 50% over your last 5 games', good: true },
    ]);
  });

  it('stays silent when nothing crosses thresholds', () => {
    const lookup: BenchmarkLookup = () => 50;
    expect(deriveCoachInsights(tenGames([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), lookup, 'DIAMOND')).toEqual([]);
  });
});
