import type { MatchDto, ParticipantDto } from './riot/types';

export interface ChampionStat {
  championName: string;
  games: number;
  wins: number;
}

export function computeTopChampions(participants: ParticipantDto[], limit = 3): ChampionStat[] {
  const byChampion = new Map<string, ChampionStat>();
  for (const participant of participants) {
    const existing = byChampion.get(participant.championName) ?? {
      championName: participant.championName,
      games: 0,
      wins: 0,
    };
    existing.games += 1;
    if (participant.win) existing.wins += 1;
    byChampion.set(participant.championName, existing);
  }
  return [...byChampion.values()].sort((a, b) => b.games - a.games).slice(0, limit);
}

export interface MatchSummary {
  matchId: string;
  championName: string;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
  items: number[];
  durationSeconds: number;
  queueId: number;
  gameCreation: number;
}

export function toMatchSummary(match: MatchDto, puuid: string): MatchSummary {
  const participant = match.info.participants.find((p) => p.puuid === puuid);
  if (!participant) {
    throw new Error(`Player ${puuid} not found in match ${match.metadata.matchId}`);
  }
  return {
    matchId: match.metadata.matchId,
    championName: participant.championName,
    kills: participant.kills,
    deaths: participant.deaths,
    assists: participant.assists,
    win: participant.win,
    items: [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ],
    durationSeconds: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
  };
}
