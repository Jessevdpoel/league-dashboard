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
  summoner1Id: number;
  summoner2Id: number;
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
    summoner1Id: participant.summoner1Id,
    summoner2Id: participant.summoner2Id,
    durationSeconds: match.info.gameDuration,
    queueId: match.info.queueId,
    gameCreation: match.info.gameCreation,
  };
}

export interface RecentPerformance {
  games: number;
  wins: number;
  losses: number;
  winRatePct: number;
  kdaRatio: number | null;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKillParticipationPct: number | null;
  streak: { result: 'win' | 'loss'; count: number } | null;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** `participants` ordered newest-first (the order the match-id list arrives in). */
export function computeRecentPerformance(participants: ParticipantDto[]): RecentPerformance {
  const games = participants.length;
  if (games === 0) {
    return {
      games: 0, wins: 0, losses: 0, winRatePct: 0, kdaRatio: null,
      avgKills: 0, avgDeaths: 0, avgAssists: 0,
      avgKillParticipationPct: null, streak: null,
    };
  }
  const wins = participants.filter((p) => p.win).length;
  const kills = participants.reduce((s, p) => s + p.kills, 0);
  const deaths = participants.reduce((s, p) => s + p.deaths, 0);
  const assists = participants.reduce((s, p) => s + p.assists, 0);
  const kps = participants
    .map((p) => p.challenges?.killParticipation)
    .filter((v): v is number => v !== undefined);

  let count = 1;
  const first = participants[0].win;
  while (count < games && participants[count].win === first) count++;

  return {
    games,
    wins,
    losses: games - wins,
    winRatePct: Math.round((wins / games) * 100),
    kdaRatio: round1((kills + assists) / Math.max(deaths, 1)),
    avgKills: round1(kills / games),
    avgDeaths: round1(deaths / games),
    avgAssists: round1(assists / games),
    avgKillParticipationPct: kps.length
      ? Math.round((kps.reduce((a, b) => a + b, 0) / kps.length) * 100)
      : null,
    streak: { result: first ? 'win' : 'loss', count },
  };
}
