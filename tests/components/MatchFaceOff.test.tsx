import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchFaceOff, lanePairs } from '@/components/match/MatchFaceOff';
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
    kills: 2, deaths: 4, assists: 6,
    win: counter <= 5,
    teamId: counter <= 5 ? 100 : 200,
    teamPosition: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'][(counter - 1) % 5],
    item0: 0, item1: 0, item2: 0, item3: 0, item4: 0, item5: 0, item6: 0,
    summoner1Id: 4, summoner2Id: 7,
    totalDamageDealtToChampions: 10_000,
    visionScore: 20,
    totalMinionsKilled: 150,
    champLevel: 15,
    goldEarned: 10_000,
    totalDamageTaken: 15_000,
    ...overrides,
  };
}

function tenPlayerMatch(): MatchDto {
  counter = 0;
  const participants = Array.from({ length: 10 }, () => participant({}));
  return {
    metadata: { matchId: 'EUW1_T', participants: participants.map((p) => p.puuid) },
    info: { gameCreation: 0, gameDuration: 1800, queueId: 420, participants },
  };
}

describe('lanePairs', () => {
  it('pairs lane opponents by teamPosition in role order', () => {
    const match = tenPlayerMatch();
    const pairs = lanePairs(match.info.participants);
    expect(pairs).toHaveLength(5);
    expect(pairs[0].role).toBe('TOP');
    expect(pairs[0].blue.puuid).toBe('p1');
    expect(pairs[0].red.puuid).toBe('p6');
  });

  it('falls back to index pairing when positions are missing', () => {
    const match = tenPlayerMatch();
    const stripped = match.info.participants.map((p) => ({ ...p, teamPosition: undefined }));
    const pairs = lanePairs(stripped);
    expect(pairs).toHaveLength(5);
    expect(pairs.every((pair) => pair.role === null)).toBe(true);
  });
});

describe('MatchFaceOff', () => {
  it('renders all players, highlights the viewer, and shows rank + MVP', () => {
    const match = tenPlayerMatch();
    match.info.participants[0].totalDamageDealtToChampions = 99_999; // p1 = MVP
    const grades = gradeMatch(match);
    render(
      <MatchFaceOff
        match={match}
        grades={grades}
        ranks={{ p1: { tier: 'DIAMOND', division: 'III' } }}
        version="14.23.1"
        viewerPuuid="p4"
      />
    );
    expect(screen.getByText('Player1')).toBeInTheDocument();
    expect(screen.getByText('Player10')).toBeInTheDocument();
    expect(screen.getByText('MVP')).toBeInTheDocument();
    expect(screen.getByText('D3')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-row-p4')).toBeInTheDocument();
  });
});
