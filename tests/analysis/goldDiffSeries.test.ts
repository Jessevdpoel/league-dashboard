import { describe, expect, it } from 'vitest';
import { extractGoldDiffSeries } from '../../lib/analysis/timelineFacts';
import type { MatchTimelineDto } from '../../lib/riot/types';

function timelineWith(frames: Array<Record<string, { totalGold: number }>>): MatchTimelineDto {
  return {
    metadata: { matchId: 'TEST_1', participants: ['p1', 'p2'] },
    info: {
      frameInterval: 60000,
      participants: [
        { participantId: 1, puuid: 'p1' },
        { participantId: 2, puuid: 'p2' },
      ],
      frames: frames.map((participantFrames, i) => ({
        timestamp: i * 60000,
        participantFrames,
        events: [],
      })),
    },
  } as unknown as MatchTimelineDto;
}

describe('extractGoldDiffSeries', () => {
  it('emits one point per frame with player-minus-opponent gold', () => {
    const timeline = timelineWith([
      { '1': { totalGold: 500 }, '2': { totalGold: 500 } },
      { '1': { totalGold: 900 }, '2': { totalGold: 700 } },
      { '1': { totalGold: 1200 }, '2': { totalGold: 1500 } },
    ]);
    expect(extractGoldDiffSeries(timeline, 'p1', 'p2')).toEqual([
      { minute: 0, gold: 0 },
      { minute: 1, gold: 200 },
      { minute: 2, gold: -300 },
    ]);
  });

  it('returns [] when there is no opponent', () => {
    const timeline = timelineWith([{ '1': { totalGold: 500 }, '2': { totalGold: 500 } }]);
    expect(extractGoldDiffSeries(timeline, 'p1', undefined)).toEqual([]);
  });

  it('returns [] when the opponent puuid is not in the timeline', () => {
    const timeline = timelineWith([{ '1': { totalGold: 500 }, '2': { totalGold: 500 } }]);
    expect(extractGoldDiffSeries(timeline, 'p1', 'ghost')).toEqual([]);
  });
});
