import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MatchScoreboard } from '../../components/MatchScoreboard';
import type { MatchDto, ParticipantDto } from '../../lib/riot/types';

function fakeParticipant(overrides: Partial<ParticipantDto>): ParticipantDto {
  return {
    puuid: 'p1',
    riotIdGameName: 'Player',
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

describe('MatchScoreboard', () => {
  it('splits participants into Blue Team and Red Team tables with champion icons', () => {
    const match: MatchDto = {
      metadata: { matchId: 'NA1_1', participants: [] },
      info: {
        gameCreation: 0,
        gameDuration: 0,
        queueId: 420,
        participants: [
          fakeParticipant({ puuid: 'blue1', riotIdGameName: 'BluePlayer', teamId: 100 }),
          fakeParticipant({ puuid: 'red1', riotIdGameName: 'RedPlayer', teamId: 200 }),
        ],
      },
    };
    render(<MatchScoreboard match={match} version="14.23.1" />);
    expect(screen.getByText('Blue Team')).toBeInTheDocument();
    expect(screen.getByText('Red Team')).toBeInTheDocument();
    expect(screen.getByText('BluePlayer#NA1')).toBeInTheDocument();
    expect(screen.getByText('RedPlayer#NA1')).toBeInTheDocument();
    expect(screen.getAllByAltText('Ahri')).toHaveLength(2);
  });
});
