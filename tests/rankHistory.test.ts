import { describe, it, expect } from 'vitest';
import { rankValue, shouldRecordSnapshot, dailyRankSeries } from '../lib/rankHistory';

const d = (iso: string) => new Date(iso);

describe('rankValue', () => {
  it('orders tiers, divisions and LP monotonically', () => {
    const d4 = rankValue({ tier: 'DIAMOND', division: 'IV', leaguePoints: 0 });
    const d3 = rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 0 });
    const e1 = rankValue({ tier: 'EMERALD', division: 'I', leaguePoints: 99 });
    expect(d3).toBeGreaterThan(d4);
    expect(d4).toBeGreaterThan(e1);
    expect(rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 59 })).toBe(d3 + 59);
  });
});

describe('shouldRecordSnapshot', () => {
  const latest = { tier: 'DIAMOND', division: 'III', leaguePoints: 59, recordedAt: d('2026-07-10T08:00:00Z') };
  it('records when there is no prior snapshot', () => {
    expect(shouldRecordSnapshot(null, latest, d('2026-07-10T09:00:00Z'))).toBe(true);
  });
  it('skips same-day identical values', () => {
    expect(shouldRecordSnapshot(latest, latest, d('2026-07-10T22:00:00Z'))).toBe(false);
  });
  it('records same-day LP changes and new days', () => {
    expect(shouldRecordSnapshot(latest, { ...latest, leaguePoints: 75 }, d('2026-07-10T22:00:00Z'))).toBe(true);
    expect(shouldRecordSnapshot(latest, latest, d('2026-07-11T00:30:00Z'))).toBe(true);
  });
});

describe('dailyRankSeries', () => {
  it('keeps the last snapshot per UTC day, chronological', () => {
    const points = [
      { tier: 'DIAMOND', division: 'IV', leaguePoints: 80, recordedAt: d('2026-07-08T10:00:00Z') },
      { tier: 'DIAMOND', division: 'IV', leaguePoints: 95, recordedAt: d('2026-07-08T20:00:00Z') },
      { tier: 'DIAMOND', division: 'III', leaguePoints: 10, recordedAt: d('2026-07-09T18:00:00Z') },
    ];
    const series = dailyRankSeries(points, 30, d('2026-07-10T12:00:00Z'));
    expect(series).toEqual([
      rankValue({ tier: 'DIAMOND', division: 'IV', leaguePoints: 95 }),
      rankValue({ tier: 'DIAMOND', division: 'III', leaguePoints: 10 }),
    ]);
  });
  it('drops points outside the window and handles empty input', () => {
    const old = [{ tier: 'GOLD', division: 'I', leaguePoints: 1, recordedAt: d('2026-05-01T00:00:00Z') }];
    expect(dailyRankSeries(old, 30, d('2026-07-10T00:00:00Z'))).toEqual([]);
    expect(dailyRankSeries([], 30, d('2026-07-10T00:00:00Z'))).toEqual([]);
  });
});
